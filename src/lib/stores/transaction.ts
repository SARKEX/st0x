import { get, writable } from 'svelte/store';
import { currentNetwork } from '$lib/stores';
import {
	decodeFunctionData,
	encodeFunctionData,
	erc20Abi,
	formatUnits,
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

/** After a take confirms, wait before the next leg so RPC/oracle match on-chain state (multi-tx routes). */
const SETTLE_MS_BEFORE_NEXT_TAKE_ORDER_LEG = 2500;

// Wrapped wagmi functions with retry logic
const readContract: typeof wagmiReadContract = ((...args: Parameters<typeof wagmiReadContract>) =>
	withRetry(() => wagmiReadContract(...args))) as typeof wagmiReadContract;

// Unified send transaction (works with both Dynamic and wagmi wallets)
const sendTransaction = walletServiceSendTransaction;

// Unified wait for transaction (works with both Dynamic and wagmi wallets, includes retry logic)
const waitForTransaction = walletServiceWaitForTransaction;
import {
	type SgOrder,
	type TakeOrdersConfigV5,
	type DeploymentTransactionArgs,
	type RaindexVault,
	type RaindexOrder,
	type TakeOrdersMode,
	type TakeOrdersRequest
} from '@rainlanguage/orderbook';
import { Float } from '@rainlanguage/float';
import {
	parseFloatHex,
	getRaindexOrderUrl,
	getRaindexVaultUrl,
	isPaymentToken
} from '$lib/utils/tokenMath';
import { TransactionErrorMessage } from '$lib/types/errors';
import { isStaleWalletSessionError, handleStaleWalletSession } from '$lib/utils/walletUtils';
import type { TakeOrdersParams } from '$lib/types/transactions';
import { wagmiConfig } from 'svelte-wagmi';
import { walletAddress, authMethod } from '$lib/stores/authStore';
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
import { getTrades } from '$lib/api/subgraph';

/**
 * Classify error messages into safe, non-sensitive categories for analytics.
 * Avoids sending raw error messages that may contain addresses, keys, or internal details.
 */
function classifyError(error: unknown): string {
	const msg = ((error as Error)?.message ?? '').toLowerCase();
	if (msg.includes('user rejected') || msg.includes('user denied')) return 'user_rejected';
	if (msg.includes('insufficient funds') || msg.includes('exceeds balance'))
		return 'insufficient_funds';
	if (msg.includes('allowance') || msg.includes('exceeds allowance'))
		return 'insufficient_allowance';
	if (msg.includes('nonce')) return 'nonce_error';
	if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
	if (msg.includes('network') || msg.includes('disconnected')) return 'network_error';
	if (msg.includes('header not found') || msg.includes('block not found')) return 'rpc_error';
	if (msg.includes('gas')) return 'gas_error';
	if (msg.includes('reverted') || msg.includes('revert')) return 'transaction_reverted';
	return 'unknown';
}

/**
 * Validates that an orderbook address is in the trusted whitelist for the current network.
 * This prevents transactions to malicious contracts if the API or subgraph is compromised.
 *
 * @param orderbookAddress - The orderbook address to validate
 * @param network - The current network configuration
 * @returns true if the orderbook is trusted, false otherwise
 */
function isOrderbookTrusted(orderbookAddress: string, network: Network): boolean {
	const normalizedAddress = orderbookAddress.toLowerCase();
	return network.trustedOrderbooks.some((trusted) => trusted.toLowerCase() === normalizedAddress);
}

/**
 * Throws an error if the orderbook address is not in the trusted whitelist.
 * Call this before sending any transaction to an orderbook contract.
 */
function validateOrderbookAddress(orderbookAddress: string, network: Network): void {
	if (!isOrderbookTrusted(orderbookAddress, network)) {
		console.error('[Security] Untrusted orderbook address blocked:', {
			address: orderbookAddress,
			trustedOrderbooks: network.trustedOrderbooks
		});
		throw new Error(
			'Transaction blocked: Untrusted orderbook contract. Please contact support if this is unexpected.'
		);
	}
}

// Extract error message from transaction errors using standard Viem error hierarchy
function extractTransactionError(
	error: unknown,
	fallback: TransactionErrorMessage = TransactionErrorMessage.GENERIC
): TransactionErrorMessage {
	const err = error as { cause?: { details?: string }; message?: string };
	return (err?.cause?.details || err?.message || fallback) as TransactionErrorMessage;
}

/**
 * Decide if a failing maker leg can be skipped and routed to the next leg.
 * We only skip execution/simulation-style maker failures, and never skip
 * user/session/network/funds/allowance class errors.
 */
function isSkippableMakerLegError(message: string | undefined): boolean {
	if (!message) return false;
	const normalized = message.toLowerCase();

	// Never skip user/session/wallet/rpc/accounting failures.
	if (
		normalized.includes('user rejected') ||
		normalized.includes('user denied') ||
		normalized.includes('authentication') ||
		normalized.includes('log in') ||
		normalized.includes('allowance') ||
		normalized.includes('insufficient funds') ||
		normalized.includes('exceeds balance') ||
		normalized.includes('nonce') ||
		normalized.includes('network') ||
		normalized.includes('disconnected')
	) {
		return false;
	}

	// Skip leg-level simulation / revert style errors.
	return (
		normalized.includes('preflight check failed') ||
		normalized.includes('order failed simulation') ||
		normalized.includes('execution reverted') ||
		normalized.includes('reverted')
	);
}

function buildExpectedPriceByOrderHash(
	simulation: TakeOrdersParams['simulation'] | undefined
): Map<string, number> {
	const result = new Map<string, number>();
	for (const fill of simulation?.fills ?? []) {
		const hash = fill.quote.orderHash?.toLowerCase();
		if (!hash) continue;
		if (!Number.isFinite(fill.price) || fill.price <= 0) continue;
		if (!result.has(hash)) {
			result.set(hash, fill.price);
		}
	}
	return result;
}

function formatPriceForReroute(value: number | undefined): string | null {
	if (value === undefined || !Number.isFinite(value) || value <= 0) return null;
	return value.toFixed(6);
}

function shortOrderHash(hash: string | undefined): string {
	if (!hash) return 'unknown order';
	return hash.length > 14 ? `${hash.slice(0, 10)}...${hash.slice(-4)}` : hash;
}

function buildLegRerouteMessage(args: {
	fromOrderHash?: string;
	toOrderHash?: string;
	fromPrice?: number;
	toPrice?: number;
}): string {
	const fromHash = shortOrderHash(args.fromOrderHash);
	const toHash = shortOrderHash(args.toOrderHash);
	const fromPrice = formatPriceForReroute(args.fromPrice);
	const toPrice = formatPriceForReroute(args.toPrice);
	if (fromPrice && toPrice) {
		return `Maker leg ${fromHash} is not executable now. Routing to ${toHash} at updated ratio (${fromPrice} -> ${toPrice}).`;
	}
	return `Maker leg ${fromHash} is not executable now. Routing remaining size to ${toHash}.`;
}

function buildMakerRerouteNotice(args: {
	chainId: number;
	orderbookId: string;
	fromOrderHash?: string;
	toOrderHash?: string;
	fromPrice?: number;
	toPrice?: number;
}): MakerRerouteNotice {
	const fromOrderHash = args.fromOrderHash ?? 'unknown';
	const toOrderHash = args.toOrderHash ?? 'unknown';
	return {
		message: buildLegRerouteMessage(args),
		fromOrderHash,
		fromOrderUrl: getRaindexOrderUrl(args.chainId, args.orderbookId, fromOrderHash),
		toOrderHash,
		toOrderUrl: getRaindexOrderUrl(args.chainId, args.orderbookId, toOrderHash)
	};
}

function buildExecutionPlanNotice(args: {
	chainId: number;
	orderbookId: string;
	orderHashes: string[];
	fillAmounts: bigint[];
	fillDecimals: number;
	fillSymbol: string;
}): ExecutionPlanNotice {
	const legs = args.orderHashes.map((orderHash, index) => ({
		orderHash,
		orderUrl: getRaindexOrderUrl(args.chainId, args.orderbookId, orderHash),
		fillAmountDisplay: `${formatUnits(args.fillAmounts[index] ?? 0n, args.fillDecimals)} ${args.fillSymbol}`
	}));
	return {
		title: 'This market order will be split across multiple maker orders.',
		legs
	};
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

import { ZERO_FLOAT_HEX } from '$lib/config/constants';

export enum TransactionStatus {
	IDLE = 'Idle',
	CHECKING_ALLOWANCE = 'Checking your approved spend...',
	PENDING_WALLET = 'Waiting for wallet confirmation...',
	PENDING_APPROVAL = 'Approving spend...',
	PENDING_MULTI_TX_ACKNOWLEDGMENT = 'Multiple transactions required',
	SUCCESS = 'Success! Transaction confirmed',
	ERROR = 'Something went wrong'
}

export interface MarketOrderSummary {
	inputAmount: bigint; // What the user RECEIVES
	inputTokenDecimals: number;
	inputTokenSymbol: string;
	inputTokenAddress: string;
	outputAmount: bigint; // What the user GIVES AWAY
	outputTokenDecimals: number;
	outputTokenSymbol: string;
	outputTokenAddress: string;
	requestedInputAmount: bigint; // What the user requested to receive
	ioRatio: number; // input per output (how much input received per unit output given)
	actualSlippage: bigint;
	isPartialFill: boolean;
	isNoFill?: boolean;
}

// Asset token info for Track in Wallet prompt after order deployment
export interface AssetTokenInfo {
	address: string;
	symbol: string;
	decimals: number;
}

// Multi-transaction tracking for split orders
export interface MultiTxProgress {
	currentBatch: number;
	totalBatches: number;
}

export interface RaindexLink {
	url: string;
	text: string;
}

export interface MakerRerouteNotice {
	message: string;
	fromOrderHash: string;
	fromOrderUrl: string;
	toOrderHash: string;
	toOrderUrl: string;
}

export interface ExecutionPlanLeg {
	orderHash: string;
	orderUrl: string;
	fillAmountDisplay: string;
}

export interface ExecutionPlanNotice {
	title: string;
	legs: ExecutionPlanLeg[];
}

export interface TransactionMetadata {
	marketOrderSummary?: MarketOrderSummary;
	assetTokenInfo?: AssetTokenInfo; // For limit/DCA order deployments
	multiTxProgress?: MultiTxProgress; // For split order transactions
	raindexLink?: RaindexLink; // Safe link data (replaces @html)
	makerRerouteNotice?: MakerRerouteNotice;
	executionPlanNotice?: ExecutionPlanNotice;
}

const initialState = {
	status: TransactionStatus.IDLE,
	error: '',
	hash: '',
	data: null as TransactionMetadata | null,
	functionName: '',
	message: '',
	multiTxAcknowledged: false,
	onMultiTxDecision: null as ((approved: boolean) => void) | null,
	onMakerRerouteDecision: null as ((approved: boolean) => void) | null
};

const transactionStore = () => {
	const { subscribe, set, update } = writable(initialState);
	const reset = () => set(initialState);

	// Generic state update helper
	const setState = (
		status: TransactionStatus,
		options: {
			message?: string;
			hash?: string;
			error?: string;
			data?: TransactionMetadata | null;
		} = {}
	) =>
		update((state) => ({
			...state,
			status,
			message: options.message ?? '',
			hash: options.hash ?? '',
			error: options.error ?? '',
			data: options.data ?? null
		}));

	const checkingWalletAllowance = (message?: string) =>
		setState(TransactionStatus.CHECKING_ALLOWANCE, { message });
	const awaitWalletConfirmation = (message?: string, data?: TransactionMetadata) =>
		setState(TransactionStatus.PENDING_WALLET, { message, data });
	const awaitApprovalTx = (hash: string) => setState(TransactionStatus.PENDING_APPROVAL, { hash });
	const transactionSuccess = (hash: string, message?: string, data?: TransactionMetadata) =>
		setState(TransactionStatus.SUCCESS, { hash, message, data });
	const transactionError = (message: TransactionErrorMessage, hash?: string) =>
		setState(TransactionStatus.ERROR, { error: message, hash });

	const requestExecutionPlanConsent = async (
		message: string,
		data?: TransactionMetadata
	): Promise<boolean> => {
		return new Promise<boolean>((resolve) => {
			update((state) => ({
				...state,
				status: TransactionStatus.PENDING_MULTI_TX_ACKNOWLEDGMENT,
				message,
				data: data ?? state.data,
				onMultiTxDecision: (approved: boolean) => {
					update((s) => ({ ...s, onMultiTxDecision: null }));
					resolve(approved);
				}
			}));
		});
	};

	const acknowledgeMultiTx = () => {
		update((state) => {
			if (state.onMultiTxDecision) {
				state.onMultiTxDecision(true);
			}
			return state;
		});
	};

	const declineMultiTx = () => {
		update((state) => {
			if (state.onMultiTxDecision) {
				state.onMultiTxDecision(false);
			}
			return state;
		});
	};

	const requestMakerRerouteConsent = async (
		message: string,
		notice: MakerRerouteNotice,
		data?: TransactionMetadata
	): Promise<boolean> => {
		return new Promise<boolean>((resolve) => {
			update((state) => ({
				...state,
				status: TransactionStatus.PENDING_WALLET,
				message,
				data: {
					...(data ?? {}),
					makerRerouteNotice: notice
				},
				onMakerRerouteDecision: (approved: boolean) => {
					update((s) => ({ ...s, onMakerRerouteDecision: null }));
					resolve(approved);
				}
			}));
		});
	};

	const respondToMakerReroute = (approved: boolean) => {
		update((state) => {
			if (state.onMakerRerouteDecision) {
				state.onMakerRerouteDecision(approved);
			}
			return state;
		});
	};

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

			await waitForTransaction(hash);

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
					outputTokenAddress: quote.outputTokenAddress,
					inputVaultId: quote.inputVaultId,
					inputTokenAddress: quote.inputTokenAddress,
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
						quote.outputTokenAddress
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
						quote.inputTokenAddress
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
			const tokenAddresses = [quote.inputTokenAddress, quote.outputTokenAddress].filter(Boolean);
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
						quote.inputTokenAddress
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
						quote.outputTokenAddress
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
						quote.inputTokenAddress
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
				const tokenAddrs = [quote.inputTokenAddress, quote.outputTokenAddress].filter(Boolean);
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
			const tokenAddrs = [quote.inputTokenAddress, quote.outputTokenAddress].filter(Boolean);
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

	/**
	 * One `approve(spender, totalWei)` for multi-leg takes. Per-leg SDK calldata only approves that
	 * leg’s spend, so the first tx can consume the allowance and the second leg would ask to approve again.
	 */
	const ensureBulkPayerAllowanceIfNeeded = async (args: {
		requiredWei: bigint;
		payerToken: `0x${string}`;
		symbol: string;
		owner: `0x${string}`;
		probeApprovalCalldata: Hex;
	}) => {
		const { requiredWei, payerToken, symbol, owner, probeApprovalCalldata } = args;
		if (requiredWei <= 0n) return;

		const decoded = decodeFunctionData({ abi: erc20Abi, data: probeApprovalCalldata });
		if (decoded.functionName !== 'approve') return;
		const spender = decoded.args[0] as `0x${string}`;

		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');

		const allowance = await readContract(config, {
			address: payerToken,
			abi: erc20Abi,
			functionName: 'allowance',
			args: [owner, spender],
		});
		if (allowance >= requiredWei) return;

		awaitWalletConfirmation(`Awaiting wallet confirmation to approve ${symbol}...`);
		const approvalHash = await sendTransaction({
			to: payerToken,
			data: encodeFunctionData({
				abi: erc20Abi,
				functionName: 'approve',
				args: [spender, requiredWei],
			}),
		});
		awaitApprovalTx(approvalHash);
		await waitForTransaction(approvalHash, { confirmations: APPROVAL_TX_CONFIRMATIONS });
	};

	/**
	 * Shared post-transaction logic for take orders: poll subgraph for trades,
	 * build a MarketOrderSummary, and return a transactionSuccess result.
	 */
	const pollAndFinalizeTakeOrders = async (
		allTransactionHashes: Hash[],
		primaryOrder: SgOrder,
		params: TakeOrdersParams,
		network: Network
	) => {
		const hash = allTransactionHashes[allTransactionHashes.length - 1];

		const pollPendingTrades = async () => {
			const MAX_ATTEMPTS = 60;
			const totalBatches = allTransactionHashes.length;

			for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
				const now = Math.floor(Date.now() / 1000);
				const trades = await getTrades(now - 600, now, network);
				const allTrades = trades.filter((t) =>
					allTransactionHashes.some(
						(txHash) => t.tradeEvent?.transaction?.id.toLowerCase() === txHash.toLowerCase()
					)
				) as unknown as Array<{
					tradeEvent?: { transaction?: { id?: string } };
					order?: { orderHash?: string };
					inputVaultBalanceChange?: { amount?: Hex; oldVaultBalance?: Hex; newVaultBalance?: Hex };
					outputVaultBalanceChange?: { amount?: Hex; oldVaultBalance?: Hex; newVaultBalance?: Hex };
				}>;

				const validTrades = allTrades.filter(
					(t) => t.inputVaultBalanceChange?.amount && t.outputVaultBalanceChange?.amount
				);

				if (totalBatches > 1) {
					const indexedTxHashes = new Set(
						validTrades.map((t) => t.tradeEvent?.transaction?.id?.toLowerCase())
					);
					const allBatchesIndexed = allTransactionHashes.every((txHash) =>
						indexedTxHashes.has(txHash.toLowerCase())
					);
					if (allBatchesIndexed) return validTrades;
					if (attempt >= 6 && validTrades.length > 0) return validTrades;
				} else {
					if (validTrades.length > 0) return validTrades;
				}

				await new Promise((resolve) => setTimeout(resolve, 5_000));
			}
			return [];
		};

		const validTrades = await pollPendingTrades();

		if (validTrades.length === 0) {
			return transactionError(TransactionErrorMessage.GENERIC, hash);
		}

		const inputTokenDecimals = params.takerWantsToken.decimals;
		const inputTokenSymbol = params.takerWantsToken.symbol;
		const inputTokenAddress = params.takerWantsToken.address;
		const outputTokenDecimals = params.takerPaysToken.decimals;
		const outputTokenSymbol = params.takerPaysToken.symbol;
		const outputTokenAddress = params.takerPaysToken.address;

		let totalInputAmount = 0n;
		let totalOutputAmount = 0n;
		for (const trade of validTrades) {
			totalInputAmount += parseFloatHex(
				trade.outputVaultBalanceChange!.amount as Hex,
				inputTokenDecimals,
				true
			);
			totalOutputAmount += parseFloatHex(
				trade.inputVaultBalanceChange!.amount as Hex,
				outputTokenDecimals,
				true
			);
		}

		const actualIoRatio =
			totalOutputAmount > 0n
				? parseFloat(formatUnits(totalInputAmount, inputTokenDecimals)) /
					parseFloat(formatUnits(totalOutputAmount, outputTokenDecimals))
				: 0;

		const requestedInputAmount = params.requestedTakerWantsAmount;
		const inputFilledDecimal = parseFloat(formatUnits(totalInputAmount, inputTokenDecimals));
		const inputRequestedDecimal = parseFloat(formatUnits(requestedInputAmount, inputTokenDecimals));

		let isNoFill = false;
		if (inputRequestedDecimal <= 0) {
			isNoFill = true;
		}

		// Partial fill: bigint ratio only. Below ~99.7% of requested ⇒ partial (execution haircut is 0; allow subgraph noise).
		const MARKET_ORDER_FULL_FILL_THRESHOLD_BPS = 9970n;
		const isPartialFill =
			requestedInputAmount > 0n &&
			totalInputAmount > 0n &&
			totalInputAmount * 10_000n < requestedInputAmount * MARKET_ORDER_FULL_FILL_THRESHOLD_BPS;

		const summary: MarketOrderSummary = {
			inputAmount: totalInputAmount,
			inputTokenDecimals,
			inputTokenSymbol,
			inputTokenAddress,
			outputAmount: totalOutputAmount,
			outputTokenDecimals,
			outputTokenSymbol,
			outputTokenAddress,
			requestedInputAmount,
			ioRatio: actualIoRatio,
			actualSlippage: 0n,
			isPartialFill,
			isNoFill
		};

		const raindexLink = createRaindexLink(
			network.id,
			primaryOrder.orderbook.id,
			primaryOrder.orderHash,
			'View order on Raindex'
		);

		invalidateDashboardBalances();
		return transactionSuccess(hash, undefined, { marketOrderSummary: summary, raindexLink });
	};

	/**
	 * Single-tx market take via RaindexClient.getTakeOrdersCalldata(): subgraph discovery +
	 * one takeOrders4 call that can aggregate multiple maker orders (solves thin top-of-book).
	 *
	 * @returns `true` if this path handled the flow (success or user-visible error).
	 *          `false` if aggregated calldata is not available — caller should fall back to per-order execution.
	 */
	const handleAggregatedTakeOrdersCalldata = async (
		takeRequest: TakeOrdersRequest,
		primaryOrder: SgOrder,
		params: TakeOrdersParams,
		approvalTokenSymbol: string
	): Promise<boolean> => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const network = get(currentNetwork) as Network;

		try {
			validateOrderbookAddress(primaryOrder.orderbook.id, network);
		} catch (error) {
			transactionError((error as Error).message as TransactionErrorMessage);
			return true;
		}

		awaitWalletConfirmation(`Preparing order...`);
		const TX_LOG_PREFIX = '[handleAggregatedTakeOrdersCalldata]';

		const client = await createRaindexClient();
		let calldataWrapped = await client.getTakeOrdersCalldata(takeRequest);
		if (calldataWrapped.error || !calldataWrapped.value) {
			console.log(`${TX_LOG_PREFIX} skipping fallback: SDK returned no aggregated calldata`, {
				msg: calldataWrapped.error?.readableMsg
			});
			return false;
		}

		let result = calldataWrapped.value;
		const maybeApprovalInfo = (result as { approvalInfo?: { token: string; calldata: string } })
			?.approvalInfo;
		if (result.isNeedsApproval && maybeApprovalInfo) {
			awaitWalletConfirmation(`Awaiting wallet confirmation to approve ${approvalTokenSymbol}...`);
			const approvalHash = await sendTransaction({
				to: maybeApprovalInfo.token as `0x${string}`,
				data: maybeApprovalInfo.calldata as Hex
			});
			awaitApprovalTx(approvalHash);
			await waitForTransaction(approvalHash, { confirmations: APPROVAL_TX_CONFIRMATIONS });
			calldataWrapped = await client.getTakeOrdersCalldata(takeRequest);
			if (calldataWrapped.error || !calldataWrapped.value) {
				transactionError(
					(calldataWrapped.error?.readableMsg ||
						'Failed to prepare order after approval') as TransactionErrorMessage
				);
				return true;
			}
			result = calldataWrapped.value;
		}

		if (!result.isReady || !result.takeOrdersInfo) {
			for (let retry = 0; retry < 2; retry++) {
				await new Promise((resolve) => setTimeout(resolve, 1200));
				calldataWrapped = await client.getTakeOrdersCalldata(takeRequest);
				if (!calldataWrapped.error && calldataWrapped.value?.isReady && calldataWrapped.value?.takeOrdersInfo) {
					result = calldataWrapped.value;
					break;
				}
			}
		}

		if (!result.isReady || !result.takeOrdersInfo) {
			console.log(`${TX_LOG_PREFIX} skipping fallback: aggregated calldata not ready`, {
				isReady: result.isReady
			});
			return false;
		}

		try {
			validateOrderbookAddress(result.takeOrdersInfo.orderbook as string, network);
		} catch (error) {
			transactionError((error as Error).message as TransactionErrorMessage);
			return true;
		}

		const { calldata, orderbook } = result.takeOrdersInfo;
		console.log(`${TX_LOG_PREFIX} sending aggregated takeOrders tx`, { orderbook });

		try {
			awaitWalletConfirmation(`Awaiting wallet confirmation...`);
			const hash = await sendTransaction({
				to: orderbook as `0x${string}`,
				data: calldata as Hex
			});
			awaitWalletConfirmation(`Awaiting transaction confirmation...`);
			await waitForTransaction(hash);
			await pollAndFinalizeTakeOrders([hash], primaryOrder, params, network);
			return true;
		} catch (txError) {
			console.error(`${TX_LOG_PREFIX} failed`, txError);
			if (isStaleWalletSessionError(txError)) {
				const msg = await handleStaleWalletSession(config);
				transactionError(msg as TransactionErrorMessage);
				return true;
			}
			const errorMessage = extractTransactionError(txError);
			const errorStr = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : '';
			if (errorStr.includes('allowance') || errorStr.includes('insufficient')) {
				transactionError(
					'Insufficient token allowance. This is a known issue. Please retry the order.' as TransactionErrorMessage
				);
				return true;
			}
			if (errorStr.includes('authentication') || errorStr.includes('log in')) {
				transactionError(errorMessage);
				return true;
			}
			transactionError(errorMessage);
			return true;
		}
	};

	/**
	 * Executes market orders for oracle-enabled orders using RaindexOrder.getTakeCalldata(),
	 * which internally calls the oracle server to populate signedContext.
	 */
	interface OracleOrderInput {
		raindexOrder: RaindexOrder;
		inputIndex: number;
		outputIndex: number;
		amountStr: string;
		priceCapStr: string;
		taker: string;
	}

	const handleOracleOrders = async (
		oracleInputs: OracleOrderInput[],
		mode: TakeOrdersMode,
		primaryOrder: SgOrder,
		approvalTokenSymbol: string,
		params: TakeOrdersParams
	) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const $signerAddress = get(walletAddress);
		if (!$signerAddress) throw new Error('Signer address not found');

		const network = get(currentNetwork) as Network;

		try {
			validateOrderbookAddress(primaryOrder.orderbook.id, network);
		} catch (error) {
			return transactionError((error as Error).message as TransactionErrorMessage);
		}

		// Send one transaction per oracle order; getTakeCalldata() calls oracle server internally
		awaitWalletConfirmation(`Preparing order...`);
		const allTransactionHashes: Hash[] = [];
		const TX_LOG_PREFIX = '[handleOracleOrders]';
		const expectedPriceByOrderHash = buildExpectedPriceByOrderHash(params.simulation);
		const multiLegUseTotalAllowance =
			oracleInputs.length > 1 &&
			(params.requiredPayerAllowance ?? 0n) > 0n &&
			params.takerPaysToken.address;

		console.log(`${TX_LOG_PREFIX} starting`, {
			oracleInputCount: oracleInputs.length,
			mode
		});

		if (multiLegUseTotalAllowance && params.requiredPayerAllowance) {
			const o0 = oracleInputs[0];
			const probe = await o0.raindexOrder.getTakeCalldata(
				o0.inputIndex,
				o0.outputIndex,
				o0.taker,
				mode,
				o0.amountStr,
				o0.priceCapStr
			);
			const probePayload = (probe.value as { isNeedsApproval?: boolean; approvalInfo?: { calldata?: string } })
				?.approvalInfo?.calldata;
			if ((probe.value as { isNeedsApproval?: boolean })?.isNeedsApproval && probePayload) {
				await ensureBulkPayerAllowanceIfNeeded({
					requiredWei: params.requiredPayerAllowance,
					payerToken: params.takerPaysToken.address as `0x${string}`,
					symbol: approvalTokenSymbol,
					owner: $signerAddress as `0x${string}`,
					probeApprovalCalldata: probePayload as Hex,
				});
			}
		}

		const fillDecimals = params.orderFillDecimals ?? params.takerWantsToken.decimals;
		if (oracleInputs.length > 1) {
			const proceed = await requestExecutionPlanConsent(
				`This order requires ${oracleInputs.length} separate transactions. Review exact per-order fills and confirm to continue.`,
				{
					multiTxProgress: { currentBatch: 0, totalBatches: oracleInputs.length },
					executionPlanNotice: buildExecutionPlanNotice({
						chainId: network.id,
						orderbookId: primaryOrder.orderbook.id,
						orderHashes: oracleInputs.map((o) => o.raindexOrder.orderHash),
						fillAmounts: params.orderFillAmounts ?? [],
						fillDecimals,
						fillSymbol: params.takerWantsToken.symbol
					})
				}
			);
			if (!proceed) {
				return transactionError('Transaction cancelled by user before multi-order execution.' as TransactionErrorMessage);
			}
		}
		let carryForwardFillAmount = 0n;

		for (let i = 0; i < oracleInputs.length; i++) {
			const oracleInput = oracleInputs[i];
			const isLast = i === oracleInputs.length - 1;
			const batchLabel = oracleInputs.length > 1 ? ` (${i + 1}/${oracleInputs.length})` : '';
			const baseFillAmount = params.orderFillAmounts?.[i] ?? 0n;
			const effectiveFillAmount = baseFillAmount + carryForwardFillAmount;
			const amountStr = String(
				Float.fromFixedDecimalLossy(effectiveFillAmount, fillDecimals).float.format().value ?? '0'
			);

			if (i > 0) {
				await new Promise((resolve) => setTimeout(resolve, SETTLE_MS_BEFORE_NEXT_TAKE_ORDER_LEG));
				awaitWalletConfirmation(
					`Waiting for network to settle before preparing order ${i + 1} of ${oracleInputs.length}...`
				);
			}

			let calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
				oracleInput.inputIndex,
				oracleInput.outputIndex,
				oracleInput.taker,
				mode,
				amountStr,
				oracleInput.priceCapStr
			);

			const maybeApprovalInfo = (calldataResult.value as { approvalInfo?: { token: string; calldata: string } })
				?.approvalInfo;
			if ((calldataResult.value as { isNeedsApproval?: boolean })?.isNeedsApproval && maybeApprovalInfo) {
				if (multiLegUseTotalAllowance) {
					// Allowance already set for total spend; refresh calldata only.
					calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
						oracleInput.inputIndex,
						oracleInput.outputIndex,
						oracleInput.taker,
						mode,
						amountStr,
						oracleInput.priceCapStr
					);
					if (
						(calldataResult.value as { isNeedsApproval?: boolean })?.isNeedsApproval &&
						maybeApprovalInfo
					) {
						awaitWalletConfirmation(`Awaiting wallet confirmation to approve ${approvalTokenSymbol}...`);
						const approvalHash = await sendTransaction({
							to: maybeApprovalInfo.token as `0x${string}`,
							data: maybeApprovalInfo.calldata as Hex
						});
						awaitApprovalTx(approvalHash);
						await waitForTransaction(approvalHash, { confirmations: APPROVAL_TX_CONFIRMATIONS });
						calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
							oracleInput.inputIndex,
							oracleInput.outputIndex,
							oracleInput.taker,
							mode,
							amountStr,
							oracleInput.priceCapStr
						);
					}
				} else {
					awaitWalletConfirmation(`Awaiting wallet confirmation to approve ${approvalTokenSymbol}...`);
					const approvalHash = await sendTransaction({
						to: maybeApprovalInfo.token as `0x${string}`,
						data: maybeApprovalInfo.calldata as Hex
					});
					awaitApprovalTx(approvalHash);
					await waitForTransaction(approvalHash, { confirmations: APPROVAL_TX_CONFIRMATIONS });

					// Rebuild calldata after approval, as SDK expects fresh quote/context.
					calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
						oracleInput.inputIndex,
						oracleInput.outputIndex,
						oracleInput.taker,
						mode,
						amountStr,
						oracleInput.priceCapStr
					);
				}
			}

			// Oracle quote/signature readiness can be transient; retry briefly before failing.
			// Later legs need more attempts after the previous tx changed on-chain / oracle state.
			const notReadyRetries = i === 0 ? 2 : 4;
			if (!calldataResult.error && (!calldataResult.value?.isReady || !calldataResult.value?.takeOrdersInfo)) {
				for (let retry = 0; retry < notReadyRetries; retry++) {
					await new Promise((resolve) => setTimeout(resolve, 1200));
					calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
						oracleInput.inputIndex,
						oracleInput.outputIndex,
						oracleInput.taker,
						mode,
						amountStr,
						oracleInput.priceCapStr
					);
					if (calldataResult.error || (calldataResult.value?.isReady && calldataResult.value?.takeOrdersInfo)) {
						break;
					}
				}
			}
			// Second+ legs: transient SDK/oracle errors (common right after leg 1 confirms).
			if (calldataResult.error && i > 0) {
				for (let retry = 0; retry < 3; retry++) {
					await new Promise((resolve) => setTimeout(resolve, 1500));
					calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
						oracleInput.inputIndex,
						oracleInput.outputIndex,
						oracleInput.taker,
						mode,
						amountStr,
						oracleInput.priceCapStr
					);
					if (!calldataResult.error) break;
				}
			}
			console.log(`${TX_LOG_PREFIX} getTakeCalldata result`, {
				index: i,
				orderHash: oracleInput.raindexOrder.orderHash,
				inputIndex: oracleInput.inputIndex,
				outputIndex: oracleInput.outputIndex,
				amountStr,
				priceCapStr: oracleInput.priceCapStr,
				isError: Boolean(calldataResult.error),
				isReady: Boolean(calldataResult.value?.isReady),
				hasTakeOrdersInfo: Boolean(calldataResult.value?.takeOrdersInfo),
				error: calldataResult.error?.readableMsg
			});

			if (calldataResult.error) {
				if (isSkippableMakerLegError(calldataResult.error.readableMsg) && i < oracleInputs.length - 1) {
					carryForwardFillAmount = effectiveFillAmount;
					const proceed = await requestMakerRerouteConsent(
						'A quoted maker leg cannot execute as quoted. Continue with rerouted liquidity?',
						buildMakerRerouteNotice({
							chainId: network.id,
							orderbookId: primaryOrder.orderbook.id,
							fromOrderHash: oracleInput.raindexOrder.orderHash,
							toOrderHash: oracleInputs[i + 1]?.raindexOrder.orderHash,
							fromPrice: expectedPriceByOrderHash.get(oracleInput.raindexOrder.orderHash.toLowerCase()),
							toPrice: expectedPriceByOrderHash.get(
								oracleInputs[i + 1]?.raindexOrder.orderHash?.toLowerCase() ?? ''
							)
						})
					);
					if (!proceed) {
						return transactionError('Transaction cancelled by user during maker reroute consent.' as TransactionErrorMessage);
					}
					continue;
				}
				console.error(`${TX_LOG_PREFIX} getTakeCalldata error:`, calldataResult.error);
				return transactionError(
					`Order failed: ${calldataResult.error.readableMsg}` as TransactionErrorMessage
				);
			}

			const result = calldataResult.value;
			if (!result.isReady || !result.takeOrdersInfo) {
				console.warn(`${TX_LOG_PREFIX} Order ${i + 1} not ready`, {
					orderHash: oracleInput.raindexOrder.orderHash,
					isReady: result.isReady,
					hasTakeOrdersInfo: Boolean(result.takeOrdersInfo)
				});
				return transactionError(
					`Order not ready for execution yet. Please refresh quotes and retry.` as TransactionErrorMessage
				);
			}

			const { calldata, orderbook } = result.takeOrdersInfo;

			try {
				awaitWalletConfirmation(`Awaiting wallet confirmation to take order${batchLabel}...`);
				const hash = await sendTransaction({
					to: orderbook as `0x${string}`,
					data: calldata as Hex
				});

				awaitWalletConfirmation(`Awaiting transaction confirmation${batchLabel}...`);
				await waitForTransaction(hash);
				allTransactionHashes.push(hash);
				carryForwardFillAmount = 0n;

				if (!isLast) {
					awaitWalletConfirmation(`Transaction ${i + 1} confirmed. Preparing next order...`);
				} else {
					awaitWalletConfirmation(`Transaction confirmed. Waiting for indexer...`);
				}
			} catch (txError) {
				console.error(`${TX_LOG_PREFIX} Transaction ${i + 1} failed:`, txError);
				if (isStaleWalletSessionError(txError)) {
					const msg = await handleStaleWalletSession(config);
					return transactionError(msg as TransactionErrorMessage);
				}
				const errorMessage = extractTransactionError(txError);
				const errorStr = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : '';
				if (isSkippableMakerLegError(errorMessage) && i < oracleInputs.length - 1) {
					carryForwardFillAmount = effectiveFillAmount;
					const proceed = await requestMakerRerouteConsent(
						'A maker leg failed during execution. Continue with rerouted liquidity?',
						buildMakerRerouteNotice({
							chainId: network.id,
							orderbookId: primaryOrder.orderbook.id,
							fromOrderHash: oracleInput.raindexOrder.orderHash,
							toOrderHash: oracleInputs[i + 1]?.raindexOrder.orderHash,
							fromPrice: expectedPriceByOrderHash.get(oracleInput.raindexOrder.orderHash.toLowerCase()),
							toPrice: expectedPriceByOrderHash.get(
								oracleInputs[i + 1]?.raindexOrder.orderHash?.toLowerCase() ?? ''
							)
						})
					);
					if (!proceed) {
						return transactionError('Transaction cancelled by user during maker reroute consent.' as TransactionErrorMessage);
					}
					continue;
				}
				if (errorStr.includes('allowance') || errorStr.includes('insufficient')) {
					return transactionError(
						'Insufficient token allowance. This is a known issue. Please retry the order.' as TransactionErrorMessage
					);
				}
				if (errorStr.includes('authentication') || errorStr.includes('log in')) {
					return transactionError(errorMessage);
				}
				return transactionError(errorMessage);
			}
		}

		if (allTransactionHashes.length === 0) {
			return transactionError('No orders could be executed. Please try again.' as TransactionErrorMessage);
		}

		return pollAndFinalizeTakeOrders(allTransactionHashes, primaryOrder, params, network);
	};

	/**
	 * Executes a market order by taking existing orders from the orderbook.
	 *
	 * Perspective: TAKER (user executing against orderbook)
	 * - takerWantsToken: What the taker wants to RECEIVE
	 * - takerPaysToken: What the taker will GIVE AWAY
	 * - requestedTakerWantsAmount: Amount taker wants to receive
	 */
	const handleTakeOrders = async (
		args: TakeOrdersConfigV5,
		raindexOrder: SgOrder,
		requiredApprovalAmount: bigint,
		params: TakeOrdersParams,
		recalculateConfig?: () => Promise<TakeOrdersConfigV5 | null>,
		raindexOrders?: RaindexOrder[]
	) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const $signerAddress = get(walletAddress);
		if (!$signerAddress) throw new Error('Signer address not found');

		// Get network early - used for validation and later for subgraph queries
		const network = get(currentNetwork) as Network;

		// Security: Validate orderbook address BEFORE any approvals are granted
		// This prevents a compromised orderbook from receiving token approvals
		try {
			validateOrderbookAddress(raindexOrder.orderbook.id, network);
		} catch (error) {
			return transactionError((error as Error).message as TransactionErrorMessage);
		}

		const inputIndex = params.ioIndexes.input;
		const outputIndex = params.ioIndexes.output;

		// Validate IO indexes are within bounds
		if (!params.orderData.validInputs[inputIndex]) {
			return transactionError('No input token found in order' as TransactionErrorMessage);
		}
		if (!params.orderData.validOutputs[outputIndex]) {
			return transactionError('No output token found in order' as TransactionErrorMessage);
		}

		// Use takerPaysToken from params for approval - this is what the user gives away
		// Note: We don't use raindexOrder.inputs[inputIndex] because SgOrder.inputs from
		// the subgraph may have different ordering than OrderV4.validInputs
		const approvalTokenAddress = params.takerPaysToken.address;
		const approvalTokenSymbol = params.takerPaysToken.symbol;

		// If recalculateConfig is provided, refresh quotes and recalculate config
		// This handles SELL and BUY (spend mode) where prices may have moved during approval
		let finalConfig = args;
		if (recalculateConfig) {
			awaitWalletConfirmation(`Refreshing market prices...`);
			const updatedConfig = await recalculateConfig();
			if (updatedConfig) {
				finalConfig = updatedConfig;
			}
		}

		awaitWalletConfirmation(`Preparing order...`);
		const isDynamicWallet = get(authMethod) === 'dynamic';
		const fillDecimals = params.orderFillDecimals ?? params.takerWantsToken.decimals;
		const mode: TakeOrdersMode = finalConfig.IOIsInput ? 'buyExact' : 'spendExact';
		const priceCapFloat = Float.fromHex(finalConfig.maximumIORatio as `0x${string}`);
		const priceCapStr = String(priceCapFloat.value?.format().value ?? '1');

		const ordersToExecute = raindexOrders ?? [];
		if (ordersToExecute.length === 0) {
			return transactionError('Failed to prepare order execution' as TransactionErrorMessage);
		}

		console.log('[handleTakeOrders] Preparing SDK calldata execution', {
			isDynamicWallet,
			totalOrders: finalConfig.orders.length,
			raindexOrders: ordersToExecute.length,
			hasOrderFillAmounts: !!params.orderFillAmounts,
			orderFillAmounts: params.orderFillAmounts?.map((a) => a.toString()),
			fillDecimals,
			mode,
			priceCapStr
		});

		if (ordersToExecute.length > 1) {
			const proceed = await requestExecutionPlanConsent(
				`This order requires ${ordersToExecute.length} separate transactions. Review exact per-order fills and confirm to continue.`,
				{
					multiTxProgress: { currentBatch: 0, totalBatches: ordersToExecute.length },
					executionPlanNotice: buildExecutionPlanNotice({
						chainId: network.id,
						orderbookId: raindexOrder.orderbook.id,
						orderHashes: ordersToExecute.map((o) => o.orderHash),
						fillAmounts: params.orderFillAmounts ?? [],
						fillDecimals,
						fillSymbol: params.takerWantsToken.symbol
					})
				}
			);
			if (!proceed) {
				return transactionError('Transaction cancelled by user before multi-order execution.' as TransactionErrorMessage);
			}
		}

		const allTransactionHashes: Hash[] = [];
		const TX_LOG_PREFIX = '[handleTakeOrders]';
		const expectedPriceByOrderHash = buildExpectedPriceByOrderHash(params.simulation);

		const multiLegUseTotalAllowance =
			ordersToExecute.length > 1 &&
			requiredApprovalAmount > 0n &&
			params.takerPaysToken.address;

		console.log(`${TX_LOG_PREFIX} Starting SDK per-order execution`, {
			totalOrders: ordersToExecute.length,
			mode,
			isDynamicWallet
		});
		let carryForwardFillAmount = 0n;

		if (multiLegUseTotalAllowance) {
			const order0 = ordersToExecute[0];
			const cfg0 = finalConfig.orders[0];
			if (cfg0) {
				const fill0 = params.orderFillAmounts?.[0] ?? 0n;
				const amountStr0 = String(
					Float.fromFixedDecimalLossy(fill0, fillDecimals).float.format().value ?? '0'
				);
				const probe = await order0.getTakeCalldata(
					Number(cfg0.inputIOIndex),
					Number(cfg0.outputIOIndex),
					$signerAddress,
					mode,
					amountStr0,
					priceCapStr
				);
				const probePayload = (probe.value as { isNeedsApproval?: boolean; approvalInfo?: { calldata?: string } })
					?.approvalInfo?.calldata;
				if ((probe.value as { isNeedsApproval?: boolean })?.isNeedsApproval && probePayload) {
					await ensureBulkPayerAllowanceIfNeeded({
						requiredWei: requiredApprovalAmount,
						payerToken: approvalTokenAddress as `0x${string}`,
						symbol: approvalTokenSymbol,
						owner: $signerAddress as `0x${string}`,
						probeApprovalCalldata: probePayload as Hex,
					});
				}
			}
		}

		for (let orderIndex = 0; orderIndex < ordersToExecute.length; orderIndex++) {
			const orderToExecute = ordersToExecute[orderIndex];
			const orderConfig = finalConfig.orders[orderIndex];
			if (!orderConfig) {
				return transactionError('Order config mismatch' as TransactionErrorMessage);
			}
			if (orderIndex > 0) {
				await new Promise((resolve) => setTimeout(resolve, SETTLE_MS_BEFORE_NEXT_TAKE_ORDER_LEG));
				awaitWalletConfirmation(
					`Waiting for network to settle before preparing order ${orderIndex + 1} of ${ordersToExecute.length}...`
				);
			}
			const isMultiBatch = ordersToExecute.length > 1;
			const batchLabel = isMultiBatch ? ` (${orderIndex + 1}/${ordersToExecute.length})` : '';
			const baseFillAmount = params.orderFillAmounts?.[orderIndex] ?? 0n;
			const fillAmount = baseFillAmount + carryForwardFillAmount;
			const amountStr = String(
				Float.fromFixedDecimalLossy(fillAmount, fillDecimals).float.format().value ?? '0'
			);

			let hash: Hash;
			try {
				const progressData: TransactionMetadata = isMultiBatch
					? {
							multiTxProgress: { currentBatch: orderIndex + 1, totalBatches: ordersToExecute.length }
						}
					: {};
				const calldataResult = await orderToExecute.getTakeCalldata(
					Number(orderConfig.inputIOIndex),
					Number(orderConfig.outputIOIndex),
					$signerAddress,
					mode,
					amountStr,
					priceCapStr
				);

				const maybeApprovalInfo = (
					calldataResult.value as { approvalInfo?: { token: string; calldata: string } }
				)?.approvalInfo;
				let readyCalldataResult = calldataResult;
				if (
					(calldataResult.value as { isNeedsApproval?: boolean })?.isNeedsApproval &&
					maybeApprovalInfo
				) {
					if (multiLegUseTotalAllowance) {
						readyCalldataResult = await orderToExecute.getTakeCalldata(
							Number(orderConfig.inputIOIndex),
							Number(orderConfig.outputIOIndex),
							$signerAddress,
							mode,
							amountStr,
							priceCapStr
						);
						if (
							(readyCalldataResult.value as { isNeedsApproval?: boolean })?.isNeedsApproval &&
							maybeApprovalInfo
						) {
							awaitWalletConfirmation(
								`Awaiting wallet confirmation to approve ${approvalTokenSymbol}${batchLabel}...`,
								progressData
							);
							const approvalHash = await sendTransaction({
								to: maybeApprovalInfo.token as `0x${string}`,
								data: maybeApprovalInfo.calldata as Hex
							});
							awaitApprovalTx(approvalHash);
							await waitForTransaction(approvalHash, { confirmations: APPROVAL_TX_CONFIRMATIONS });
							readyCalldataResult = await orderToExecute.getTakeCalldata(
								Number(orderConfig.inputIOIndex),
								Number(orderConfig.outputIOIndex),
								$signerAddress,
								mode,
								amountStr,
								priceCapStr
							);
						}
					} else {
						awaitWalletConfirmation(
							`Awaiting wallet confirmation to approve ${approvalTokenSymbol}${batchLabel}...`,
							progressData
						);
						const approvalHash = await sendTransaction({
							to: maybeApprovalInfo.token as `0x${string}`,
							data: maybeApprovalInfo.calldata as Hex
						});
						awaitApprovalTx(approvalHash);
						await waitForTransaction(approvalHash, { confirmations: APPROVAL_TX_CONFIRMATIONS });
						readyCalldataResult = await orderToExecute.getTakeCalldata(
							Number(orderConfig.inputIOIndex),
							Number(orderConfig.outputIOIndex),
							$signerAddress,
							mode,
							amountStr,
							priceCapStr
						);
					}
				}
				if (readyCalldataResult.error || !readyCalldataResult.value?.takeOrdersInfo) {
					if (orderIndex > 0) {
						for (let retry = 0; retry < 3; retry++) {
							await new Promise((resolve) => setTimeout(resolve, 1500));
							readyCalldataResult = await orderToExecute.getTakeCalldata(
								Number(orderConfig.inputIOIndex),
								Number(orderConfig.outputIOIndex),
								$signerAddress,
								mode,
								amountStr,
								priceCapStr
							);
							if (!readyCalldataResult.error && readyCalldataResult.value?.takeOrdersInfo) {
								break;
							}
						}
					}
					if (readyCalldataResult.error || !readyCalldataResult.value?.takeOrdersInfo) {
						if (
							isSkippableMakerLegError(readyCalldataResult.error?.readableMsg) &&
							orderIndex < ordersToExecute.length - 1
						) {
							carryForwardFillAmount = fillAmount;
							const proceed = await requestMakerRerouteConsent(
								'A quoted maker leg cannot execute as quoted. Continue with rerouted liquidity?',
								buildMakerRerouteNotice({
									chainId: network.id,
									orderbookId: raindexOrder.orderbook.id,
									fromOrderHash: orderToExecute.orderHash,
									toOrderHash: ordersToExecute[orderIndex + 1]?.orderHash,
									fromPrice: expectedPriceByOrderHash.get(orderToExecute.orderHash.toLowerCase()),
									toPrice: expectedPriceByOrderHash.get(
										ordersToExecute[orderIndex + 1]?.orderHash?.toLowerCase() ?? ''
									)
								}),
								progressData
							);
							if (!proceed) {
								return transactionError('Transaction cancelled by user during maker reroute consent.' as TransactionErrorMessage);
							}
							continue;
						}
						return transactionError(
							(readyCalldataResult.error?.readableMsg ||
								'Failed to generate transaction calldata') as TransactionErrorMessage
						);
					}
				}

				awaitWalletConfirmation(
					`Awaiting wallet confirmation to take order${batchLabel}...`,
					progressData
				);

				hash = await sendTransaction({
					to: readyCalldataResult.value.takeOrdersInfo.orderbook as `0x${string}`,
					data: readyCalldataResult.value.takeOrdersInfo.calldata as Hex
				});

				console.log(`${TX_LOG_PREFIX} Order ${orderIndex + 1} transaction submitted`, {
					hash,
					orderHash: orderToExecute.orderHash
				});

				awaitWalletConfirmation(`Awaiting transaction confirmation${batchLabel}...`, progressData);
				await waitForTransaction(hash);

				console.log(`${TX_LOG_PREFIX} Order ${orderIndex + 1} transaction confirmed`, { hash });

				allTransactionHashes.push(hash);
				carryForwardFillAmount = 0n;

				if (orderIndex < ordersToExecute.length - 1) {
					awaitWalletConfirmation(
						`Transaction ${orderIndex + 1} confirmed. Preparing next batch...`,
						progressData
					);
				} else {
					awaitWalletConfirmation(`Transaction confirmed. Waiting for indexer...`);
				}
			} catch (error) {
				console.error(`${TX_LOG_PREFIX} Order ${orderIndex + 1} failed`, {
					orderIndex,
					totalOrders: ordersToExecute.length,
					mode,
					fillAmount: fillAmount.toString(),
					error
				});

				if (isStaleWalletSessionError(error)) {
					const msg = await handleStaleWalletSession(config);
					return transactionError(msg as TransactionErrorMessage);
				}

				const errorMessage = extractTransactionError(error);

				console.error('[handleTakeOrders] Transaction error:', error);
				if (isSkippableMakerLegError(errorMessage) && orderIndex < ordersToExecute.length - 1) {
					carryForwardFillAmount = fillAmount;
					const proceed = await requestMakerRerouteConsent(
						'A maker leg failed during execution. Continue with rerouted liquidity?',
						buildMakerRerouteNotice({
							chainId: network.id,
							orderbookId: raindexOrder.orderbook.id,
							fromOrderHash: orderToExecute.orderHash,
							toOrderHash: ordersToExecute[orderIndex + 1]?.orderHash,
							fromPrice: expectedPriceByOrderHash.get(orderToExecute.orderHash.toLowerCase()),
							toPrice: expectedPriceByOrderHash.get(
								ordersToExecute[orderIndex + 1]?.orderHash?.toLowerCase() ?? ''
							)
						})
					);
					if (!proceed) {
						return transactionError('Transaction cancelled by user during maker reroute consent.' as TransactionErrorMessage);
					}
					continue;
				}

				// Check for insufficient allowance error and provide helpful message
				const errorStr = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : '';
				if (errorStr.includes('allowance') || errorStr.includes('insufficient')) {
					return transactionError(
						'Insufficient token allowance. This is a known issue. Please retry the order.' as TransactionErrorMessage
					);
				}

				// Check for authentication errors
				if (errorStr.includes('authentication') || errorStr.includes('log in')) {
					return transactionError(errorMessage);
				}

				return transactionError(errorMessage);
			}
		}

		return pollAndFinalizeTakeOrders(allTransactionHashes, raindexOrder, params, network);
	};

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
		declineMultiTx,
		respondToMakerReroute,
		handleDcaDeploy,
		handleLimitDeploy,
		handleDsfDeploy,
		handleFolioDeploy,
		handleOracleOrders,
		handleAggregatedTakeOrdersCalldata,
		handleTakeOrders,
		handleWithdraw,
		handleWrapUnwrap,
		handleRemoveOrder,
		handleWithdrawFromOrder
	};
};

export default transactionStore();
