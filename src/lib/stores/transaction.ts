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
	Float
} from '@rainlanguage/orderbook';
import { TransactionErrorMessage } from '$lib/types/errors';
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
} from '$lib/api/deployment';
import { rainlangConfirmationModal } from '$lib/stores';
import { createRaindexClient } from '$lib/api/raindex';
import { ensureResource, getResourceStore } from '$lib/stores/cache';
import type { Network } from '$lib/config/network';

// Helper function to create Raindex v5 link HTML
function createRaindexLink(
	chainId: number,
	orderbookId: string,
	orderHashOrVaultId: string,
	linkText = 'Manage your order on Raindex'
): string {
	return `
		<a
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-1 text-sm text-yellow-500 hover:text-yellow-400 hover:underline transition-colors justify-center"
			href="https://v5.raindex.finance/orders/${chainId}-${orderbookId}-${orderHashOrVaultId}"
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
	outputAmount: bigint; // What the user GIVES AWAY
	outputTokenDecimals: number;
	outputTokenSymbol: string;
	requestedInputAmount: bigint; // What the user requested to receive
	ioRatio: number; // input per output (how much input received per unit output given)
	actualSlippage: bigint;
	isPartialFill: boolean;
	isNoFill?: boolean;
}

export interface TransactionMetadata {
	marketOrderSummary?: MarketOrderSummary;
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

	const handleStrategyDeployment = async (deploymentArgs: DeploymentTransactionArgs) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const $signerAddress = get(signerAddress);
		if (!$signerAddress) throw new Error('Signer address not found');

		if (deploymentArgs.approvals.length > 0) {
			// Check token balances first
			for (const approval of deploymentArgs.approvals) {
				const balance = await readContract(config, {
					abi: erc20Abi,
					address: approval.token as `0x${string}`,
					functionName: 'balanceOf',
					args: [$signerAddress as Hex]
				});
				const { args } = decodeFunctionData({
					abi: erc20Abi,
					data: approval.calldata as Hex
				});

				if (balance < BigInt(args[1] as string)) {
					return transactionError(
						`Insufficient ${approval.symbol} balance. Please add more ${approval.symbol} to your wallet or reduce the ${approval.symbol} deposit amount in advanced options.` as TransactionErrorMessage
					);
				}
			}
		}

		if (deploymentArgs.approvals.length > 0) {
			for (const approval of deploymentArgs.approvals) {
				try {
					awaitWalletConfirmation(`Awaiting wallet confirmation to approve ${approval.symbol}...`);
					const hash = await sendTransaction(config, {
						data: approval.calldata as Hex,
						to: approval.token as `0x${string}`
					});
					await waitForTransactionReceipt(config, {
						hash: hash
					});
				} catch (error) {
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
			const errorMessage =
				(error as unknown as { cause?: { details?: string } })?.cause?.details ||
				TransactionErrorMessage.GENERIC;
			const message =
				typeof errorMessage === 'string' && errorMessage !== TransactionErrorMessage.GENERIC
					? (errorMessage as TransactionErrorMessage)
					: TransactionErrorMessage.GENERIC;
			return transactionError(message);
		}

		// Poll for the order to be added to the orderbook
		let attempts = 0;
		const maxAttempts = 30; // 1 minute max (30 * 2 seconds)
		const network = get(currentNetwork);

		const interval = setInterval(async () => {
			attempts++;

			// Stop polling after max attempts
			if (attempts >= maxAttempts) {
				clearInterval(interval);
				return transactionSuccess(hash, 'Order deployed successfully!');
			}

			try {
				// Get RaindexClient
				const client = await createRaindexClient();

				// Check for orders added in this transaction
				const orders = await client.getAddOrdersForTransaction(
					network.id,
					deploymentArgs.orderbookAddress as `0x${string}`,
					hash as `0x${string}`
				);

				if (orders.error) {
					return; // Continue polling
				}

				if (orders.value && orders.value.length > 0) {
					clearInterval(interval);
					const orderHash = orders.value[0].orderHash;
					const orderbookId = orders.value[0].orderbook;
					const chainId = network.id;
					const link = createRaindexLink(chainId, orderbookId, orderHash);

					return transactionSuccess(hash, link);
				}
			} catch (error) {
				// Continue polling
				console.error('Error checking for orders:', error);
			}
		}, 2000);
	};

	const showRainlangConfirmation = (
		composedRainlang: string,
		deploymentArgs: DeploymentTransactionArgs
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
				handleStrategyDeployment(deploymentArgs);
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
		awaitWalletConfirmation(`Preparing strategy...`);
		const { composedRainlang, deploymentArgs } = await getMarketMakingDeploymentArgs(args);

		showRainlangConfirmation(composedRainlang, deploymentArgs);
	};

	const handleDcaDeploy = async (args: DcaDeploymentArgs) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		awaitWalletConfirmation(`Preparing strategy...`);
		const { composedRainlang, deploymentArgs } = await getDcaDeploymentArgs(args);

		showRainlangConfirmation(composedRainlang, deploymentArgs);
	};

	const handleLimitDeploy = async (args: LimitOrderDeploymentArgs) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		awaitWalletConfirmation(`Preparing strategy...`);
		const { composedRainlang, deploymentArgs } = await getLimitOrderDeploymentArgs(args);

		showRainlangConfirmation(composedRainlang, deploymentArgs);
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

			const chainId = get(currentNetwork).id;
			const link = createRaindexLink(chainId, vault.orderbook, vault.id);

			return transactionSuccess(hash, link);
		} catch (error) {
			// @ts-expect-error Send transaction error
			return transactionError(error?.cause?.details || TransactionErrorMessage.GENERIC);
		}
	};

	const handleTakeOrders = async (
		args: TakeOrdersConfigV4,
		raindexOrder: SgOrder,
		requiredApprovalAmount: bigint,
		options?: {
			ioIndexes?: { input: number; output: number };
			walkResult?: {
				inputAmountFilled: bigint;
				outputAmountGiven: bigint;
				ioRatio: number;
				fills: unknown[];
			};
			inputToken?: { decimals?: number; symbol?: string };
			outputToken?: { decimals?: number; symbol?: string };
			requestedInputAmount?: bigint;
		}
	) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const $signerAddress = get(signerAddress);
		if (!$signerAddress) throw new Error('Signer address not found');
		const inputIndex = options?.ioIndexes?.input ?? 0;
		const outputIndex = options?.ioIndexes?.output ?? 0;

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
			awaitWalletConfirmation(`Approving ${approvalToken.token.symbol} spend...`);

			const approvalHash = await sendTransaction(config, {
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: 'approve',
					args: [raindexOrder.orderbook.id as `0x${string}`, requiredApprovalAmount]
				}) as Hex,
				to: approvalToken.token.address as `0x${string}`
			});

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

			await waitForTransactionReceipt(config, { hash });
		} catch (error) {
			const errorMessage =
				(error as unknown as { cause?: { details?: string } })?.cause?.details ||
				TransactionErrorMessage.GENERIC;
			const message =
				typeof errorMessage === 'string' && errorMessage !== TransactionErrorMessage.GENERIC
					? (errorMessage as TransactionErrorMessage)
					: TransactionErrorMessage.GENERIC;
			return transactionError(message);
		}

		// Force refresh pending trades to pick up the new transaction
		const network = get(currentNetwork) as Network;
		const pendingTradesResult = ensureResource(network.id, 'pendingTrades', { force: true });
		if (pendingTradesResult instanceof Promise) {
			pendingTradesResult.catch(() => {});
		}

		// Subscribe to pending trades cache instead of polling directly
		let unsubscribe: (() => void) | null = null;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;

		const cleanup = () => {
			if (unsubscribe) unsubscribe();
			if (timeoutId) clearTimeout(timeoutId);
		};

		unsubscribe = getResourceStore(network.id, 'pendingTrades').subscribe(($resource) => {
			if (!$resource?.data?.trades) return;

			// Find ALL trades for this transaction (multiple orders can be matched)
			const allTrades = $resource.data.trades.filter(
				(t) => t.tradeEvent?.transaction?.id.toLowerCase() === hash.toLowerCase()
			) as unknown as Array<{
				tradeEvent?: { transaction?: { id?: string } };
				order?: {
					orderHash?: string;
				};
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

			// Only proceed if we have trades with vault changes
			const validTrades = allTrades.filter(
				(t) => t.inputVaultBalanceChange?.amount && t.outputVaultBalanceChange?.amount
			);

			if (validTrades.length === 0) {
				return;
			}

			cleanup();

			// Get the walk result from options
			const {
				inputAmountFilled: estimatedInputFilled,
				outputAmountGiven: estimatedOutputGiven,
				ioRatio: estimatedIoRatio
			} = options?.walkResult || {
				inputAmountFilled: 0n,
				outputAmountGiven: 0n,
				ioRatio: 0
			};

			// Helper function to parse hex amount using Float
			const parseHexAmount = (hexAmount: Hex, decimals: number): bigint => {
				try {
					const floatResult = Float.fromHex(hexAmount);
					if (floatResult.error) {
						console.error('Error parsing hex:', floatResult.error);
						return 0n;
					}

					const float = floatResult.value;
					const absResult = float.abs();
					if (absResult.error) {
						console.error('Error getting absolute value:', absResult.error);
						return 0n;
					}

					const fixedResult = absResult.value.toFixedDecimalLossy(decimals);
					if (fixedResult.error) {
						console.error('Error converting to fixed decimal:', fixedResult.error);
						return 0n;
					}

					const fdValue = fixedResult.value;
					const fdValueObj = fdValue as unknown as Record<string, unknown>;
					if (typeof fdValueObj?.value === 'string') {
						return BigInt(fdValueObj.value as string);
					}
					return 0n;
				} catch (e) {
					console.error('Error decoding amount Float:', e);
					return 0n;
				}
			};

			// Get token info from options (passed by MarketOrder component)
			// NOTE: inputVaultBalanceChange = what user receives (INPUT)
			//       outputVaultBalanceChange = what user gives (OUTPUT)
			const inputTokenDecimals = options?.inputToken?.decimals ?? 18;
			const inputTokenSymbol = options?.inputToken?.symbol ?? '';

			const outputTokenDecimals = options?.outputToken?.decimals ?? 18;
			const outputTokenSymbol = options?.outputToken?.symbol ?? '';

			// Sum vault changes: INPUT = what user receives (inputVault), OUTPUT = what user gives (outputVault)
			let totalInputAmount = 0n;
			let totalOutputAmount = 0n;
			for (const trade of validTrades) {
				// User INPUT = inputVaultBalanceChange (what they receive)
				const inputAmount = parseHexAmount(
					trade.inputVaultBalanceChange!.amount as Hex,
					inputTokenDecimals
				);
				totalInputAmount += inputAmount;

				// User OUTPUT = outputVaultBalanceChange (what they give)
				const outputAmount = parseHexAmount(
					trade.outputVaultBalanceChange!.amount as Hex,
					outputTokenDecimals
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
			const requestedInputAmount = options?.requestedInputAmount ?? estimatedInputFilled;

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
				outputAmount: totalOutputAmount,
				outputTokenDecimals,
				outputTokenSymbol,
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
		});

		// Safety timeout: give up after 5 minutes if trade not found
		// This gives the subgraph time to index the transaction and trade
		timeoutId = setTimeout(() => {
			cleanup();
			transactionError(TransactionErrorMessage.GENERIC, hash);
		}, 300_000);
	};

	const handleFolioDeploy = async (args: FolioDeploymentArgs) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		awaitWalletConfirmation(`Preparing strategy...`);
		const { composedRainlang, deploymentArgs } = await getFolioDeploymentArgs(args);

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
		handleWithdraw
	};
};

export default transactionStore();
