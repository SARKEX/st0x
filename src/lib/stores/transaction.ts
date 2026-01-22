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

// Wrapped wagmi functions with retry logic
const readContract: typeof wagmiReadContract = ((...args: Parameters<typeof wagmiReadContract>) =>
	withRetry(() => wagmiReadContract(...args))) as typeof wagmiReadContract;

// Unified send transaction (works with both Dynamic and wagmi wallets)
const sendTransaction = walletServiceSendTransaction;

// Unified wait for transaction (works with both Dynamic and wagmi wallets, includes retry logic)
const waitForTransaction = walletServiceWaitForTransaction;
import {
	getTakeOrders3Calldata,
	type SgOrder,
	type TakeOrdersConfigV4,
	type DeploymentTransactionArgs,
	type RaindexVault,
	type RaindexOrder
} from '@rainlanguage/orderbook';
import { Float } from '@rainlanguage/float';
import { parseFloatHex, getRaindexOrderUrl, isPaymentToken } from '$lib/utils/tokenMath';
import { TransactionErrorMessage } from '$lib/types/errors';
import { isStaleWalletSessionError, handleStaleWalletSession } from '$lib/utils/walletUtils';
import type { TakeOrdersParams } from '$lib/types/transactions';
import { wagmiConfig } from 'svelte-wagmi';
import { walletAddress, authMethod } from '$lib/stores/authStore';
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
import { rainlangConfirmationModal, reviewStrategyOnDeploy } from '$lib/stores';
import { createRaindexClient } from '$lib/clients/raindex';
import { invalidateOrderQueries } from '$lib/queries/orderbook';
import { invalidateUserVaultQueries } from '$lib/queries/vaults';
import { invalidateDashboardBalances } from '$lib/queries/balances';
import type { Network } from '$lib/config/network';
import { getTrades } from '$lib/api/subgraph';

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

// Helper function to create Raindex v5 link HTML
function createRaindexLink(
	chainId: number,
	orderbookId: string,
	orderHashOrVaultId: string,
	linkText = 'Manage your order on Raindex'
): string {
	const url = getRaindexOrderUrl(chainId, orderbookId, orderHashOrVaultId);
	return `
		<a
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-1 text-sm text-yellow-500 hover:text-yellow-400 hover:underline transition-colors justify-center"
			href="${url}"
			data-testid="raindex-link">
			${linkText}
			<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
			</svg>
		</a>
	`;
}

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
export const ONE = BigInt('1000000000000000000');

// Dynamic embedded wallet signing has a 16KB payload size limit
// External wallets (MetaMask, etc.) don't have this limitation
const DYNAMIC_MAX_PAYLOAD_SIZE_BYTES = 16 * 1024;

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

export interface TransactionMetadata {
	marketOrderSummary?: MarketOrderSummary;
	assetTokenInfo?: AssetTokenInfo; // For limit/DCA order deployments
	multiTxProgress?: MultiTxProgress; // For split order transactions
}

const initialState = {
	status: TransactionStatus.IDLE,
	error: '',
	hash: '',
	data: null as TransactionMetadata | null,
	functionName: '',
	message: '',
	multiTxAcknowledged: false,
	onMultiTxAcknowledge: null as (() => void) | null
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
	const awaitWalletConfirmation = (message?: string, data?: TransactionMetadata) =>
		setState(TransactionStatus.PENDING_WALLET, { message, data });
	const awaitApprovalTx = (hash: string) => setState(TransactionStatus.PENDING_APPROVAL, { hash });
	const transactionSuccess = (hash: string, message?: string, data?: TransactionMetadata) =>
		setState(TransactionStatus.SUCCESS, { hash, message, data });
	const transactionError = (message: TransactionErrorMessage, hash?: string) =>
		setState(TransactionStatus.ERROR, { error: message, hash });

	const acknowledgeMultiTx = () => {
		update((state) => {
			if (state.onMultiTxAcknowledge) {
				state.onMultiTxAcknowledge();
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
					await waitForTransaction(hash);
				} catch (error) {
					if (isStaleWalletSessionError(error)) {
						const msg = await handleStaleWalletSession(config);
						return transactionError(msg as TransactionErrorMessage);
					}
					const errorMessage =
						(error as unknown as { cause?: { details?: string } })?.cause?.details ||
						TransactionErrorMessage.GENERIC;
					const message =
						typeof errorMessage === 'string' && errorMessage !== TransactionErrorMessage.GENERIC
							? (errorMessage as TransactionErrorMessage)
							: TransactionErrorMessage.GENERIC;
					return transactionError(message);
				}
			}
		}
		let hash: Hash;
		try {
			// Security: Validate orderbook address is trusted before sending transaction
			const network = get(currentNetwork);
			validateOrderbookAddress(deploymentArgs.orderbookAddress, network);

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
			const errorMessage =
				(error as unknown as { cause?: { details?: string } })?.cause?.details ||
				TransactionErrorMessage.GENERIC;
			const message =
				typeof errorMessage === 'string' && errorMessage !== TransactionErrorMessage.GENERIC
					? (errorMessage as TransactionErrorMessage)
					: TransactionErrorMessage.GENERIC;
			return transactionError(message);
		}

		const network = get(currentNetwork);

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
		const metadata: TransactionMetadata | undefined = assetTokenInfo
			? { assetTokenInfo }
			: undefined;

		// Immediate attempt before scheduling interval
		const immediateLink = await tryFetchOrderLink();
		if (immediateLink) {
			invalidateOrderQueries();
			invalidateDashboardBalances();
			return transactionSuccess(hash, immediateLink, metadata);
		}

		const interval = setInterval(async () => {
			attempts++;

			// Stop polling after max attempts
			if (attempts >= maxAttempts) {
				clearInterval(interval);
				invalidateOrderQueries();
				invalidateDashboardBalances();
				return transactionSuccess(hash, 'Order deployed successfully!', metadata);
			}

			try {
				const link = await tryFetchOrderLink();
				if (link) {
					clearInterval(interval);
					invalidateOrderQueries();
					invalidateDashboardBalances();
					return transactionSuccess(hash, link, metadata);
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
			const link = createRaindexLink(network.id, vault.orderbook, vault.id);

			// Invalidate vault queries for this specific token
			const tokenAddress = vault.token?.address ?? vault.token?.id;
			invalidateUserVaultQueries(network.id, $signer ?? undefined, tokenAddress);
			invalidateDashboardBalances();

			return transactionSuccess(hash, link);
		} catch (error) {
			if (isStaleWalletSessionError(error)) {
				const msg = await handleStaleWalletSession(config);
				return transactionError(msg as TransactionErrorMessage);
			}
			// @ts-expect-error Send transaction error
			return transactionError(error?.cause?.details || TransactionErrorMessage.GENERIC);
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

				if (quote.outputVaultId) {
					// Find vault matching vaultId AND output token
					const outputVault = vaults.find((v) => {
						const vaultIdHex = `0x${v.vaultId.toString(16).padStart(64, '0')}`;
						const vaultIdMatches =
							v.vaultId.toString() === quote.outputVaultId ||
							vaultIdHex === quote.outputVaultId?.toLowerCase();
						const tokenMatches =
							v.token?.address?.toLowerCase() === quote.outputTokenAddress?.toLowerCase();
						return vaultIdMatches && tokenMatches;
					});
					if (outputVault) {
						const key = `${outputVault.vaultId.toString()}-${outputVault.token?.address?.toLowerCase()}`;
						if (!addedVaultKeys.has(key)) {
							vaultsToWithdraw.push(outputVault);
							addedVaultKeys.add(key);
						}
					}
				}
				if (quote.inputVaultId) {
					// Find vault matching vaultId AND input token
					const inputVault = vaults.find((v) => {
						const vaultIdHex = `0x${v.vaultId.toString(16).padStart(64, '0')}`;
						const vaultIdMatches =
							v.vaultId.toString() === quote.inputVaultId ||
							vaultIdHex === quote.inputVaultId?.toLowerCase();
						const tokenMatches =
							v.token?.address?.toLowerCase() === quote.inputTokenAddress?.toLowerCase();
						return vaultIdMatches && tokenMatches;
					});
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

			const link = createRaindexLink(network.id, order.orderbook, quote.orderHash);

			// Invalidate queries for the tokens involved in this order
			const tokenAddresses = [quote.inputTokenAddress, quote.outputTokenAddress].filter(Boolean);
			for (const tokenAddr of tokenAddresses) {
				if (tokenAddr) {
					invalidateOrderQueries(network.id, tokenAddr);
					invalidateUserVaultQueries(network.id, $signerAddress, tokenAddr);
				}
			}

			return transactionSuccess(hash, link);
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
					// Find vault matching vaultId AND input token
					const inputVault = vaults.find((v) => {
						const vaultIdHex = `0x${v.vaultId.toString(16).padStart(64, '0')}`;
						const vaultIdMatches =
							v.vaultId.toString() === quote.inputVaultId ||
							vaultIdHex === quote.inputVaultId?.toLowerCase();
						const tokenMatches =
							v.token?.address?.toLowerCase() === quote.inputTokenAddress?.toLowerCase();
						return vaultIdMatches && tokenMatches;
					});
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
					// Find vault matching vaultId AND output token
					const outputVault = vaults.find((v) => {
						const vaultIdHex = `0x${v.vaultId.toString(16).padStart(64, '0')}`;
						const vaultIdMatches =
							v.vaultId.toString() === quote.outputVaultId ||
							vaultIdHex === quote.outputVaultId?.toLowerCase();
						const tokenMatches =
							v.token?.address?.toLowerCase() === quote.outputTokenAddress?.toLowerCase();
						return vaultIdMatches && tokenMatches;
					});
					if (outputVault) {
						const key = `${outputVault.vaultId.toString()}-${outputVault.token?.address?.toLowerCase()}`;
						if (!addedVaultKeys.has(key)) {
							vaultsToWithdraw.push(outputVault);
							addedVaultKeys.add(key);
						}
					}
				}
				if (quote.inputVaultId) {
					// Find vault matching vaultId AND input token
					const inputVault = vaults.find((v) => {
						const vaultIdHex = `0x${v.vaultId.toString(16).padStart(64, '0')}`;
						const vaultIdMatches =
							v.vaultId.toString() === quote.inputVaultId ||
							vaultIdHex === quote.inputVaultId?.toLowerCase();
						const tokenMatches =
							v.token?.address?.toLowerCase() === quote.inputTokenAddress?.toLowerCase();
						return vaultIdMatches && tokenMatches;
					});
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
			const ZERO_FLOAT_HEX = '0x0000000000000000000000000000000000000000000000000000000000000000';
			const vaultsWithBalance = vaultsToWithdraw.filter((vault) => {
				const balanceHex = vault.balance.asHex().toLowerCase();
				return balanceHex !== ZERO_FLOAT_HEX;
			});

			if (vaultsWithBalance.length === 0) {
				// No vaults have balance - nothing to withdraw
				const chainId = network.id;
				const link = createRaindexLink(chainId, quote.orderbookId || '', quote.orderHash);
				// Still invalidate queries in case order was deactivated
				const tokenAddrs = [quote.inputTokenAddress, quote.outputTokenAddress].filter(Boolean);
				for (const tokenAddr of tokenAddrs) {
					if (tokenAddr) {
						invalidateOrderQueries(network.id, tokenAddr);
						invalidateUserVaultQueries(network.id, $signerAddress, tokenAddr);
					}
				}
				return transactionSuccess('0x' as Hash, `No balance to withdraw. ${link}`);
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
			const link = createRaindexLink(chainId, quote.orderbookId || '', quote.orderHash);

			// Invalidate queries for the tokens involved in this order
			const tokenAddrs = [quote.inputTokenAddress, quote.outputTokenAddress].filter(Boolean);
			for (const tokenAddr of tokenAddrs) {
				if (tokenAddr) {
					invalidateOrderQueries(network.id, tokenAddr);
					invalidateUserVaultQueries(network.id, $signerAddress, tokenAddr);
				}
			}

			return transactionSuccess(lastHash, link);
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
	 * Split orders into batches that fit within the payload size limit.
	 * Uses greedy approach to pack as many orders as possible in each batch.
	 *
	 * @param config - The full TakeOrdersConfigV4 to split
	 * @param orderFillAmounts - Optional array of fill amounts parallel to config.orders
	 *                           Used to calculate per-batch maximumInput
	 * @param inputDecimals - Decimal places of the input token (required if orderFillAmounts provided)
	 */
	const splitOrdersIntoBatches = (
		config: TakeOrdersConfigV4,
		orderFillAmounts?: bigint[],
		inputDecimals?: number
	): { batches: TakeOrdersConfigV4[]; needsSplit: boolean } => {
		const LOG_PREFIX = '[splitOrdersIntoBatches]';

		console.log(`${LOG_PREFIX} Starting batch split analysis`, {
			totalOrders: config.orders.length,
			maxPayloadSize: DYNAMIC_MAX_PAYLOAD_SIZE_BYTES,
			hasOrderFillAmounts: !!orderFillAmounts,
			inputDecimals
		});

		// Try with all orders first
		const fullResult = getTakeOrders3Calldata(config);
		if (!fullResult.error && fullResult.value) {
			const calldata = normalizeCalldata(fullResult.value as string | Uint8Array);
			const payloadSize = new Blob([calldata]).size;

			console.log(`${LOG_PREFIX} Full payload analysis`, {
				totalOrders: config.orders.length,
				payloadSize,
				maxAllowed: DYNAMIC_MAX_PAYLOAD_SIZE_BYTES,
				fitsInSingleTx: payloadSize <= DYNAMIC_MAX_PAYLOAD_SIZE_BYTES
			});

			if (payloadSize <= DYNAMIC_MAX_PAYLOAD_SIZE_BYTES) {
				console.log(`${LOG_PREFIX} No split needed - all orders fit in single transaction`);
				return { batches: [config], needsSplit: false };
			}
		}

		console.log(`${LOG_PREFIX} Split required - payload exceeds limit, starting greedy packing`);

		// Need to split - use greedy approach to pack orders
		const orders = config.orders;
		const batches: TakeOrdersConfigV4[] = [];
		const batchPayloadSizes: number[] = [];
		let currentBatchOrders: typeof orders = [];
		let currentBatchIndices: number[] = [];
		let currentBatchPayloadSize = 0;

		for (let i = 0; i < orders.length; i++) {
			const order = orders[i];
			// Try adding this order to current batch
			const testOrders = [...currentBatchOrders, order];
			const testConfig: TakeOrdersConfigV4 = {
				...config,
				orders: testOrders
			};

			const testResult = getTakeOrders3Calldata(testConfig);
			if (!testResult.error && testResult.value) {
				const calldata = normalizeCalldata(testResult.value as string | Uint8Array);
				const payloadSize = new Blob([calldata]).size;

				if (payloadSize <= DYNAMIC_MAX_PAYLOAD_SIZE_BYTES) {
					// Order fits, add to current batch
					currentBatchOrders = testOrders;
					currentBatchIndices = [...currentBatchIndices, i];
					currentBatchPayloadSize = payloadSize;
				} else {
					// Order doesn't fit, start a new batch
					if (currentBatchOrders.length > 0) {
						// Calculate per-batch maximumInput if fill amounts provided
						let batchMaximumInput = config.maximumInput;
						let batchFillTotal = 0n;
						if (orderFillAmounts && inputDecimals !== undefined) {
							batchFillTotal = currentBatchIndices.reduce(
								(sum, idx) => sum + (orderFillAmounts[idx] ?? 0n),
								0n
							);
							if (batchFillTotal > 0n) {
								const batchMaxInputFloat = Float.fromFixedDecimalLossy(
									batchFillTotal,
									inputDecimals
								);
								batchMaximumInput = batchMaxInputFloat.float.asHex();
							}
						}

						console.log(`${LOG_PREFIX} Batch ${batches.length + 1} finalized`, {
							orderCount: currentBatchOrders.length,
							orderIndices: currentBatchIndices,
							payloadSize: currentBatchPayloadSize,
							batchFillTotal: batchFillTotal.toString(),
							maximumInput: batchMaximumInput
						});

						batches.push({
							...config,
							orders: currentBatchOrders,
							maximumInput: batchMaximumInput
						});
						batchPayloadSizes.push(currentBatchPayloadSize);
					}
					currentBatchOrders = [order];
					currentBatchIndices = [i];
					// Recalculate payload size for single order
					const singleOrderResult = getTakeOrders3Calldata({ ...config, orders: [order] });
					if (!singleOrderResult.error && singleOrderResult.value) {
						const singleCalldata = normalizeCalldata(
							singleOrderResult.value as string | Uint8Array
						);
						currentBatchPayloadSize = new Blob([singleCalldata]).size;
					}
				}
			} else {
				// Failed to generate calldata, skip this order
				console.error(`${LOG_PREFIX} Failed to generate calldata for order ${i}, skipping`);
			}
		}

		// Don't forget the last batch
		if (currentBatchOrders.length > 0) {
			// Calculate per-batch maximumInput if fill amounts provided
			let batchMaximumInput = config.maximumInput;
			let batchFillTotal = 0n;
			if (orderFillAmounts && inputDecimals !== undefined) {
				batchFillTotal = currentBatchIndices.reduce(
					(sum, idx) => sum + (orderFillAmounts[idx] ?? 0n),
					0n
				);
				if (batchFillTotal > 0n) {
					const batchMaxInputFloat = Float.fromFixedDecimalLossy(batchFillTotal, inputDecimals);
					batchMaximumInput = batchMaxInputFloat.float.asHex();
				}
			}

			console.log(`${LOG_PREFIX} Batch ${batches.length + 1} finalized (final)`, {
				orderCount: currentBatchOrders.length,
				orderIndices: currentBatchIndices,
				payloadSize: currentBatchPayloadSize,
				batchFillTotal: batchFillTotal.toString(),
				maximumInput: batchMaximumInput
			});

			batches.push({
				...config,
				orders: currentBatchOrders,
				maximumInput: batchMaximumInput
			});
			batchPayloadSizes.push(currentBatchPayloadSize);
		}

		// Log summary
		console.log(`${LOG_PREFIX} Split complete`, {
			totalBatches: batches.length,
			needsSplit: batches.length > 1,
			batchSummary: batches.map((b, i) => ({
				batch: i + 1,
				orders: b.orders.length,
				payloadSize: batchPayloadSizes[i],
				maximumInput: b.maximumInput
			}))
		});

		return { batches, needsSplit: batches.length > 1 };
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

		if (currentAllowance < requiredApprovalAmount) {
			// Need to approve more tokens
			try {
				awaitWalletConfirmation(
					`Awaiting wallet confirmation to approve ${approvalTokenSymbol}...`
				);

				const approvalHash = await sendTransaction({
					to: approvalTokenAddress as `0x${string}`,
					data: encodeFunctionData({
						abi: erc20Abi,
						functionName: 'approve',
						args: [raindexOrder.orderbook.id as `0x${string}`, requiredApprovalAmount]
					}) as Hex
				});

				awaitApprovalTx(approvalHash);
				await waitForTransaction(approvalHash);
			} catch (approvalError) {
				console.error('[handleTakeOrders] Approval error:', approvalError);
				if (isStaleWalletSessionError(approvalError)) {
					const msg = await handleStaleWalletSession(config);
					return transactionError(msg as TransactionErrorMessage);
				}

				// Extract error message from various sources
				const errorMessage =
					(approvalError as unknown as { cause?: { details?: string } })?.cause?.details ||
					(approvalError as Error)?.message ||
					TransactionErrorMessage.APPROVAL_FAILED;

				// Check for authentication errors
				const errorStr = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : '';
				if (errorStr.includes('authentication') || errorStr.includes('log in')) {
					return transactionError(errorMessage as TransactionErrorMessage);
				}

				return transactionError(
					typeof errorMessage === 'string'
						? (errorMessage as TransactionErrorMessage)
						: TransactionErrorMessage.APPROVAL_FAILED
				);
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

		// Check if we need to split into multiple batches (only for Dynamic wallet due to 16KB payload limit)
		awaitWalletConfirmation(`Preparing order...`);
		const isDynamicWallet = get(authMethod) === 'dynamic';

		console.log('[handleTakeOrders] Preparing order batches', {
			isDynamicWallet,
			totalOrders: finalConfig.orders.length,
			hasOrderFillAmounts: !!params.orderFillAmounts,
			orderFillAmounts: params.orderFillAmounts?.map((a) => a.toString()),
			takerWantsDecimals: params.takerWantsToken.decimals,
			originalMaximumInput: finalConfig.maximumInput,
			originalMaximumIORatio: finalConfig.maximumIORatio
		});

		const { batches, needsSplit } = isDynamicWallet
			? splitOrdersIntoBatches(
					finalConfig,
					params.orderFillAmounts,
					params.takerWantsToken.decimals
				)
			: { batches: [finalConfig], needsSplit: false };

		if (!isDynamicWallet) {
			console.log('[handleTakeOrders] Non-Dynamic wallet - skipping split, using single batch', {
				orderCount: finalConfig.orders.length
			});
		}

		if (batches.length === 0) {
			return transactionError('Failed to prepare order batches' as TransactionErrorMessage);
		}

		// If we need multiple transactions (Dynamic wallet only), show acknowledgment modal
		if (needsSplit) {
			await new Promise<void>((resolve) => {
				update((state) => ({
					...state,
					status: TransactionStatus.PENDING_MULTI_TX_ACKNOWLEDGMENT,
					message: `This order requires ${batches.length} separate transactions due to payload size limits. You will be asked to sign ${batches.length} times.`,
					data: { multiTxProgress: { currentBatch: 0, totalBatches: batches.length } },
					onMultiTxAcknowledge: () => {
						update((s) => ({ ...s, multiTxAcknowledged: true, onMultiTxAcknowledge: null }));
						resolve();
					}
				}));
			});
		}

		// Execute each batch
		const allTransactionHashes: Hash[] = [];
		const TX_LOG_PREFIX = '[handleTakeOrders]';

		console.log(`${TX_LOG_PREFIX} Starting batch execution`, {
			totalBatches: batches.length,
			needsSplit,
			isDynamicWallet
		});

		for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
			const batchConfig = batches[batchIndex];
			const isMultiBatch = batches.length > 1;
			const batchLabel = isMultiBatch ? ` (${batchIndex + 1}/${batches.length})` : '';

			console.log(`${TX_LOG_PREFIX} Preparing batch ${batchIndex + 1}/${batches.length}`, {
				orderCount: batchConfig.orders.length,
				maximumInput: batchConfig.maximumInput,
				maximumIORatio: batchConfig.maximumIORatio,
				minimumInput: batchConfig.minimumInput
			});

			let result;
			try {
				result = getTakeOrders3Calldata(batchConfig);

				if (result.error) {
					console.error(`${TX_LOG_PREFIX} Failed to generate calldata`, result.error);
					return transactionError(result.error as unknown as TransactionErrorMessage);
				}

				if (!result.value) {
					console.error(`${TX_LOG_PREFIX} No calldata value returned`);
					return transactionError(
						'Failed to generate transaction calldata' as TransactionErrorMessage
					);
				}
			} catch (calldataError) {
				console.error(`${TX_LOG_PREFIX} Exception generating calldata`, calldataError);
				return transactionError(
					'Failed to generate transaction calldata' as TransactionErrorMessage
				);
			}

			const calldata = normalizeCalldata(result.value as string | Uint8Array);
			const payloadSize = new Blob([calldata]).size;

			console.log(`${TX_LOG_PREFIX} Batch ${batchIndex + 1} calldata generated`, {
				payloadSize,
				calldataLength: calldata.length,
				targetOrderbook: raindexOrder.orderbook.id
			});

			// Security: Validate orderbook address is trusted before sending transaction
			const network = get(currentNetwork);
			validateOrderbookAddress(raindexOrder.orderbook.id, network);

			let hash: Hash;
			try {
				const progressData: TransactionMetadata = isMultiBatch
					? { multiTxProgress: { currentBatch: batchIndex + 1, totalBatches: batches.length } }
					: {};

				awaitWalletConfirmation(
					`Awaiting wallet confirmation to take order${batchLabel}...`,
					progressData
				);

				hash = await sendTransaction({
					to: raindexOrder.orderbook.id as `0x${string}`,
					data: calldata as Hex
				});

				console.log(`${TX_LOG_PREFIX} Batch ${batchIndex + 1} transaction submitted`, {
					hash,
					orderCount: batchConfig.orders.length
				});

				awaitWalletConfirmation(`Awaiting transaction confirmation${batchLabel}...`, progressData);
				await waitForTransaction(hash);

				console.log(`${TX_LOG_PREFIX} Batch ${batchIndex + 1} transaction confirmed`, { hash });

				allTransactionHashes.push(hash);

				if (batchIndex < batches.length - 1) {
					awaitWalletConfirmation(
						`Transaction ${batchIndex + 1} confirmed. Preparing next batch...`,
						progressData
					);
				} else {
					awaitWalletConfirmation(`Transaction confirmed. Waiting for indexer...`);
				}
			} catch (error) {
				console.error(`${TX_LOG_PREFIX} Batch ${batchIndex + 1} failed`, {
					batchIndex,
					totalBatches: batches.length,
					orderCount: batchConfig.orders.length,
					maximumInput: batchConfig.maximumInput,
					maximumIORatio: batchConfig.maximumIORatio,
					error
				});

				if (isStaleWalletSessionError(error)) {
					const msg = await handleStaleWalletSession(config);
					return transactionError(msg as TransactionErrorMessage);
				}

				// Try to get error message from various sources
				const errorMessage =
					(error as unknown as { cause?: { details?: string } })?.cause?.details ||
					(error as Error)?.message ||
					TransactionErrorMessage.GENERIC;

				console.error('[handleTakeOrders] Transaction error:', error);

				// Check for insufficient allowance error and provide helpful message
				const errorStr = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : '';
				if (errorStr.includes('allowance') || errorStr.includes('insufficient')) {
					return transactionError(
						'Insufficient token allowance. This is a known issue. Please retry the order.' as TransactionErrorMessage
					);
				}

				// Check for authentication errors
				if (errorStr.includes('authentication') || errorStr.includes('log in')) {
					return transactionError(errorMessage as TransactionErrorMessage);
				}

				const message =
					typeof errorMessage === 'string' && errorMessage !== TransactionErrorMessage.GENERIC
						? (errorMessage as TransactionErrorMessage)
						: TransactionErrorMessage.GENERIC;
				return transactionError(message);
			}
		}

		// Use the last transaction hash for the success display
		const hash = allTransactionHashes[allTransactionHashes.length - 1];

		const network = get(currentNetwork) as Network;
		// Poll subgraph for all transactions to appear in trades (5 minute timeout)
		const pollPendingTrades = async () => {
			const MAX_ATTEMPTS = 60; // 5 minutes at 5s interval
			const totalBatches = allTransactionHashes.length;

			for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
				const now = Math.floor(Date.now() / 1000);
				const trades = await getTrades(now - 600, now, network);
				// Look for trades from ANY of our transaction hashes
				const allTrades = trades.filter((t) =>
					allTransactionHashes.some(
						(txHash) => t.tradeEvent?.transaction?.id.toLowerCase() === txHash.toLowerCase()
					)
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

				// For multi-batch transactions, wait until we have trades from ALL transaction hashes
				if (totalBatches > 1) {
					const indexedTxHashes = new Set(
						validTrades.map((t) => t.tradeEvent?.transaction?.id?.toLowerCase())
					);
					const allBatchesIndexed = allTransactionHashes.every((txHash) =>
						indexedTxHashes.has(txHash.toLowerCase())
					);

					console.log('[pollPendingTrades] Multi-batch progress', {
						attempt,
						totalBatches,
						indexedBatches: indexedTxHashes.size,
						allBatchesIndexed,
						validTradesCount: validTrades.length
					});

					if (allBatchesIndexed) {
						return validTrades;
					}

					// After 30 seconds (6 attempts), return whatever we have if we have any trades
					// This prevents waiting too long if one batch had no fills
					if (attempt >= 6 && validTrades.length > 0) {
						console.log(
							'[pollPendingTrades] Timeout waiting for all batches, returning partial results'
						);
						return validTrades;
					}
				} else {
					// Single batch - return as soon as we have trades
					if (validTrades.length > 0) {
						return validTrades;
					}
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

		const orderLink = createRaindexLink(
			network.id,
			raindexOrder.orderbook.id,
			raindexOrder.orderHash,
			'View order on Raindex'
		);

		// Invalidate dashboard balances after successful market order
		invalidateDashboardBalances();

		return transactionSuccess(hash, orderLink, { marketOrderSummary: summary });
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
