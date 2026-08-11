/**
 * Deploy state machine — extracted from transaction.ts (TRADE-02 PR-3).
 *
 * Owns the orchestration methods that deploy Rain-orderbook strategies
 * (limit / DCA / DSF / folio), wrap/unwrap operations, and order/wallet
 * withdrawals: handleStrategyDeployment, showRainlangConfirmation,
 * handleDsfDeploy, handleDcaDeploy, handleLimitDeploy, handleFolioDeploy,
 * handleWithdraw, handleRemoveOrder, handleWithdrawFromOrder, handleWrapUnwrap.
 *
 * This module is consumed by:
 *   - src/lib/stores/transaction.ts (re-exports for UI back-compat).
 *
 * This module MUST NOT import from $lib/stores/marketTakeStore — deploy and
 * market-take are sibling state machines that share the leaf (transactionShared)
 * but do not depend on each other.
 */

import { get } from 'svelte/store';
import { decodeFunctionData, erc20Abi, type Hash, type Hex } from 'viem';
import { readContract as wagmiReadContract } from '@wagmi/core';
import { wagmiConfig } from 'svelte-wagmi';
import { type DeploymentTransactionArgs, type RaindexVault } from '@rainlanguage/raindex';
import {
	sendTransaction as walletServiceSendTransaction,
	waitForTransaction as walletServiceWaitForTransaction
} from '$lib/services/walletService';
import { withRetry } from '$lib/utils/retry';
import {
	getDcaDeploymentArgs,
	getLimitOrderDeploymentArgs,
	getMarketMakingDeploymentArgs,
	getFolioDeploymentArgs,
	type FolioDeploymentArgs,
	type DcaDeploymentArgs,
	type LimitOrderDeploymentArgs,
	type MarketMakingDeploymentArgs,
	type DeployEventContext
} from '$lib/services/orderDeployment';
import { wrapToken, unwrapToken } from '$lib/services/wrapService';
import { track } from '$lib/services/analytics';
import { trackTradeEvent } from '$lib/services/observability/tradeEvents';
import { clearTradeId, setTradeId } from '$lib/services/observability/tradeId';
import {
	addTradeFlowBreadcrumb,
	captureTradeFlowError,
	inferWalletFailureStage,
	type TradeFlowContext,
	type TradeFlowStage
} from '$lib/services/observability/tradeFlow';
import { createRaindexClient } from '$lib/clients/raindex';
import { invalidateOrderQueries } from '$lib/queries/orderbook';
import { invalidateUserVaultQueries } from '$lib/queries/vaults';
import { invalidateDashboardBalances } from '$lib/queries/balances';
import { walletAddress } from '$lib/stores/authStore';
import { currentNetwork } from '$lib/stores';
import type { Network } from '$lib/config/network';
import { rainlangConfirmationModal, reviewStrategyOnDeploy } from '$lib/stores';
import { getRaindexOrderUrl, getRaindexVaultUrl, isPaymentToken } from '$lib/utils/tokenMath';
import { ZERO_FLOAT_HEX } from '$lib/config/constants';
import { getMakerOutputTokenAddress, getMakerInputTokenAddress } from '$lib/types/orderPerspective';
import { TransactionErrorMessage } from '$lib/types/errors';
import { toUserFacingTradeError } from '$lib/services/tradeError';
import { isStaleWalletSessionError, handleStaleWalletSession } from '$lib/utils/walletUtils';
import {
	transactionStoreInternal,
	classifyError,
	validateOrderbookAddress,
	extractTransactionError,
	type TransactionMetadata,
	type RaindexLink,
	type AssetTokenInfo
} from './transactionShared';
import { ensureAllowance } from './approvalStore';

/** Confirmations required before submitting the next market-take leg. */
const TAKE_TX_CONFIRMATIONS = 1;

// Wrapped wagmi functions with retry logic
const readContract: typeof wagmiReadContract = ((...args: Parameters<typeof wagmiReadContract>) =>
	withRetry(() => wagmiReadContract(...args))) as typeof wagmiReadContract;

// Unified send transaction (works with both Dynamic and wagmi wallets)
const sendTransaction = walletServiceSendTransaction;

// Unified wait for transaction (works with both Dynamic and wagmi wallets, includes retry logic)
const waitForTransaction = walletServiceWaitForTransaction;

function deployFlowContext(
	eventContext: DeployEventContext | undefined,
	stage: TradeFlowStage,
	operation: string,
	chainId?: number
): TradeFlowContext | null {
	if (!eventContext) return null;
	return {
		stage,
		operation,
		orderType: eventContext.order_type,
		orderSide: eventContext.order_side,
		tradeId: eventContext.trade_id,
		chainId,
		assetSymbol: eventContext.asset_symbol,
		paymentSymbol: eventContext.payment_symbol
	};
}

function reportDeployFailure(
	error: unknown,
	eventContext: DeployEventContext | undefined,
	stage: TradeFlowStage,
	operation: string,
	chainId?: number
): void {
	const context = deployFlowContext(eventContext, stage, operation, chainId);
	if (context) captureTradeFlowError(error, context);
}

// Destructure the leaf-owned status-helper surface so the lifted method bodies
// below can keep calling `awaitWalletConfirmation(...)` etc. unchanged. This
// mirrors the destructure seam in marketTakeStore.ts (TRADE-02 PR-2).
// `awaitApprovalTx` is no longer destructured here — approval tx submission
// has moved into `./approvalStore.ts` (TRADE-02 PR-4); the only remaining
// approval-status transition this module owns is the
// `awaitWalletConfirmation('Awaiting wallet confirmation to approve {symbol}...')`
// pre-message, which `ensureAllowance` then overwrites with CHECKING_ALLOWANCE /
// PENDING_APPROVAL via its setStatus callback.
const {
	reset,
	checkingWalletAllowance,
	awaitWalletConfirmation,
	transactionSuccess,
	transactionError
} = transactionStoreInternal;

/** Preserve the original failure long enough to retain typed codes and request IDs. */
function setDeployTransactionError(
	error: unknown,
	eventContext: DeployEventContext | undefined,
	stage: TradeFlowStage,
	message: TransactionErrorMessage = extractTransactionError(error),
	hash?: string
): void {
	transactionError(message, hash, eventContext ? toUserFacingTradeError(error, stage) : undefined);
}

// Find a vault by matching both vault ID and token address
// Vault IDs can be decimal strings or hex strings, so we check both formats
function findVaultByIdAndToken(
	vaults: RaindexVault[],
	vaultId: string | undefined,
	tokenAddress: string | undefined
): RaindexVault | undefined {
	if (!vaultId) return undefined;

	let normalizedVaultId: bigint;
	try {
		normalizedVaultId = BigInt(vaultId);
	} catch {
		return undefined;
	}

	const idMatches = vaults.filter((v) => {
		try {
			return BigInt(v.vaultId.toString()) === normalizedVaultId;
		} catch {
			return false;
		}
	});

	const normalizedToken = tokenAddress?.toLowerCase();
	if (!normalizedToken) {
		return idMatches.length === 1 ? idMatches[0] : undefined;
	}

	return idMatches.find((v) => v.token?.address?.toLowerCase() === normalizedToken);
}

// Helper function to create Raindex v5 link data (safe, no HTML)
function createRaindexLink(
	chainId: number,
	orderbookId: string,
	orderHashOrVaultId: string,
	linkText = 'Manage your order on Raindex'
): RaindexLink {
	const url = getRaindexOrderUrl(chainId, orderbookId, orderHashOrVaultId);
	return { url, text: linkText };
}

function getSelectedNetwork(): Network {
	const network = get(currentNetwork);
	if (!network) throw new Error('No network selected');
	return network;
}

export const handleStrategyDeployment = async (
	deploymentArgs: DeploymentTransactionArgs,
	assetTokenInfo?: AssetTokenInfo,
	eventContext?: DeployEventContext
) => {
	const config = get(wagmiConfig);
	const network = getSelectedNetwork();
	if (!config) {
		const error = new Error('Wagmi config not found');
		reportDeployFailure(error, eventContext, 'submission', 'wallet_config', network?.id);
		return setDeployTransactionError(
			error,
			eventContext,
			'submission',
			error.message as TransactionErrorMessage
		);
	}
	const $signerAddress = get(walletAddress);
	if (!$signerAddress) {
		const error = new Error('Signer address not found');
		reportDeployFailure(error, eventContext, 'signing', 'wallet_identity', network?.id);
		return setDeployTransactionError(
			error,
			eventContext,
			'signing',
			error.message as TransactionErrorMessage
		);
	}

	// Security: Validate orderbook address BEFORE any approvals are granted
	// This prevents a compromised orderbook from receiving token approvals
	try {
		validateOrderbookAddress(deploymentArgs.raindexAddress, network);
	} catch (error) {
		reportDeployFailure(error, eventContext, 'calldata', 'validate_orderbook', network.id);
		return setDeployTransactionError(
			error,
			eventContext,
			'calldata',
			(error as Error).message as TransactionErrorMessage
		);
	}

	// Decode each approval calldata once + check balances in parallel.
	// Allowance reads + approve-tx submission are delegated to `ensureAllowance`
	// (TRADE-02 PR-4) so the canonical approval flow lives in exactly one module.
	type DecodedApproval = {
		approval: (typeof deploymentArgs.approvals)[number];
		spender: Hex;
		requiredAmount: bigint;
	};

	let decodedApprovals: DecodedApproval[];
	try {
		decodedApprovals = deploymentArgs.approvals.map((approval) => {
			const { args: approvalArgs } = decodeFunctionData({
				abi: erc20Abi,
				data: approval.calldata as Hex
			});
			return {
				approval,
				spender: approvalArgs[0] as Hex,
				requiredAmount: BigInt(approvalArgs[1] as string)
			};
		});
	} catch (error) {
		reportDeployFailure(error, eventContext, 'calldata', 'decode_approval', network.id);
		return setDeployTransactionError(error, eventContext, 'calldata');
	}

	if (decodedApprovals.length > 0) {
		checkingWalletAllowance('Checking balances and allowances...');

		// Check all balances in PARALLEL — balance shortfalls block deployment
		// before any wallet prompt (cheaper failure mode for the user). Allowance
		// reads are inside `ensureAllowance` so we don't double-read them here.
		const approvalContext = deployFlowContext(
			eventContext,
			'approval',
			'check_balances',
			network.id
		);
		if (approvalContext) addTradeFlowBreadcrumb(approvalContext, 'started');
		let balances: bigint[];
		try {
			balances = (await Promise.all(
				decodedApprovals.map((d) =>
					readContract(config, {
						abi: erc20Abi,
						address: d.approval.token as `0x${string}`,
						functionName: 'balanceOf',
						args: [$signerAddress as Hex],
						chainId: network.chainId
					})
				)
			)) as bigint[];
		} catch (error) {
			reportDeployFailure(error, eventContext, 'approval', 'check_balances', network.id);
			return setDeployTransactionError(error, eventContext, 'approval');
		}
		if (approvalContext) addTradeFlowBreadcrumb(approvalContext, 'completed');

		for (let i = 0; i < decodedApprovals.length; i++) {
			const { approval, requiredAmount } = decodedApprovals[i];
			if (balances[i] < requiredAmount) {
				const error = new Error(`Insufficient ${approval.symbol} balance`);
				reportDeployFailure(error, eventContext, 'approval', 'check_balances', network.id);
				return setDeployTransactionError(
					error,
					eventContext,
					'approval',
					`Insufficient ${approval.symbol} balance. Please add more ${approval.symbol} to your wallet or reduce the ${approval.symbol} deposit amount in advanced options.` as TransactionErrorMessage
				);
			}
		}

		for (const { approval, spender, requiredAmount } of decodedApprovals) {
			try {
				// Pre-set wallet-confirmation message so the user sees which token is
				// about to prompt for approval. `ensureAllowance` will overwrite to
				// CHECKING_ALLOWANCE / PENDING_APPROVAL (only when an approve tx is
				// actually needed) via the setStatus callback.
				awaitWalletConfirmation(`Awaiting wallet confirmation to approve ${approval.symbol}...`);
				await ensureAllowance({
					token: { address: approval.token as `0x${string}` },
					owner: $signerAddress as `0x${string}`,
					spender,
					amount: requiredAmount,
					network,
					setStatus: (s) => transactionStoreInternal.update((state) => ({ ...state, status: s }))
				});
			} catch (error) {
				const failureStage = inferWalletFailureStage(error) === 'signing' ? 'signing' : 'approval';
				reportDeployFailure(error, eventContext, failureStage, 'approve_token', network.id);
				if (isStaleWalletSessionError(error)) {
					const msg = await handleStaleWalletSession(config);
					return setDeployTransactionError(
						error,
						eventContext,
						failureStage,
						msg as TransactionErrorMessage
					);
				}
				return setDeployTransactionError(error, eventContext, failureStage);
			}
		}
	}
	let hash: Hash;
	try {
		const submitContext = deployFlowContext(
			eventContext,
			'submission',
			'deploy_strategy',
			network.id
		);
		if (submitContext) addTradeFlowBreadcrumb(submitContext, 'started');
		awaitWalletConfirmation(`Awaiting wallet confirmation to deploy your strategy...`);

		hash = await sendTransaction({
			to: deploymentArgs.raindexAddress as `0x${string}`,
			data: deploymentArgs.deploymentCalldata as Hex
		});
		if (submitContext) addTradeFlowBreadcrumb(submitContext, 'completed');
		// OBS-07 (Plan 02-03 Task 2c): tx hash returned post-dispatch — emit
		// `broadcast` for limit/dca deploy paths. `confirmed` is emitted when the
		// receipt-poll loop terminates successfully (transactionSuccess).
		if (eventContext) {
			trackTradeEvent('broadcast', {
				order_type: eventContext.order_type,
				asset_symbol: assetTokenInfo?.symbol
			});
		}
	} catch (error) {
		const failureStage = inferWalletFailureStage(error);
		reportDeployFailure(error, eventContext, failureStage, 'deploy_strategy', network.id);
		if (isStaleWalletSessionError(error)) {
			const msg = await handleStaleWalletSession(config);
			return setDeployTransactionError(
				error,
				eventContext,
				failureStage,
				msg as TransactionErrorMessage
			);
		}
		return setDeployTransactionError(error, eventContext, failureStage);
	}

	// OBS-07: emit `confirmed` once the deploy is confirmed on-chain. The
	// existing flow uses an order-link poll loop (no waitForTransaction here);
	// the tx hash returning from sendTransaction means the receipt was already
	// mined (sendTransaction in walletService awaits + returns the hash post-mine).
	// Treat post-sendTransaction as the confirmed boundary (collapsed with broadcast,
	// per Task 1b's observation about same-call SDK boundaries).
	if (eventContext) {
		trackTradeEvent('confirmed', {
			order_type: eventContext.order_type,
			asset_symbol: assetTokenInfo?.symbol
		});
	}

	let orderLinkErrorReported = false;
	const tryFetchOrderLink = async (): Promise<RaindexLink | null> => {
		try {
			const client = await createRaindexClient();
			const orders = await client.getAddOrdersForTransaction(
				network.id,
				deploymentArgs.raindexAddress as `0x${string}`,
				hash as `0x${string}`
			);
			if (orders.error || !orders.value?.length) {
				return null;
			}
			const orderHash = orders.value[0].orderHash;
			const orderbookId = orders.value[0].raindex;
			return createRaindexLink(network.id, orderbookId, orderHash);
		} catch (error) {
			// Polling retries for up to a minute. Report the first transport failure only,
			// preserving useful signal without emitting the same incident every two seconds.
			if (!orderLinkErrorReported) {
				orderLinkErrorReported = true;
				reportDeployFailure(error, eventContext, 'confirmation', 'resolve_order_link', network.id);
			}
			return null;
		}
	};

	// Poll for the order to be added to the orderbook
	let attempts = 0;
	const maxAttempts = 30; // 1 minute max (30 * 2 seconds)

	// Build metadata with asset token info if provided
	const buildMetadata = (raindexLink?: RaindexLink): TransactionMetadata => ({
		...(assetTokenInfo ? { assetTokenInfo } : {}),
		...(raindexLink ? { raindexLink } : {})
	});

	// Immediate attempt before scheduling interval
	const immediateLink = await tryFetchOrderLink();
	if (immediateLink) {
		invalidateOrderQueries();
		invalidateDashboardBalances();
		return transactionSuccess(hash, undefined, buildMetadata(immediateLink));
	}

	// Inflight guard: setInterval does NOT wait for the previous async callback
	// to complete before scheduling the next tick — a slow subgraph response
	// could otherwise produce overlapping ticks, both calling
	// transactionSuccess() with potentially different raindexLink resolution
	// windows. Skip ticks while a prior fetch is outstanding.
	let inflight = false;
	const interval = setInterval(async () => {
		if (inflight) return;
		inflight = true;
		attempts++;

		try {
			// Stop polling after max attempts.
			if (attempts >= maxAttempts) {
				clearInterval(interval);
				invalidateOrderQueries();
				invalidateDashboardBalances();
				transactionSuccess(hash, 'Order deployed successfully!', buildMetadata());
				return;
			}

			const link = await tryFetchOrderLink();
			if (link) {
				clearInterval(interval);
				invalidateOrderQueries();
				invalidateDashboardBalances();
				transactionSuccess(hash, undefined, buildMetadata(link));
			}
		} catch (error) {
			// Continue polling
			console.error('[deployTransactionStore] Error checking for orders:', error);
		} finally {
			inflight = false;
		}
	}, 2000);
};

export const showRainlangConfirmation = async (
	composedRainlang: string,
	deploymentArgs: DeploymentTransactionArgs,
	assetTokenInfo?: AssetTokenInfo,
	eventContext?: DeployEventContext
): Promise<void> => {
	// Check if user wants to review strategy source code before deploying
	const shouldReview = get(reviewStrategyOnDeploy);

	if (shouldReview) {
		// Show modal for user to review and confirm
		rainlangConfirmationModal.set({
			show: true,
			rainlangCode: composedRainlang,
			onDeploy: async () => {
				rainlangConfirmationModal.set({
					show: false,
					rainlangCode: '',
					onDeploy: null,
					onCancel: null
				});
				// The originating handler has already returned after opening this modal,
				// so its withTradeId/finally lifecycle has cleared the module scope. Restore
				// the explicit id while the deferred wallet flow runs so PostHog funnel
				// events and ambient Sentry scope share the same correlation id.
				if (eventContext) setTradeId(eventContext.trade_id);
				try {
					await handleStrategyDeployment(deploymentArgs, assetTokenInfo, eventContext);
				} finally {
					if (eventContext) clearTradeId();
				}
			},
			onCancel: () => {
				rainlangConfirmationModal.set({
					show: false,
					rainlangCode: '',
					onDeploy: null,
					onCancel: null
				});
				reset();
			}
		});
	} else {
		// Skip modal and deploy directly
		await handleStrategyDeployment(deploymentArgs, assetTokenInfo, eventContext);
	}
};

export const handleDsfDeploy = async (args: MarketMakingDeploymentArgs) => {
	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not found');
	const network = getSelectedNetwork();
	awaitWalletConfirmation(`Preparing strategy...`);
	const { composedRainlang, deploymentArgs } = await getMarketMakingDeploymentArgs(network, args);

	await showRainlangConfirmation(composedRainlang, deploymentArgs);
};

export const handleDcaDeploy = async (
	args: DcaDeploymentArgs,
	eventContext: DeployEventContext
) => {
	const config = get(wagmiConfig);
	const network = getSelectedNetwork();
	if (!config) {
		const error = new Error('Wagmi config not found');
		reportDeployFailure(error, eventContext, 'calldata', 'prepare_dca', network?.id);
		setDeployTransactionError(
			error,
			eventContext,
			'calldata',
			error.message as TransactionErrorMessage
		);
		throw error;
	}
	awaitWalletConfirmation(`Preparing strategy...`);
	const calldataContext = deployFlowContext(eventContext, 'calldata', 'prepare_dca', network.id);
	if (calldataContext) addTradeFlowBreadcrumb(calldataContext, 'started');
	let composedRainlang: string;
	let deploymentArgs: DeploymentTransactionArgs;
	try {
		({ composedRainlang, deploymentArgs } = await getDcaDeploymentArgs(
			network,
			args,
			eventContext
		));
	} catch (error) {
		reportDeployFailure(error, eventContext, 'calldata', 'prepare_dca', network.id);
		setDeployTransactionError(error, eventContext, 'calldata');
		throw error;
	}
	if (calldataContext) addTradeFlowBreadcrumb(calldataContext, 'completed');

	// Only show Track in Wallet for Buy orders (when user is acquiring an asset)
	// Buy DCA: outputToken is payment token (e.g., USDC), inputToken is the asset
	// Sell DCA: no need to track - user is receiving payment token
	const isBuyOrder = isPaymentToken(args.outputToken.symbol);
	const assetTokenInfo: AssetTokenInfo | undefined = isBuyOrder
		? {
				address: args.inputToken.address,
				symbol: args.inputToken.symbol,
				decimals: args.inputToken.decimals
			}
		: undefined;

	await showRainlangConfirmation(composedRainlang, deploymentArgs, assetTokenInfo, eventContext);
};

export const handleLimitDeploy = async (
	args: LimitOrderDeploymentArgs,
	eventContext: DeployEventContext
) => {
	const config = get(wagmiConfig);
	const network = getSelectedNetwork();
	if (!config) {
		const error = new Error('Wagmi config not found');
		reportDeployFailure(error, eventContext, 'calldata', 'prepare_limit', network?.id);
		setDeployTransactionError(
			error,
			eventContext,
			'calldata',
			error.message as TransactionErrorMessage
		);
		throw error;
	}
	awaitWalletConfirmation(`Preparing strategy...`);
	const calldataContext = deployFlowContext(eventContext, 'calldata', 'prepare_limit', network.id);
	if (calldataContext) addTradeFlowBreadcrumb(calldataContext, 'started');
	let composedRainlang: string;
	let deploymentArgs: DeploymentTransactionArgs;
	try {
		({ composedRainlang, deploymentArgs } = await getLimitOrderDeploymentArgs(
			network,
			args,
			eventContext
		));
	} catch (error) {
		reportDeployFailure(error, eventContext, 'calldata', 'prepare_limit', network.id);
		setDeployTransactionError(error, eventContext, 'calldata');
		throw error;
	}
	if (calldataContext) addTradeFlowBreadcrumb(calldataContext, 'completed');

	// Only show Track in Wallet for Buy orders (when user is acquiring an asset)
	// Buy Limit: outputToken is payment token (e.g., USDC), inputToken is the asset
	// Sell Limit: no need to track - user is receiving payment token
	const isBuyOrder = isPaymentToken(args.outputToken.symbol);
	const assetTokenInfo: AssetTokenInfo | undefined = isBuyOrder
		? {
				address: args.inputToken.address,
				symbol: args.inputToken.symbol,
				decimals: args.inputToken.decimals
			}
		: undefined;

	await showRainlangConfirmation(composedRainlang, deploymentArgs, assetTokenInfo, eventContext);
};

export const handleWithdraw = async (vault: RaindexVault) => {
	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not found');

	// vault.balance is already a Float instance, use it directly
	const vaultCalldatas = await vault.getCalldatas(vault.balance);
	if (vaultCalldatas.error || !vaultCalldatas.value) {
		throw new Error(vaultCalldatas.error?.readableMsg ?? 'Failed to prepare withdrawal');
	}
	let hash: Hash;
	try {
		// Security: Validate orderbook address is trusted before sending transaction
		const network = getSelectedNetwork();
		validateOrderbookAddress(vault.raindex, network);

		awaitWalletConfirmation(`Awaiting wallet confirmation for withdrawal...`);

		hash = await sendTransaction({
			to: vault.raindex as `0x${string}`,
			data: vaultCalldatas.value.withdraw as Hex
		});
		awaitWalletConfirmation(`Awaiting transaction confirmation...`);

		await waitForTransaction(hash, { confirmations: TAKE_TX_CONFIRMATIONS });

		const $signer = get(walletAddress);
		const raindexLink = {
			url: getRaindexVaultUrl(network.id, vault.raindex, vault.id),
			text: 'Manage your vault on Raindex'
		};

		// Invalidate vault queries for this specific token
		const tokenAddress = vault.token?.address ?? vault.token?.id;
		invalidateUserVaultQueries(network.id, $signer ?? undefined, tokenAddress);
		invalidateDashboardBalances();

		return transactionSuccess(hash, undefined, { raindexLink });
	} catch (error) {
		if (isStaleWalletSessionError(error)) {
			const msg = await handleStaleWalletSession(config);
			return transactionError(msg as TransactionErrorMessage);
		}
		return transactionError(extractTransactionError(error));
	}
};

/**
 * Wrap or unwrap tokens using ERC4626 vaults.
 * Follows the same pattern as handleWithdraw.
 */
export const handleWrapUnwrap = async (
	mode: 'wrap' | 'unwrap',
	tokenAddress: `0x${string}`,
	amount: bigint,
	userAddress: `0x${string}`,
	tokenSymbol: string,
	targetSymbol: string
) => {
	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not found');

	let hash: Hash;
	const actionName = mode === 'wrap' ? 'Wrap' : 'Unwrap';

	try {
		awaitWalletConfirmation(`Awaiting wallet confirmation to ${mode} ${tokenSymbol}...`);

		if (mode === 'wrap') {
			hash = await wrapToken(tokenAddress, amount, userAddress);
		} else {
			hash = await unwrapToken(tokenAddress, amount, userAddress, userAddress);
		}

		awaitWalletConfirmation(`Awaiting transaction confirmation...`);
		await waitForTransaction(hash);

		// Invalidate balance queries (same pattern as handleWithdraw)
		invalidateDashboardBalances();

		track(`${mode}_success`, {
			token_symbol: tokenSymbol,
			target_symbol: targetSymbol,
			transaction_hash: hash
		});

		return transactionSuccess(hash, `Successfully ${mode}ped ${tokenSymbol} to ${targetSymbol}`);
	} catch (error) {
		track(`${mode}_failed`, {
			token_symbol: tokenSymbol,
			target_symbol: targetSymbol,
			error: classifyError(error)
		});

		if (isStaleWalletSessionError(error)) {
			const msg = await handleStaleWalletSession(config);
			return transactionError(msg as TransactionErrorMessage);
		}
		return transactionError(
			extractTransactionError(error, `${actionName} failed` as TransactionErrorMessage)
		);
	}
};

/**
 * Cancel an order: withdraw from vaults first, then deactivate the order.
 * This combines both operations into a single user flow.
 */
export const handleRemoveOrder = async (quote: {
	orderHash: string;
	orderbookId?: string;
	inputVaultId?: string;
	outputVaultId?: string;
	inputTokenAddress?: string;
	outputTokenAddress?: string;
}) => {
	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not found');
	const network = getSelectedNetwork();
	const $signerAddress = get(walletAddress);

	if (!$signerAddress) {
		throw new Error('Wallet not connected');
	}

	track('order_removal_initiated', {
		order_hash: quote.orderHash
	});

	try {
		// Fetch the RaindexOrder from the SDK
		const client = await createRaindexClient();
		const ordersResult = await client.getOrders(
			[network.id],
			{
				orderHash: quote.orderHash as `0x${string}`,
				owners: [$signerAddress as `0x${string}`]
			},
			1 // Page 1 (1-indexed)
		);

		if (ordersResult.error || !ordersResult.value) {
			throw new Error(ordersResult.error?.readableMsg || 'Failed to fetch order');
		}

		const orders = ordersResult.value.orders;
		if (orders.length === 0) {
			throw new Error('Order not found');
		}

		const order = orders[0];

		// Step 1: Withdraw from vaults first
		// Fetch all user vaults to find ones associated with this order
		const vaultsResult = await client.getVaults(
			[network.id],
			{
				owners: [$signerAddress as `0x${string}`],
				hideZeroBalance: false,
				tokens: []
			},
			1 // Page 1 (1-indexed)
		);

		console.log('[deployTransactionStore:handleRemoveOrder] Vaults API response:', {
			error: vaultsResult.error?.readableMsg,
			hasValue: !!vaultsResult.value,
			hasItems: !!vaultsResult.value?.items,
			itemCount: vaultsResult.value?.items?.length,
			signerAddress: $signerAddress,
			networkId: network.id
		});

		if (!vaultsResult.error && vaultsResult.value?.items) {
			const vaults = vaultsResult.value.items as RaindexVault[];

			console.log('[deployTransactionStore:handleRemoveOrder] Looking for vaults:', {
				outputVaultId: quote.outputVaultId,
				outputTokenAddress: getMakerOutputTokenAddress(quote),
				inputVaultId: quote.inputVaultId,
				inputTokenAddress: getMakerInputTokenAddress(quote),
				availableVaultIds: vaults.map((v) => ({
					vaultId: v.vaultId.toString(),
					vaultIdHex: `0x${v.vaultId.toString(16).padStart(64, '0')}`,
					token: v.token?.symbol,
					tokenAddress: v.token?.address
				}))
			});

			// Find vaults for this order
			// Note: vaultId alone doesn't uniquely identify a vault - need (vaultId + token)
			// Same vaultId can hold different tokens (e.g., input vault has USDC, output vault has tSTOX)
			const vaultsToWithdraw: RaindexVault[] = [];
			const addedVaultKeys = new Set<string>(); // Track by vaultId + token

			if (quote.outputVaultId) {
				const outputVault = findVaultByIdAndToken(
					vaults,
					quote.outputVaultId,
					getMakerOutputTokenAddress(quote)
				);
				if (outputVault) {
					const key = `${outputVault.vaultId.toString()}-${outputVault.token?.address?.toLowerCase()}`;
					if (!addedVaultKeys.has(key)) {
						vaultsToWithdraw.push(outputVault);
						addedVaultKeys.add(key);
					}
				}
			}
			if (quote.inputVaultId) {
				const inputVault = findVaultByIdAndToken(
					vaults,
					quote.inputVaultId,
					getMakerInputTokenAddress(quote)
				);
				if (inputVault) {
					const key = `${inputVault.vaultId.toString()}-${inputVault.token?.address?.toLowerCase()}`;
					if (!addedVaultKeys.has(key)) {
						vaultsToWithdraw.push(inputVault);
						addedVaultKeys.add(key);
					}
				}
			}

			console.log(
				'[deployTransactionStore:handleRemoveOrder] Found vaults to withdraw:',
				vaultsToWithdraw.length
			);
			console.log(
				'[deployTransactionStore:handleRemoveOrder] Vault details:',
				vaultsToWithdraw.map((v) => ({
					vaultId: v.vaultId.toString(),
					vaultIdHex: `0x${v.vaultId.toString(16).padStart(64, '0')}`,
					token: v.token?.symbol,
					tokenAddress: v.token?.address,
					balanceHex: v.balance.asHex(),
					orderbook: v.raindex
				}))
			);

			// Filter to only vaults with non-zero balance
			// Compare hex representation to avoid Float class instance mismatch
			const vaultsWithBalance = vaultsToWithdraw.filter((vault) => {
				const balanceHex = vault.balance.asHex().toLowerCase();
				console.log('[deployTransactionStore:handleRemoveOrder] Vault balance check:', {
					vaultId: vault.vaultId.toString(),
					token: vault.token?.symbol,
					balanceHex,
					isZero: balanceHex === ZERO_FLOAT_HEX
				});
				return balanceHex !== ZERO_FLOAT_HEX;
			});

			// Withdraw from each vault with balance
			for (let i = 0; i < vaultsWithBalance.length; i++) {
				const vault = vaultsWithBalance[i];

				// Security: Validate orderbook address is trusted
				validateOrderbookAddress(vault.raindex, network);

				const vaultCalldatas = await vault.getCalldatas(vault.balance);
				if (vaultCalldatas.error || !vaultCalldatas.value) {
					throw new Error(vaultCalldatas.error?.readableMsg ?? 'Failed to prepare withdrawal');
				}

				awaitWalletConfirmation(`Withdrawing from vault ${i + 1}/${vaultsWithBalance.length}...`);

				const withdrawHash = await sendTransaction({
					to: vault.raindex as `0x${string}`,
					data: vaultCalldatas.value.withdraw as Hex
				});

				awaitWalletConfirmation(`Awaiting withdrawal confirmation...`);

				await waitForTransaction(withdrawHash);
			}
		}

		// Step 2: Deactivate/remove the order
		// Security: Validate orderbook address is trusted
		validateOrderbookAddress(order.raindex, network);

		const removeCalldata = order.getRemoveCalldata();
		if (removeCalldata.error) {
			throw new Error(removeCalldata.error.readableMsg);
		}

		awaitWalletConfirmation('Awaiting wallet confirmation to cancel order...');

		const hash = await sendTransaction({
			to: order.raindex as `0x${string}`,
			data: removeCalldata.value as Hex
		});

		awaitWalletConfirmation('Awaiting transaction confirmation...');

		await waitForTransaction(hash);

		const raindexLink = createRaindexLink(network.id, order.raindex, quote.orderHash);

		// Invalidate queries for the tokens involved in this order
		const tokenAddresses = [
			getMakerInputTokenAddress(quote),
			getMakerOutputTokenAddress(quote)
		].filter(Boolean);
		for (const tokenAddr of tokenAddresses) {
			if (tokenAddr) {
				invalidateOrderQueries(network.id, tokenAddr);
				invalidateUserVaultQueries(network.id, $signerAddress, tokenAddr);
			}
		}

		track('order_removal_success', {
			order_hash: quote.orderHash,
			transaction_hash: hash
		});

		return transactionSuccess(hash, undefined, { raindexLink });
	} catch (error: unknown) {
		track('order_removal_failed', {
			order_hash: quote.orderHash,
			error: classifyError(error)
		});

		if (isStaleWalletSessionError(error)) {
			const msg = await handleStaleWalletSession(config);
			return transactionError(msg as TransactionErrorMessage);
		}
		return transactionError(extractTransactionError(error));
	}
};

/**
 * Withdraw from order vaults.
 *
 * Behavior based on order state:
 * - If isFilled (remaining = 0): Deactivate order first, then withdraw from input vault only
 * - If not filled (remaining > 0): Withdraw from both output and input vaults
 */
export const handleWithdrawFromOrder = async (quote: {
	orderHash: string;
	orderbookId?: string;
	inputVaultId?: string;
	outputVaultId?: string;
	inputTokenAddress?: string;
	outputTokenAddress?: string;
	isFilled?: boolean;
}) => {
	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not found');
	const network = getSelectedNetwork();
	const $signerAddress = get(walletAddress);

	if (!$signerAddress) {
		throw new Error('Wallet not connected');
	}

	const isFilled = quote.isFilled ?? false;

	track('order_withdrawal_initiated', {
		order_hash: quote.orderHash,
		is_filled: isFilled
	});

	try {
		const client = await createRaindexClient();

		// For filled orders, we need to deactivate first
		if (isFilled) {
			// Step 1: Deactivate the order
			awaitWalletConfirmation('Deactivating filled order...');

			const ordersResult = await client.getOrders(
				[network.id],
				{
					orderHash: quote.orderHash as `0x${string}`,
					owners: [$signerAddress as `0x${string}`]
				},
				1 // Page 1 (1-indexed)
			);

			if (ordersResult.error || !ordersResult.value) {
				throw new Error(ordersResult.error?.readableMsg || 'Failed to fetch order');
			}

			const orders = ordersResult.value.orders;
			if (orders.length === 0) {
				throw new Error('Order not found');
			}

			const order = orders[0];

			// Only deactivate if order is still active
			const sgOrderResult = order.convertToSgOrder();
			if (!sgOrderResult.error && sgOrderResult.value?.active) {
				// Security: Validate orderbook address is trusted
				validateOrderbookAddress(order.raindex, network);

				const removeCalldata = order.getRemoveCalldata();
				if (removeCalldata.error) {
					throw new Error(removeCalldata.error.readableMsg);
				}

				awaitWalletConfirmation('Awaiting wallet confirmation to deactivate order...');

				const removeHash = await sendTransaction({
					to: order.raindex as `0x${string}`,
					data: removeCalldata.value as Hex
				});

				awaitWalletConfirmation('Awaiting deactivation confirmation...');

				await waitForTransaction(removeHash);
			}
		}

		// Fetch all user vaults
		const vaultsResult = await client.getVaults(
			[network.id],
			{
				owners: [$signerAddress as `0x${string}`],
				hideZeroBalance: false,
				tokens: []
			},
			1 // Page 1 (1-indexed)
		);

		if (vaultsResult.error || !vaultsResult.value?.items) {
			throw new Error(vaultsResult.error?.readableMsg || 'Failed to fetch vaults');
		}

		const vaults = vaultsResult.value.items as RaindexVault[];

		// Determine which vaults to withdraw from
		// Note: vaultId alone doesn't uniquely identify a vault - need (vaultId + token)
		const vaultsToWithdraw: RaindexVault[] = [];
		const addedVaultKeys = new Set<string>(); // Track by vaultId + token

		if (isFilled) {
			// Filled order: only withdraw from input vault (output is empty)
			if (quote.inputVaultId) {
				const inputVault = findVaultByIdAndToken(
					vaults,
					quote.inputVaultId,
					getMakerInputTokenAddress(quote)
				);
				if (inputVault) {
					const key = `${inputVault.vaultId.toString()}-${inputVault.token?.address?.toLowerCase()}`;
					if (!addedVaultKeys.has(key)) {
						vaultsToWithdraw.push(inputVault);
						addedVaultKeys.add(key);
					}
				}
			}
		} else {
			// Not filled: withdraw from both vaults
			if (quote.outputVaultId) {
				const outputVault = findVaultByIdAndToken(
					vaults,
					quote.outputVaultId,
					getMakerOutputTokenAddress(quote)
				);
				if (outputVault) {
					const key = `${outputVault.vaultId.toString()}-${outputVault.token?.address?.toLowerCase()}`;
					if (!addedVaultKeys.has(key)) {
						vaultsToWithdraw.push(outputVault);
						addedVaultKeys.add(key);
					}
				}
			}
			if (quote.inputVaultId) {
				const inputVault = findVaultByIdAndToken(
					vaults,
					quote.inputVaultId,
					getMakerInputTokenAddress(quote)
				);
				if (inputVault) {
					const key = `${inputVault.vaultId.toString()}-${inputVault.token?.address?.toLowerCase()}`;
					if (!addedVaultKeys.has(key)) {
						vaultsToWithdraw.push(inputVault);
						addedVaultKeys.add(key);
					}
				}
			}
		}

		if (vaultsToWithdraw.length === 0) {
			throw new Error('No vaults found to withdraw from');
		}

		// Filter to only vaults with non-zero balance
		// Compare hex representation to avoid Float class instance mismatch
		const vaultsWithBalance = vaultsToWithdraw.filter((vault) => {
			const balanceHex = vault.balance.asHex().toLowerCase();
			return balanceHex !== ZERO_FLOAT_HEX;
		});

		if (vaultsWithBalance.length === 0) {
			// No vaults have balance - nothing to withdraw
			const chainId = network.id;
			const raindexLink = createRaindexLink(chainId, quote.orderbookId || '', quote.orderHash);
			// Still invalidate queries in case order was deactivated
			const tokenAddrs = [
				getMakerInputTokenAddress(quote),
				getMakerOutputTokenAddress(quote)
			].filter(Boolean);
			for (const tokenAddr of tokenAddrs) {
				if (tokenAddr) {
					invalidateOrderQueries(network.id, tokenAddr);
					invalidateUserVaultQueries(network.id, $signerAddress, tokenAddr);
				}
			}
			return transactionSuccess('0x' as Hash, 'No balance to withdraw.', { raindexLink });
		}

		// Withdraw from each vault with balance
		let lastHash: Hash = '0x';
		for (let i = 0; i < vaultsWithBalance.length; i++) {
			const vault = vaultsWithBalance[i];

			// Security: Validate orderbook address is trusted
			validateOrderbookAddress(vault.raindex, network);

			const vaultCalldatas = await vault.getCalldatas(vault.balance);
			if (vaultCalldatas.error || !vaultCalldatas.value) {
				throw new Error(vaultCalldatas.error?.readableMsg ?? 'Failed to prepare withdrawal');
			}

			awaitWalletConfirmation(
				`Awaiting wallet confirmation for withdrawal ${i + 1}/${vaultsWithBalance.length}...`
			);

			lastHash = await sendTransaction({
				to: vault.raindex as `0x${string}`,
				data: vaultCalldatas.value.withdraw as Hex
			});

			awaitWalletConfirmation(`Awaiting transaction confirmation...`);

			await waitForTransaction(lastHash);
		}

		const chainId = network.id;
		const raindexLink = createRaindexLink(chainId, quote.orderbookId || '', quote.orderHash);

		// Invalidate queries for the tokens involved in this order
		const tokenAddrs = [getMakerInputTokenAddress(quote), getMakerOutputTokenAddress(quote)].filter(
			Boolean
		);
		for (const tokenAddr of tokenAddrs) {
			if (tokenAddr) {
				invalidateOrderQueries(network.id, tokenAddr);
				invalidateUserVaultQueries(network.id, $signerAddress, tokenAddr);
			}
		}

		track('order_withdrawal_success', {
			order_hash: quote.orderHash,
			is_filled: isFilled,
			transaction_hash: lastHash
		});

		return transactionSuccess(lastHash, undefined, { raindexLink });
	} catch (error: unknown) {
		track('order_withdrawal_failed', {
			order_hash: quote.orderHash,
			is_filled: isFilled,
			error: classifyError(error)
		});

		if (isStaleWalletSessionError(error)) {
			const msg = await handleStaleWalletSession(config);
			return transactionError(msg as TransactionErrorMessage);
		}
		return transactionError(extractTransactionError(error));
	}
};

export const handleFolioDeploy = async (args: FolioDeploymentArgs) => {
	const network = getSelectedNetwork();
	awaitWalletConfirmation(`Preparing strategy...`);
	const { composedRainlang, deploymentArgs } = await getFolioDeploymentArgs(network, args);

	await showRainlangConfirmation(composedRainlang, deploymentArgs);
};
