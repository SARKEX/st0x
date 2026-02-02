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
	sendTransactionWithGasOption,
	waitForTransaction as walletServiceWaitForTransaction
} from '$lib/services/walletService';

// Retry wrapper for RPC calls that fail with "header not found" error
// This is a known RPC provider issue related to load balancing
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			const errorMessage = String(error);
			// Retry on "header not found" or "block not found" RPC errors
			if (
				errorMessage.includes('header not found') ||
				errorMessage.includes('block not found') ||
				(error as { code?: number })?.code === -32000
			) {
				if (attempt < maxRetries - 1) {
					// Exponential backoff
					await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
					continue;
				}
			}
			throw error;
		}
	}
	throw lastError;
}

/**
 * Find a vault by vaultId + token address and add it to the results array (deduped).
 */
function collectVault(
	vaults: RaindexVault[],
	vaultId: string | undefined,
	tokenAddress: string | undefined,
	results: RaindexVault[],
	seen: Set<string>
): void {
	if (!vaultId) return;
	const vault = vaults.find((v) => {
		const vaultIdHex = `0x${v.vaultId.toString(16).padStart(64, '0')}`;
		const vaultIdMatches =
			v.vaultId.toString() === vaultId || vaultIdHex === vaultId.toLowerCase();
		const tokenMatches = v.token?.address?.toLowerCase() === tokenAddress?.toLowerCase();
		return vaultIdMatches && tokenMatches;
	});
	if (!vault) return;
	const key = `${vault.vaultId.toString()}-${vault.token?.address?.toLowerCase()}`;
	if (!seen.has(key)) {
		results.push(vault);
		seen.add(key);
	}
}

// Wrapped wagmi functions with retry logic
const readContract: typeof wagmiReadContract = ((...args: Parameters<typeof wagmiReadContract>) =>
	withRetry(() => wagmiReadContract(...args))) as typeof wagmiReadContract;

// Unified send transaction (works with both Dynamic and wagmi wallets)
const _sendTransaction = walletServiceSendTransaction;

// Unified wait for transaction
const waitForTransaction = walletServiceWaitForTransaction;
import {
	getTakeOrders3Calldata,
	type SgOrder,
	type TakeOrdersConfigV4,
	type DeploymentTransactionArgs,
	type RaindexVault,
	type RaindexOrder
} from '@rainlanguage/orderbook';
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
import { walletAddress } from '$lib/stores/authStore';
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
import {
	rainlangConfirmationModal,
	reviewStrategyOnDeploy,
	payFeesInStablecoin
} from '$lib/stores';
import { createRaindexClient } from '$lib/clients/raindex';
import { invalidateOrderQueries } from '$lib/queries/orderbook';
import { invalidateDashboardBalances } from '$lib/queries/balances';
import { invalidateUserVaultQueries } from '$lib/queries/vaults';
import type { Network } from '$lib/config/network';
import { getTrades } from '$lib/api/subgraph';

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

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
export const ONE = BigInt('1000000000000000000');

export enum TransactionStatus {
	IDLE = 'Idle',
	CHECKING_ALLOWANCE = 'Checking your approved spend...',
	PENDING_WALLET = 'Waiting for wallet confirmation...',
	PENDING_APPROVAL = 'Approving spend...',
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

export interface TransactionMetadata {
	marketOrderSummary?: MarketOrderSummary;
	assetTokenInfo?: AssetTokenInfo; // For limit/DCA order deployments
	multiTxProgress?: MultiTxProgress; // For split order transactions
	raindexLink?: RaindexLink; // Safe link data (replaces @html)
}

const initialState = {
	status: TransactionStatus.IDLE,
	error: '',
	hash: '',
	data: null as TransactionMetadata | null,
	functionName: '',
	message: ''
};

const transactionStore = () => {
	const { subscribe, set, update } = writable(initialState);
	const reset = () => set(initialState);

	const normalizeCalldata = (value: string | Uint8Array): `0x${string}` => {
		if (typeof value === 'string') {
			return (value.startsWith('0x') ? value : `0x${value}`) as `0x${string}`;
		}
		const hex = Array.from(value)
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join('');
		return `0x${hex}` as `0x${string}`;
	};

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
	const awaitWalletConfirmation = (message?: string) =>
		setState(TransactionStatus.PENDING_WALLET, { message });
	const awaitApprovalTx = (hash: string) => setState(TransactionStatus.PENDING_APPROVAL, { hash });
	const transactionSuccess = (hash: string, message?: string, data?: TransactionMetadata) =>
		setState(TransactionStatus.SUCCESS, { hash, message, data });
	const transactionError = (message: TransactionErrorMessage, hash?: string) =>
		setState(TransactionStatus.ERROR, { error: message, hash });

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

		// Get user preference for gas payment
		const useStablecoinGas = get(payFeesInStablecoin);

		// Only execute approvals that are actually needed
		if (approvalsNeeded.length > 0) {
			for (const approval of approvalsNeeded) {
				try {
					awaitWalletConfirmation(`Awaiting wallet confirmation to approve ${approval.symbol}...`);
					const hash = await sendTransactionWithGasOption(
						{
							to: approval.token as `0x${string}`,
							data: approval.calldata as Hex
						},
						useStablecoinGas
					);
					awaitApprovalTx(hash);
					await waitForTransaction(hash);
				} catch (error) {
					if (isStaleWalletSessionError(error)) {
						const msg = await handleStaleWalletSession(config);
						return transactionError(msg as TransactionErrorMessage);
					}

					// Extract error message from various error formats
					const errorMessage =
						(error as unknown as { cause?: { details?: string } })?.cause?.details ||
						(error instanceof Error ? error.message : null) ||
						TransactionErrorMessage.GENERIC;

					if (
						typeof errorMessage === 'string' &&
						errorMessage !== TransactionErrorMessage.GENERIC
					) {
						return transactionError(errorMessage as TransactionErrorMessage);
					}

					return transactionError(TransactionErrorMessage.GENERIC);
				}
			}
		}
		let hash: Hash;
		try {
			awaitWalletConfirmation(`Awaiting wallet confirmation to deploy your strategy...`);

			hash = await sendTransactionWithGasOption(
				{
					to: deploymentArgs.orderbookAddress as `0x${string}`,
					data: deploymentArgs.deploymentCalldata as Hex
				},
				useStablecoinGas
			);
		} catch (error) {
			if (isStaleWalletSessionError(error)) {
				const msg = await handleStaleWalletSession(config);
				return transactionError(msg as TransactionErrorMessage);
			}

			// Extract error message from various error formats
			const errorMessage =
				(error as unknown as { cause?: { details?: string } })?.cause?.details ||
				(error instanceof Error ? error.message : null) ||
				TransactionErrorMessage.GENERIC;

			if (typeof errorMessage === 'string' && errorMessage !== TransactionErrorMessage.GENERIC) {
				return transactionError(errorMessage as TransactionErrorMessage);
			}

			return transactionError(TransactionErrorMessage.GENERIC);
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
		const $walletAddress = get(walletAddress);
		if (!$walletAddress) throw new Error('Wallet not connected');
		const { composedRainlang, deploymentArgs } = await getMarketMakingDeploymentArgs(network, args, $walletAddress);

		showRainlangConfirmation(composedRainlang, deploymentArgs);
	};

	const handleDcaDeploy = async (args: DcaDeploymentArgs) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const network = get(currentNetwork);
		awaitWalletConfirmation(`Preparing strategy...`);
		const $walletAddress = get(walletAddress);
		if (!$walletAddress) throw new Error('Wallet not connected');
		const { composedRainlang, deploymentArgs } = await getDcaDeploymentArgs(network, args, $walletAddress);

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
		const $walletAddress = get(walletAddress);
		if (!$walletAddress) throw new Error('Wallet not connected');
		const { composedRainlang, deploymentArgs } = await getLimitOrderDeploymentArgs(network, args, $walletAddress);

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

		// Get user preference for gas payment
		const useStablecoinGas = get(payFeesInStablecoin);

		// vault.balance is already a Float instance, use it directly
		const vaultWithdrawCalldata = await vault.getWithdrawCalldata(vault.balance);
		if (vaultWithdrawCalldata.error) throw new Error(vaultWithdrawCalldata.error.readableMsg);
		let hash: Hash;
		try {
			// Security: Validate orderbook address is trusted before sending transaction
			const network = get(currentNetwork);

			awaitWalletConfirmation(`Awaiting wallet confirmation for withdrawal...`);

			hash = await sendTransactionWithGasOption(
				{
					to: vault.orderbook as `0x${string}`,
					data: vaultWithdrawCalldata.value as Hex
				},
				useStablecoinGas
			);
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

			return transactionSuccess(hash, undefined, { raindexLink });
		} catch (error) {
			if (isStaleWalletSessionError(error)) {
				const msg = await handleStaleWalletSession(config);
				return transactionError(msg as TransactionErrorMessage);
			}
			const err = error as { cause?: { details?: string }; message?: string };
			return transactionError(
				(err?.cause?.details ||
					err?.message ||
					TransactionErrorMessage.GENERIC) as TransactionErrorMessage
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

		// Get user preference for gas payment
		const useStablecoinGas = get(payFeesInStablecoin);

		if (!$signerAddress) {
			throw new Error('Wallet not connected');
		}

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

			const orders = [...(ordersResult.value as Iterable<RaindexOrder>)];
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

				collectVault(vaults, quote.outputVaultId, quote.outputTokenAddress, vaultsToWithdraw, addedVaultKeys);
				collectVault(vaults, quote.inputVaultId, quote.inputTokenAddress, vaultsToWithdraw, addedVaultKeys);

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
				const ZERO_FLOAT_HEX = '0x0000000000000000000000000000000000000000000000000000000000000000';
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

					const vaultWithdrawCalldata = await vault.getWithdrawCalldata(vault.balance);
					if (vaultWithdrawCalldata.error) {
						throw new Error(vaultWithdrawCalldata.error.readableMsg);
					}

					awaitWalletConfirmation(`Withdrawing from vault ${i + 1}/${vaultsWithBalance.length}...`);

					const withdrawHash = await sendTransactionWithGasOption(
						{
							to: vault.orderbook as `0x${string}`,
							data: vaultWithdrawCalldata.value as Hex
						},
						useStablecoinGas
					);

					awaitWalletConfirmation(`Awaiting withdrawal confirmation...`);

					await waitForTransaction(withdrawHash);
				}
			}

			// Step 2: Deactivate/remove the order
			// Security: Validate orderbook address is trusted

			const removeCalldata = order.getRemoveCalldata();
			if (removeCalldata.error) {
				throw new Error(removeCalldata.error.readableMsg);
			}

			awaitWalletConfirmation('Awaiting wallet confirmation to cancel order...');

			const hash = await sendTransactionWithGasOption(
				{
					to: order.orderbook as `0x${string}`,
					data: removeCalldata.value as Hex
				},
				useStablecoinGas
			);

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

			return transactionSuccess(hash, undefined, { raindexLink });
		} catch (error: unknown) {
			if (isStaleWalletSessionError(error)) {
				const msg = await handleStaleWalletSession(config);
				return transactionError(msg as TransactionErrorMessage);
			}
			const err = error as { cause?: { details?: string }; message?: string };
			return transactionError(
				(err?.cause?.details ||
					err?.message ||
					TransactionErrorMessage.GENERIC) as TransactionErrorMessage
			);
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

		// Get user preference for gas payment
		const useStablecoinGas = get(payFeesInStablecoin);

		if (!$signerAddress) {
			throw new Error('Wallet not connected');
		}

		const isFilled = quote.isFilled ?? false;

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

				const orders = [...(ordersResult.value as Iterable<RaindexOrder>)];
				if (orders.length === 0) {
					throw new Error('Order not found');
				}

				const order = orders[0];

				// Only deactivate if order is still active
				const sgOrderResult = order.convertToSgOrder();
				if (!sgOrderResult.error && sgOrderResult.value?.active) {
					// Security: Validate orderbook address is trusted

					const removeCalldata = order.getRemoveCalldata();
					if (removeCalldata.error) {
						throw new Error(removeCalldata.error.readableMsg);
					}

					awaitWalletConfirmation('Awaiting wallet confirmation to deactivate order...');

					const removeHash = await sendTransactionWithGasOption(
						{
							to: order.orderbook as `0x${string}`,
							data: removeCalldata.value as Hex
						},
						useStablecoinGas
					);

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
				collectVault(vaults, quote.inputVaultId, quote.inputTokenAddress, vaultsToWithdraw, addedVaultKeys);
			} else {
				// Not filled: withdraw from both vaults
				collectVault(vaults, quote.outputVaultId, quote.outputTokenAddress, vaultsToWithdraw, addedVaultKeys);
				collectVault(vaults, quote.inputVaultId, quote.inputTokenAddress, vaultsToWithdraw, addedVaultKeys);
			}

			if (vaultsToWithdraw.length === 0) {
				throw new Error('No vaults found to withdraw from');
			}

			// Filter to only vaults with non-zero balance
			// Compare hex representation to avoid Float class instance mismatch
			const ZERO_FLOAT_HEX = '0x0000000000000000000000000000000000000000000000000000000000000000';
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

				const vaultWithdrawCalldata = await vault.getWithdrawCalldata(vault.balance);
				if (vaultWithdrawCalldata.error) {
					throw new Error(vaultWithdrawCalldata.error.readableMsg);
				}

				awaitWalletConfirmation(
					`Awaiting wallet confirmation for withdrawal ${i + 1}/${vaultsWithBalance.length}...`
				);

				lastHash = await sendTransactionWithGasOption(
					{
						to: vault.orderbook as `0x${string}`,
						data: vaultWithdrawCalldata.value as Hex
					},
					useStablecoinGas
				);

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

			return transactionSuccess(lastHash, undefined, { raindexLink });
		} catch (error: unknown) {
			if (isStaleWalletSessionError(error)) {
				const msg = await handleStaleWalletSession(config);
				return transactionError(msg as TransactionErrorMessage);
			}
			const err = error as { cause?: { details?: string }; message?: string };
			return transactionError(
				(err?.cause?.details ||
					err?.message ||
					TransactionErrorMessage.GENERIC) as TransactionErrorMessage
			);
		}
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
		args: TakeOrdersConfigV4,
		raindexOrder: SgOrder,
		requiredApprovalAmount: bigint,
		params: TakeOrdersParams,
		recalculateConfig?: () => Promise<TakeOrdersConfigV4 | null>
	) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const $signerAddress = get(walletAddress);
		if (!$signerAddress) throw new Error('Signer address not found');

		// Get network early - used for validation and later for subgraph queries
		const network = get(currentNetwork) as Network;


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

		// Check current allowance for the token that needs approval
		checkingWalletAllowance(`Checking token allowance...`);
		const currentAllowance = await readContract(config, {
			abi: erc20Abi,
			address: approvalTokenAddress as `0x${string}`,
			functionName: 'allowance',
			args: [$signerAddress as Hex, raindexOrder.orderbook.id as `0x${string}`]
		});

		// Get user preference for gas payment
		const useStablecoinGas = get(payFeesInStablecoin);

		if (currentAllowance < requiredApprovalAmount) {
			// Need to approve more tokens
			try {
				awaitWalletConfirmation(
					`Awaiting wallet confirmation to approve ${approvalTokenSymbol}...`
				);

				const approvalHash = await sendTransactionWithGasOption(
					{
						to: approvalTokenAddress as `0x${string}`,
						data: encodeFunctionData({
							abi: erc20Abi,
							functionName: 'approve',
							args: [raindexOrder.orderbook.id as `0x${string}`, requiredApprovalAmount]
						}) as Hex
					},
					useStablecoinGas
				);

				awaitApprovalTx(approvalHash);
				await waitForTransaction(approvalHash);
			} catch (error) {
				if (isStaleWalletSessionError(error)) {
					const msg = await handleStaleWalletSession(config);
					return transactionError(msg as TransactionErrorMessage);
				}

				// Extract error message from various error formats
				const errorMessage =
					(error as unknown as { cause?: { details?: string } })?.cause?.details ||
					(error instanceof Error ? error.message : null) ||
					TransactionErrorMessage.GENERIC;

				if (typeof errorMessage === 'string' && errorMessage !== TransactionErrorMessage.GENERIC) {
					return transactionError(errorMessage as TransactionErrorMessage);
				}

				return transactionError(TransactionErrorMessage.GENERIC);
			}
		}

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

		// Now take the order
		awaitWalletConfirmation(`Taking order...`);

		let result;
		try {
			result = getTakeOrders3Calldata(finalConfig);

			if (result.error) {
				return transactionError(result.error as unknown as TransactionErrorMessage);
			}

			if (!result.value) {
				return transactionError(
					'Failed to generate transaction calldata' as TransactionErrorMessage
				);
			}
		} catch {
			return transactionError('Failed to generate transaction calldata' as TransactionErrorMessage);
		}

		let hash: Hash;
		try {
			awaitWalletConfirmation(`Awaiting wallet confirmation to take order...`);

			const calldata = normalizeCalldata(result.value as string | Uint8Array);
			hash = await sendTransactionWithGasOption(
				{
					to: raindexOrder.orderbook.id as `0x${string}`,
					data: calldata as Hex
				},
				useStablecoinGas
			);

			awaitWalletConfirmation(`Awaiting transaction confirmation...`);
			await waitForTransaction(hash);

			awaitWalletConfirmation(`Transaction confirmed. Waiting for indexer...`);
		} catch (error) {
			if (isStaleWalletSessionError(error)) {
				const msg = await handleStaleWalletSession(config);
				return transactionError(msg as TransactionErrorMessage);
			}

			// Extract error message from various error formats
			const errorMessage =
				(error as unknown as { cause?: { details?: string } })?.cause?.details ||
				(error instanceof Error ? error.message : null) ||
				TransactionErrorMessage.GENERIC;

			// Return the error message directly if it's meaningful
			if (typeof errorMessage === 'string' && errorMessage !== TransactionErrorMessage.GENERIC) {
				return transactionError(errorMessage as TransactionErrorMessage);
			}

			return transactionError(TransactionErrorMessage.GENERIC);
		}

		// Poll subgraph for all transactions to appear in trades (5 minute timeout)
		const pollPendingTrades = async () => {
			const MAX_ATTEMPTS = 60; // 5 minutes at 5s interval
			for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
				const now = Math.floor(Date.now() / 1000);
				const trades = await getTrades(now - 600, now, network);
				const allTrades = trades.filter(
					(t) => t.tradeEvent?.transaction?.id.toLowerCase() === hash.toLowerCase()
				) as unknown as Array<{
					tradeEvent?: { transaction?: { id?: string } };
					order?: { orderHash?: string };
					inputVaultBalanceChange?: {
						amount?: Hex;
						oldVaultBalance?: Hex;
						newVaultBalance?: Hex;
					};
					outputVaultBalanceChange?: {
						amount?: Hex;
						oldVaultBalance?: Hex;
						newVaultBalance?: Hex;
					};
				}>;

				const validTrades = allTrades.filter(
					(t) => t.inputVaultBalanceChange?.amount && t.outputVaultBalanceChange?.amount
				);
				if (validTrades.length > 0) {
					return validTrades;
				}
				await new Promise((resolve) => setTimeout(resolve, 5_000));
			}
			return [];
		};

		const validTrades = await pollPendingTrades();

		if (validTrades.length === 0) {
			return transactionError(TransactionErrorMessage.GENERIC, hash);
		}

		// Get token info from params (passed by MarketOrder component)
		// NOTE: Vault changes are from MAKER's perspective, we need TAKER's perspective:
		//       - inputVaultBalanceChange = what MAKER receives = what TAKER gives (OUTPUT)
		//       - outputVaultBalanceChange = what MAKER gives = what TAKER receives (INPUT)
		const inputTokenDecimals = params.takerWantsToken.decimals;
		const inputTokenSymbol = params.takerWantsToken.symbol;
		const inputTokenAddress = params.takerWantsToken.address;

		const outputTokenDecimals = params.takerPaysToken.decimals;
		const outputTokenSymbol = params.takerPaysToken.symbol;
		const outputTokenAddress = params.takerPaysToken.address;

		// Sum vault changes from TAKER's perspective
		let totalInputAmount = 0n;
		let totalOutputAmount = 0n;
		for (const trade of validTrades) {
			// TAKER INPUT (what taker receives) = outputVaultBalanceChange (what maker gives)
			const inputAmount = parseFloatHex(
				trade.outputVaultBalanceChange!.amount as Hex,
				inputTokenDecimals,
				true // Use absolute value
			);
			totalInputAmount += inputAmount;

			// TAKER OUTPUT (what taker gives) = inputVaultBalanceChange (what maker receives)
			const outputAmount = parseFloatHex(
				trade.inputVaultBalanceChange!.amount as Hex,
				outputTokenDecimals,
				true // Use absolute value
			);
			totalOutputAmount += outputAmount;
		}

		// Calculate actual ioRatio from transaction data
		const actualIoRatio =
			totalOutputAmount > 0n
				? parseFloat(formatUnits(totalInputAmount, inputTokenDecimals)) /
					parseFloat(formatUnits(totalOutputAmount, outputTokenDecimals))
				: 0;

		// Use the user's actual requested input amount
		const requestedInputAmount = params.requestedTakerWantsAmount;

		// Check if fill is complete (within 99.9% tolerance)
		// Need to normalize both amounts to the same decimal scale for comparison
		const inputFilledDecimal = parseFloat(formatUnits(totalInputAmount, inputTokenDecimals));
		const inputRequestedDecimal = parseFloat(formatUnits(requestedInputAmount, inputTokenDecimals));

		let fillPercentage = 0;
		let isNoFill = false;

		if (inputRequestedDecimal > 0) {
			fillPercentage = inputFilledDecimal / inputRequestedDecimal;
		} else {
			// No requested quantity means no tokens requested
			isNoFill = true;
		}

		// Build summary from actual transaction data
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
			isPartialFill: fillPercentage > 0 && fillPercentage < 0.999,
			isNoFill
		};

		const raindexLink = createRaindexLink(
			network.id,
			raindexOrder.orderbook.id,
			raindexOrder.orderHash,
			'View order on Raindex'
		);

		// Invalidate dashboard balances after successful market order
		invalidateDashboardBalances();

		return transactionSuccess(hash, undefined, { marketOrderSummary: summary, raindexLink });
	};

	const handleFolioDeploy = async (args: FolioDeploymentArgs) => {
		const network = get(currentNetwork);
		awaitWalletConfirmation(`Preparing strategy...`);
		const $walletAddress = get(walletAddress);
		if (!$walletAddress) throw new Error('Wallet not connected');
		const { composedRainlang, deploymentArgs } = await getFolioDeploymentArgs(network, args, $walletAddress);

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
		handleDcaDeploy,
		handleLimitDeploy,
		handleDsfDeploy,
		handleFolioDeploy,
		handleTakeOrders,
		handleWithdraw,
		handleRemoveOrder,
		handleWithdrawFromOrder
	};
};

export default transactionStore();
