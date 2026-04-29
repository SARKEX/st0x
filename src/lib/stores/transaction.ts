import { get } from 'svelte/store';
import { currentNetwork } from '$lib/stores';
import {
	decodeFunctionData,
	encodeFunctionData,
	erc20Abi,
	type Hash,
	type Hex
} from 'viem';
import { readContract as wagmiReadContract } from '@wagmi/core';
import {
	sendTransaction as walletServiceSendTransaction,
	waitForTransaction as walletServiceWaitForTransaction,
	APPROVAL_TX_CONFIRMATIONS
} from '$lib/services/walletService';
import { withRetry } from '$lib/utils/retry';

/** Confirmations required before submitting the next market-take leg. */
const TAKE_TX_CONFIRMATIONS = 1;

// Wrapped wagmi functions with retry logic
const readContract: typeof wagmiReadContract = ((...args: Parameters<typeof wagmiReadContract>) =>
	withRetry(() => wagmiReadContract(...args))) as typeof wagmiReadContract;

// Unified send transaction (works with both Dynamic and wagmi wallets)
const sendTransaction = walletServiceSendTransaction;

// Unified wait for transaction (works with both Dynamic and wagmi wallets, includes retry logic)
const waitForTransaction = walletServiceWaitForTransaction;
import {
	type DeploymentTransactionArgs,
	type RaindexVault
} from '@rainlanguage/orderbook';
import {
	getRaindexOrderUrl,
	getRaindexVaultUrl,
	isPaymentToken
} from '$lib/utils/tokenMath';
import { TransactionErrorMessage } from '$lib/types/errors';
import { isStaleWalletSessionError, handleStaleWalletSession } from '$lib/utils/walletUtils';
import { wagmiConfig } from 'svelte-wagmi';
import { walletAddress } from '$lib/stores/authStore';
import { track } from '$lib/services/analytics';
import {
	getDcaDeploymentArgs,
	getLimitOrderDeploymentArgs,
	getMarketMakingDeploymentArgs,
	getFolioDeploymentArgs,
	type FolioDeploymentArgs,
	type DcaDeploymentArgs,
	type LimitOrderDeploymentArgs,
	type MarketMakingDeploymentArgs
} from '$lib/services/orderDeployment';
import { wrapToken, unwrapToken } from '$lib/services/wrapService';
import { rainlangConfirmationModal, reviewStrategyOnDeploy } from '$lib/stores';
import { createRaindexClient } from '$lib/clients/raindex';
import { invalidateOrderQueries } from '$lib/queries/orderbook';
import { invalidateUserVaultQueries } from '$lib/queries/vaults';
import { invalidateDashboardBalances } from '$lib/queries/balances';
import type { Network } from '$lib/config/network';

// classifyError, isOrderbookTrusted, validateOrderbookAddress, and
// extractTransactionError were lifted into ./transactionShared (TRADE-02 PR-1).
// They are imported below alongside TransactionStatus + the shared interfaces.

// The market-take helpers (isSkippableMakerLegError, extractAvailableLiquidityAmount,
// buildExpectedPriceByOrderHash, formatPriceForReroute, shortOrderHash, buildLegRerouteMessage,
// sumBigints, deriveTakeRequestAmountWei, buildTakeOrdersRequest) and the aggregated-take
// calldata cache (AggregatedTakeCacheEntry, aggregatedTakeCalldataCache,
// getAggregatedTakeCacheKey, shouldCacheAggregatedTakeResult) were lifted into
// ./marketTakeStore (TRADE-02 PR-2). They are private to that module — used only by
// the 5 take-order methods which now also live there.

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

import { ZERO_FLOAT_HEX } from '$lib/config/constants';
import { getMakerOutputTokenAddress, getMakerInputTokenAddress, getMakerInputIOIndex, getMakerOutputIOIndex } from "$lib/types/orderPerspective";
import {
	transactionStoreInternal,
	TransactionStatus,
	classifyError,
	validateOrderbookAddress,
	isOrderbookTrusted,
	extractTransactionError,
	type TransactionMetadata,
	type MarketOrderSummary,
	type RaindexLink,
	type MultiTxProgress,
	type AssetTokenInfo
} from './transactionShared';

// Re-export market-take methods from marketTakeStore (TRADE-02 PR-2).
// Existing UI consumers continue to call transactionStore.handleOracleOrders(...)
// etc. via the default export, but marketOrderExecution.ts (the only service-side
// consumer) now imports them directly from $lib/stores/marketTakeStore — that's
// what severs the circular-import edge.
import {
	preloadAggregatedTakeOrdersCalldata,
	handleAggregatedTakeOrdersCalldata,
	handleTakeOrders,
	handleOracleOrders,
	pollAndFinalizeTakeOrders
} from './marketTakeStore';

const transactionStore = () => {
	// Destructure the leaf-owned store API and status-helper surface so the
	// existing handler bodies below can keep calling `awaitWalletConfirmation(...)`
	// etc. without prefixing every call site. Plans 03/04/05 will progressively
	// move handlers OUT of this file; until then this destructure is the seam.
	const {
		subscribe,
		set,
		update,
		reset,
		checkingWalletAllowance,
		awaitWalletConfirmation,
		awaitApprovalTx,
		transactionSuccess,
		transactionError,
		acknowledgeMultiTx
	} = transactionStoreInternal;
	// `set` is currently unused in this file but is part of the store API surface
	// preserved by the façade default-export below.
	void set;

	const handleStrategyDeployment = async (
		deploymentArgs: DeploymentTransactionArgs,
		assetTokenInfo?: AssetTokenInfo
	) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const $signerAddress = get(walletAddress);
		if (!$signerAddress) throw new Error('Signer address not found');

		// Get network early - used for validation and later for subgraph queries
		const network = get(currentNetwork);

		// Security: Validate orderbook address BEFORE any approvals are granted
		// This prevents a compromised orderbook from receiving token approvals
		try {
			validateOrderbookAddress(deploymentArgs.orderbookAddress, network);
		} catch (error) {
			return transactionError((error as Error).message as TransactionErrorMessage);
		}

		// Filter approvals: check balance + allowance in parallel, skip if already approved
		const approvalsNeeded: typeof deploymentArgs.approvals = [];

		if (deploymentArgs.approvals.length > 0) {
			checkingWalletAllowance('Checking balances and allowances...');

			// Check all balances and allowances in PARALLEL
			const checks = await Promise.all(
				deploymentArgs.approvals.map(async (approval) => {
					const { args: approvalArgs } = decodeFunctionData({
						abi: erc20Abi,
						data: approval.calldata as Hex
					});
					const spender = approvalArgs[0] as Hex;
					const requiredAmount = BigInt(approvalArgs[1] as string);

					// Check balance and allowance in parallel
					const [balance, allowance] = await Promise.all([
						readContract(config, {
							abi: erc20Abi,
							address: approval.token as `0x${string}`,
							functionName: 'balanceOf',
							args: [$signerAddress as Hex]
						}),
						readContract(config, {
							abi: erc20Abi,
							address: approval.token as `0x${string}`,
							functionName: 'allowance',
							args: [$signerAddress as Hex, spender]
						})
					]);

					return { approval, balance, allowance, requiredAmount };
				})
			);

			// Validate balances and filter approvals
			for (const { approval, balance, allowance, requiredAmount } of checks) {
				// Check if user has sufficient balance
				if (balance < requiredAmount) {
					return transactionError(
						`Insufficient ${approval.symbol} balance. Please add more ${approval.symbol} to your wallet or reduce the ${approval.symbol} deposit amount in advanced options.` as TransactionErrorMessage
					);
				}

				// Only add approval if current allowance is insufficient
				if (allowance < requiredAmount) {
					approvalsNeeded.push(approval);
				}
			}
		}

		// Only execute approvals that are actually needed
		if (approvalsNeeded.length > 0) {
			for (const approval of approvalsNeeded) {
				try {
					awaitWalletConfirmation(`Awaiting wallet confirmation to approve ${approval.symbol}...`);
					const hash = await sendTransaction({
						to: approval.token as `0x${string}`,
						data: approval.calldata as Hex
					});
					awaitApprovalTx(hash);
					await waitForTransaction(hash, { confirmations: APPROVAL_TX_CONFIRMATIONS });
				} catch (error) {
					if (isStaleWalletSessionError(error)) {
						const msg = await handleStaleWalletSession(config);
						return transactionError(msg as TransactionErrorMessage);
					}
					return transactionError(extractTransactionError(error));
				}
			}
		}
		let hash: Hash;
		try {
			awaitWalletConfirmation(`Awaiting wallet confirmation to deploy your strategy...`);

			hash = await sendTransaction({
				to: deploymentArgs.orderbookAddress as `0x${string}`,
				data: deploymentArgs.deploymentCalldata as Hex
			});
		} catch (error) {
			if (isStaleWalletSessionError(error)) {
				const msg = await handleStaleWalletSession(config);
				return transactionError(msg as TransactionErrorMessage);
			}
			return transactionError(extractTransactionError(error));
		}

		const tryFetchOrderLink = async () => {
			const client = await createRaindexClient();
			const orders = await client.getAddOrdersForTransaction(
				network.id,
				deploymentArgs.orderbookAddress as `0x${string}`,
				hash as `0x${string}`
			);
			if (orders.error || !orders.value?.length) {
				return null;
			}
			const orderHash = orders.value[0].orderHash;
			const orderbookId = orders.value[0].orderbook;
			const chainId = network.id;
			return createRaindexLink(chainId, orderbookId, orderHash);
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

		const interval = setInterval(async () => {
			attempts++;

			// Stop polling after max attempts
			if (attempts >= maxAttempts) {
				clearInterval(interval);
				invalidateOrderQueries();
				invalidateDashboardBalances();
				return transactionSuccess(hash, 'Order deployed successfully!', buildMetadata());
			}

			try {
				const link = await tryFetchOrderLink();
				if (link) {
					clearInterval(interval);
					invalidateOrderQueries();
					invalidateDashboardBalances();
					return transactionSuccess(hash, undefined, buildMetadata(link));
				}
			} catch (error) {
				// Continue polling
				console.error('Error checking for orders:', error);
			}
		}, 2000);
	};

	const showRainlangConfirmation = (
		composedRainlang: string,
		deploymentArgs: DeploymentTransactionArgs,
		assetTokenInfo?: AssetTokenInfo
	) => {
		// Check if user wants to review strategy source code before deploying
		const shouldReview = get(reviewStrategyOnDeploy);

		if (shouldReview) {
			// Show modal for user to review and confirm
			rainlangConfirmationModal.set({
				show: true,
				rainlangCode: composedRainlang,
				onDeploy: () => {
					rainlangConfirmationModal.set({
						show: false,
						rainlangCode: '',
						onDeploy: null,
						onCancel: null
					});
					handleStrategyDeployment(deploymentArgs, assetTokenInfo);
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
			handleStrategyDeployment(deploymentArgs, assetTokenInfo);
		}
	};

	const handleDsfDeploy = async (args: MarketMakingDeploymentArgs) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const network = get(currentNetwork);
		awaitWalletConfirmation(`Preparing strategy...`);
		const { composedRainlang, deploymentArgs } = await getMarketMakingDeploymentArgs(network, args);

		showRainlangConfirmation(composedRainlang, deploymentArgs);
	};

	const handleDcaDeploy = async (args: DcaDeploymentArgs) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const network = get(currentNetwork);
		awaitWalletConfirmation(`Preparing strategy...`);
		const { composedRainlang, deploymentArgs } = await getDcaDeploymentArgs(network, args);

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

		showRainlangConfirmation(composedRainlang, deploymentArgs, assetTokenInfo);
	};

	const handleLimitDeploy = async (args: LimitOrderDeploymentArgs) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const network = get(currentNetwork);
		awaitWalletConfirmation(`Preparing strategy...`);
		const { composedRainlang, deploymentArgs } = await getLimitOrderDeploymentArgs(network, args);

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

		showRainlangConfirmation(composedRainlang, deploymentArgs, assetTokenInfo);
	};

	const handleWithdraw = async (vault: RaindexVault) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');

		// vault.balance is already a Float instance, use it directly
		const vaultWithdrawCalldata = await vault.getWithdrawCalldata(vault.balance);
		if (vaultWithdrawCalldata.error) throw new Error(vaultWithdrawCalldata.error.readableMsg);
		let hash: Hash;
		try {
			// Security: Validate orderbook address is trusted before sending transaction
			const network = get(currentNetwork);
			validateOrderbookAddress(vault.orderbook, network);

			awaitWalletConfirmation(`Awaiting wallet confirmation for withdrawal...`);

			hash = await sendTransaction({
				to: vault.orderbook as `0x${string}`,
				data: vaultWithdrawCalldata.value as Hex
			});
			awaitWalletConfirmation(`Awaiting transaction confirmation...`);

			await waitForTransaction(hash, { confirmations: TAKE_TX_CONFIRMATIONS });

			const $signer = get(walletAddress);
			const raindexLink = {
				url: getRaindexVaultUrl(network.id, vault.orderbook, vault.id),
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
	const handleWrapUnwrap = async (
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
	const handleRemoveOrder = async (quote: {
		orderHash: string;
		orderbookId?: string;
		inputVaultId?: string;
		outputVaultId?: string;
		inputTokenAddress?: string;
		outputTokenAddress?: string;
	}) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const network = get(currentNetwork);
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

			console.log('[handleRemoveOrder] Vaults API response:', {
				error: vaultsResult.error?.readableMsg,
				hasValue: !!vaultsResult.value,
				hasItems: !!vaultsResult.value?.items,
				itemCount: vaultsResult.value?.items?.length,
				signerAddress: $signerAddress,
				networkId: network.id
			});

			if (!vaultsResult.error && vaultsResult.value?.items) {
				const vaults = vaultsResult.value.items as RaindexVault[];

				console.log('[handleRemoveOrder] Looking for vaults:', {
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

				console.log('[handleRemoveOrder] Found vaults to withdraw:', vaultsToWithdraw.length);
				console.log(
					'[handleRemoveOrder] Vault details:',
					vaultsToWithdraw.map((v) => ({
						vaultId: v.vaultId.toString(),
						vaultIdHex: `0x${v.vaultId.toString(16).padStart(64, '0')}`,
						token: v.token?.symbol,
						tokenAddress: v.token?.address,
						balanceHex: v.balance.asHex(),
						orderbook: v.orderbook
					}))
				);

				// Filter to only vaults with non-zero balance
				// Compare hex representation to avoid Float class instance mismatch
				const vaultsWithBalance = vaultsToWithdraw.filter((vault) => {
					const balanceHex = vault.balance.asHex().toLowerCase();
					console.log('[handleRemoveOrder] Vault balance check:', {
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
					validateOrderbookAddress(vault.orderbook, network);

					const vaultWithdrawCalldata = await vault.getWithdrawCalldata(vault.balance);
					if (vaultWithdrawCalldata.error) {
						throw new Error(vaultWithdrawCalldata.error.readableMsg);
					}

					awaitWalletConfirmation(`Withdrawing from vault ${i + 1}/${vaultsWithBalance.length}...`);

					const withdrawHash = await sendTransaction({
						to: vault.orderbook as `0x${string}`,
						data: vaultWithdrawCalldata.value as Hex
					});

					awaitWalletConfirmation(`Awaiting withdrawal confirmation...`);

					await waitForTransaction(withdrawHash);
				}
			}

			// Step 2: Deactivate/remove the order
			// Security: Validate orderbook address is trusted
			validateOrderbookAddress(order.orderbook, network);

			const removeCalldata = order.getRemoveCalldata();
			if (removeCalldata.error) {
				throw new Error(removeCalldata.error.readableMsg);
			}

			awaitWalletConfirmation('Awaiting wallet confirmation to cancel order...');

			const hash = await sendTransaction({
				to: order.orderbook as `0x${string}`,
				data: removeCalldata.value as Hex
			});

			awaitWalletConfirmation('Awaiting transaction confirmation...');

			await waitForTransaction(hash);

			const raindexLink = createRaindexLink(network.id, order.orderbook, quote.orderHash);

			// Invalidate queries for the tokens involved in this order
			const tokenAddresses = [getMakerInputTokenAddress(quote), getMakerOutputTokenAddress(quote)].filter(Boolean);
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
	const handleWithdrawFromOrder = async (quote: {
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
		const network = get(currentNetwork);
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
					validateOrderbookAddress(order.orderbook, network);

					const removeCalldata = order.getRemoveCalldata();
					if (removeCalldata.error) {
						throw new Error(removeCalldata.error.readableMsg);
					}

					awaitWalletConfirmation('Awaiting wallet confirmation to deactivate order...');

					const removeHash = await sendTransaction({
						to: order.orderbook as `0x${string}`,
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
				const tokenAddrs = [getMakerInputTokenAddress(quote), getMakerOutputTokenAddress(quote)].filter(Boolean);
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
				validateOrderbookAddress(vault.orderbook, network);

				const vaultWithdrawCalldata = await vault.getWithdrawCalldata(vault.balance);
				if (vaultWithdrawCalldata.error) {
					throw new Error(vaultWithdrawCalldata.error.readableMsg);
				}

				awaitWalletConfirmation(
					`Awaiting wallet confirmation for withdrawal ${i + 1}/${vaultsWithBalance.length}...`
				);

				lastHash = await sendTransaction({
					to: vault.orderbook as `0x${string}`,
					data: vaultWithdrawCalldata.value as Hex
				});

				awaitWalletConfirmation(`Awaiting transaction confirmation...`);

				await waitForTransaction(lastHash);
			}

			const chainId = network.id;
			const raindexLink = createRaindexLink(chainId, quote.orderbookId || '', quote.orderHash);

			// Invalidate queries for the tokens involved in this order
			const tokenAddrs = [getMakerInputTokenAddress(quote), getMakerOutputTokenAddress(quote)].filter(Boolean);
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

	// The 5 market-take orchestration methods + ensureBulkPayerAllowanceIfNeeded helper
	// were lifted into ./marketTakeStore (TRADE-02 PR-2). They are re-exported via
	// the façade at the bottom of this file so the 15+ existing UI consumers
	// (TransactionModal, MarketOrder, QuickTrade, +page.svelte, etc.) keep working
	// unchanged. marketOrderExecution.ts now imports them from $lib/stores/marketTakeStore
	// directly — that's what severs the circular-import edge.

	const handleFolioDeploy = async (args: FolioDeploymentArgs) => {
		const network = get(currentNetwork);
		awaitWalletConfirmation(`Preparing strategy...`);
		const { composedRainlang, deploymentArgs } = await getFolioDeploymentArgs(network, args);

		showRainlangConfirmation(composedRainlang, deploymentArgs);
	};

	return {
		subscribe,
		reset,
		checkingWalletAllowance,
		awaitWalletConfirmation,
		awaitApprovalTx,
		transactionSuccess,
		transactionError,
		acknowledgeMultiTx,
		handleDcaDeploy,
		handleLimitDeploy,
		handleDsfDeploy,
		handleFolioDeploy,
		handleOracleOrders,
		preloadAggregatedTakeOrdersCalldata,
		handleAggregatedTakeOrdersCalldata,
		handleTakeOrders,
		handleWithdraw,
		handleWrapUnwrap,
		handleRemoveOrder,
		handleWithdrawFromOrder
	};
};

export default transactionStore();

// ---------------------------------------------------------------------------
// Re-export façade for back-compat (TRADE-02 PR-1).
//
// New code should import from the focused module directly (transactionShared
// today; deployTransactionStore + marketTakeStore land in Plans 03/04).
//
// PRESERVED until at least the end of Phase 2 to avoid breaking the 15+
// existing UI binding sites that do
//   `import transactionStore, { TransactionStatus } from '$lib/stores/transaction'`.
// ---------------------------------------------------------------------------
// prettier-ignore
export { TransactionStatus, classifyError, validateOrderbookAddress, isOrderbookTrusted, extractTransactionError };
// prettier-ignore
export type { TransactionMetadata, MarketOrderSummary, RaindexLink, MultiTxProgress, AssetTokenInfo };
