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
import { readContract, sendTransaction, waitForTransactionReceipt } from '@wagmi/core';
import {
	getTakeOrders3Calldata,
	type SgOrder,
	type TakeOrdersConfigV4,
	type DeploymentTransactionArgs,
	RaindexVault,
	type RaindexOrder
} from '@rainlanguage/orderbook';
import { parseFloatHex, getRaindexOrderUrl, isPaymentToken } from '$lib/utils/tokenMath';
import { TransactionErrorMessage } from '$lib/types/errors';
import { isStaleWalletSessionError, handleStaleWalletSession } from '$lib/utils/walletUtils';
import type { TakeOrdersParams } from '$lib/types/transactions';
import { signerAddress, wagmiConfig } from 'svelte-wagmi';
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
import { rainlangConfirmationModal } from '$lib/stores';
import { createRaindexClient } from '$lib/clients/raindex';
import { invalidateOrderQueries } from '$lib/queries/orderbook';
import { invalidateUserVaultQueries } from '$lib/queries/vaults';
import type { Network } from '$lib/config/network';
import { getTrades } from '$lib/api/subgraph';

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

export interface TransactionMetadata {
	marketOrderSummary?: MarketOrderSummary;
	assetTokenInfo?: AssetTokenInfo; // For limit/DCA order deployments
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
		const $signerAddress = get(signerAddress);
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
					const hash = await sendTransaction(config, {
						data: approval.calldata as Hex,
						to: approval.token as `0x${string}`
					});
					awaitApprovalTx(hash);
					await waitForTransactionReceipt(config, {
						hash: hash
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
			}
		}
		let hash: Hash;
		try {
			awaitWalletConfirmation(`Awaiting wallet confirmation to deploy your strategy...`);

			hash = await sendTransaction(config, {
				data: deploymentArgs.deploymentCalldata as Hex,
				to: deploymentArgs.orderbookAddress as `0x${string}`
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
			return transactionSuccess(hash, immediateLink, metadata);
		}

		const interval = setInterval(async () => {
			attempts++;

			// Stop polling after max attempts
			if (attempts >= maxAttempts) {
				clearInterval(interval);
				invalidateOrderQueries();
				return transactionSuccess(hash, 'Order deployed successfully!', metadata);
			}

			try {
				const link = await tryFetchOrderLink();
				if (link) {
					clearInterval(interval);
					invalidateOrderQueries();
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
			awaitWalletConfirmation(`Awaiting wallet confirmation for withdrawal...`);

			hash = await sendTransaction(config, {
				data: vaultWithdrawCalldata.value as Hex,
				to: vault.orderbook as `0x${string}`
			});
			awaitWalletConfirmation(`Awaiting transaction confirmation...`);

			await waitForTransactionReceipt(config, {
				hash: hash as `0x${string}`
			});

			const network = get(currentNetwork);
			const $signer = get(signerAddress);
			const link = createRaindexLink(network.id, vault.orderbook, vault.id);

			// Invalidate vault queries for this specific token
			const tokenAddress = vault.token?.address ?? vault.token?.id;
			invalidateUserVaultQueries(network.id, $signer ?? undefined, tokenAddress);

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
		const $signerAddress = get(signerAddress);

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

					const vaultWithdrawCalldata = await vault.getWithdrawCalldata(vault.balance);
					if (vaultWithdrawCalldata.error) {
						throw new Error(vaultWithdrawCalldata.error.readableMsg);
					}

					awaitWalletConfirmation(`Withdrawing from vault ${i + 1}/${vaultsWithBalance.length}...`);

					const withdrawHash = await sendTransaction(config, {
						data: vaultWithdrawCalldata.value as Hex,
						to: vault.orderbook as `0x${string}`
					});

					awaitWalletConfirmation(`Awaiting withdrawal confirmation...`);

					await waitForTransactionReceipt(config, {
						hash: withdrawHash as `0x${string}`
					});
				}
			}

			// Step 2: Deactivate/remove the order
			const removeCalldata = order.getRemoveCalldata();
			if (removeCalldata.error) {
				throw new Error(removeCalldata.error.readableMsg);
			}

			awaitWalletConfirmation('Awaiting wallet confirmation to cancel order...');

			const hash = await sendTransaction(config, {
				data: removeCalldata.value as Hex,
				to: order.orderbook as `0x${string}`
			});

			awaitWalletConfirmation('Awaiting transaction confirmation...');

			await waitForTransactionReceipt(config, {
				hash: hash as `0x${string}`
			});

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
		const $signerAddress = get(signerAddress);

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
					const removeCalldata = order.getRemoveCalldata();
					if (removeCalldata.error) {
						throw new Error(removeCalldata.error.readableMsg);
					}

					awaitWalletConfirmation('Awaiting wallet confirmation to deactivate order...');

					const removeHash = await sendTransaction(config, {
						data: removeCalldata.value as Hex,
						to: order.orderbook as `0x${string}`
					});

					awaitWalletConfirmation('Awaiting deactivation confirmation...');

					await waitForTransactionReceipt(config, {
						hash: removeHash as `0x${string}`
					});
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

				const vaultWithdrawCalldata = await vault.getWithdrawCalldata(vault.balance);
				if (vaultWithdrawCalldata.error) {
					throw new Error(vaultWithdrawCalldata.error.readableMsg);
				}

				awaitWalletConfirmation(
					`Awaiting wallet confirmation for withdrawal ${i + 1}/${vaultsWithBalance.length}...`
				);

				lastHash = await sendTransaction(config, {
					data: vaultWithdrawCalldata.value as Hex,
					to: vault.orderbook as `0x${string}`
				});

				awaitWalletConfirmation(`Awaiting transaction confirmation...`);

				await waitForTransactionReceipt(config, {
					hash: lastHash as `0x${string}`
				});
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
		params: TakeOrdersParams
	) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const $signerAddress = get(signerAddress);
		if (!$signerAddress) throw new Error('Signer address not found');
		const inputIndex = params.ioIndexes.input;
		const outputIndex = params.ioIndexes.output;

		// Get the tokens from the order
		const inputToken = raindexOrder.inputs[inputIndex];
		if (!inputToken) {
			return transactionError('No input token found in order' as TransactionErrorMessage);
		}

		const outputToken = raindexOrder.outputs[outputIndex];
		if (!outputToken) {
			return transactionError('No output token found in order' as TransactionErrorMessage);
		}

		const approvalToken = inputToken;

		// Check current allowance for the token that needs approval
		checkingWalletAllowance(`Checking token allowance...`);
		const currentAllowance = await readContract(config, {
			abi: erc20Abi,
			address: approvalToken.token.address as `0x${string}`,
			functionName: 'allowance',
			args: [$signerAddress as Hex, raindexOrder.orderbook.id as `0x${string}`]
		});

		if (currentAllowance < requiredApprovalAmount) {
			// Need to approve more tokens
			awaitWalletConfirmation(
				`Awaiting wallet confirmation to approve ${approvalToken.token.symbol}...`
			);

			const approvalHash = await sendTransaction(config, {
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: 'approve',
					args: [raindexOrder.orderbook.id as `0x${string}`, requiredApprovalAmount]
				}) as Hex,
				to: approvalToken.token.address as `0x${string}`
			});

			awaitApprovalTx(approvalHash);
			await waitForTransactionReceipt(config, { hash: approvalHash });
		}

		// Now take the order
		awaitWalletConfirmation(`Taking order...`);

		let result;
		try {
			result = getTakeOrders3Calldata(args);

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
			hash = await sendTransaction(config, {
				data: calldata as Hex,
				to: raindexOrder.orderbook.id as `0x${string}`
			});

			awaitWalletConfirmation(`Awaiting transaction confirmation...`);
			await waitForTransactionReceipt(config, { hash });

			awaitWalletConfirmation(`Transaction confirmed. Waiting for indexer...`);
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

		const network = get(currentNetwork) as Network;
		// Poll subgraph for the transaction to appear in trades (5 minute timeout)
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

		const orderLink = createRaindexLink(
			network.id,
			raindexOrder.orderbook.id,
			raindexOrder.orderHash,
			'View order on Raindex'
		);

		return transactionSuccess(hash, orderLink, { marketOrderSummary: summary });
	};

	const handleFolioDeploy = async (args: FolioDeploymentArgs) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
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
