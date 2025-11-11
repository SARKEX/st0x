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
} from './getDeploymentArgs';
import { rainlangConfirmationModal } from './stores';
import { createRaindexClient } from './utils/raindexClient';
import { ensureResource, getResourceStore } from './stores/network-data-cache';
import type { Network } from './network';

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
	orderSide: 'Buy' | 'Sell';
	quantityFilled: bigint;
	quantityRequested: bigint;
	outputTokenDecimals: number;
	outputTokenSymbol: string;
	averagePrice: number;
	paymentTokenSymbol: string;
	actualSlippage: bigint;
	isPartialFill: boolean;
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
		options: { message?: string; hash?: string; error?: string; data?: TransactionMetadata | null } = {}
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
					console.log('approval : ', approval);
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
			walkResult?: { quantityFilled: bigint; weightedAveragePrice: number; totalCostScaled: bigint; fills: any[] };
		}
	) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const $signerAddress = get(signerAddress);
		if (!$signerAddress) throw new Error('Signer address not found');
		const inputIndex = options?.ioIndexes?.input ?? 0;
		const outputIndex = options?.ioIndexes?.output ?? 0;

		// Get the input token from the first order
		const inputToken = raindexOrder.inputs[inputIndex];
		if (!inputToken) {
			return transactionError('No input token found in order' as TransactionErrorMessage);
		}

		const outputToken = raindexOrder.outputs[outputIndex];
		if (!outputToken) {
			return transactionError('No input token found in order' as TransactionErrorMessage);
		}

		// Check current allowance
		checkingWalletAllowance(`Checking token allowance...`);
		const currentAllowance = await readContract(config, {
			abi: erc20Abi,
			address: inputToken.token.address as `0x${string}`,
			functionName: 'allowance',
			args: [$signerAddress as Hex, raindexOrder.orderbook.id as `0x${string}`]
		});

		if (currentAllowance < requiredApprovalAmount) {
			// Need to approve more tokens
			awaitWalletConfirmation(`Approving token spend...`);

			const approvalHash = await sendTransaction(config, {
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: 'approve',
					args: [raindexOrder.orderbook.id as `0x${string}`, requiredApprovalAmount]
				}) as Hex,
				to: inputToken.token.address as `0x${string}`
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

			const receipt = await waitForTransactionReceipt(config, { hash });
		console.log('Transaction receipt:', receipt);
		console.log('Transaction hash:', hash);
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

			// Search for our specific trade in the cached data
		const trade = $resource.data.trades.find(
			(t) =>
				t.tradeEvent?.transaction?.id.toLowerCase() === hash.toLowerCase() &&
				t.order?.orderHash.toLowerCase() === raindexOrder.orderHash.toLowerCase()
		) as unknown as {
			tradeEvent?: { transaction?: { id?: string } };
			order?: {
				orderHash?: string;
			};
			inputVaultBalanceChange?: { amount?: string | number; oldVaultBalance?: Hex; newVaultBalance?: Hex };
			outputVaultBalanceChange?: { amount?: string | number; oldVaultBalance?: Hex; newVaultBalance?: Hex };
		};

		if (
			trade &&
			trade.inputVaultBalanceChange &&
			trade.outputVaultBalanceChange &&
			raindexOrder.inputs?.[inputIndex]?.token &&
			raindexOrder.outputs?.[outputIndex]?.token
		) {
			cleanup();

			console.log('=== RAW TRADE OBJECT ===');
			console.log('Full trade:', JSON.stringify(trade, null, 2));
			console.log('=== TRADE FOUND ===');
			console.log('Input vault balance change:', trade.inputVaultBalanceChange);
			console.log('Output vault balance change:', trade.outputVaultBalanceChange);

			// Get the walk result from options
			const { quantityFilled: estimatedQuantityFilled, weightedAveragePrice } = options?.walkResult || {
				quantityFilled: 0n,
				weightedAveragePrice: 0
			};

			// Determine order side from which vault had changes
			// BUY: input = payment token, output = asset token
			// SELL: input = asset token, output = payment token
			const inputToken = raindexOrder.inputs[inputIndex]?.token;
			const outputToken = raindexOrder.outputs[outputIndex]?.token;

			// Get the asset token vault change (the quantity filled)
			// For BUY: asset is OUTPUT, so use outputVaultBalanceChange
			// For SELL: asset is INPUT, so use inputVaultBalanceChange
			let assetVaultChange;
			let assetTokenDecimals;
			let orderSideFromTrade: 'Buy' | 'Sell';

			// Determine order side: if input vault changed significantly, it's a SELL (we sold the asset)
			// If output vault changed, it's a BUY (we bought the asset)
			const inputAmount = Math.abs(Number(trade.inputVaultBalanceChange.amount || 0));
			const outputAmount = Math.abs(Number(trade.outputVaultBalanceChange.amount || 0));

			if (inputAmount > outputAmount) {
				// SELL: asset is being given (input vault decreases)
				assetVaultChange = trade.inputVaultBalanceChange;
				assetTokenDecimals = inputToken?.decimals ?? 18;
				orderSideFromTrade = 'Sell';
			} else {
				// BUY: asset is being received (output vault increases)
				assetVaultChange = trade.outputVaultBalanceChange;
				assetTokenDecimals = outputToken?.decimals ?? 18;
				orderSideFromTrade = 'Buy';
			}

			console.log('Order side from trade:', orderSideFromTrade);
			console.log('Asset vault change amount (hex):', assetVaultChange.amount);
			console.log('Asset token decimals:', assetTokenDecimals);

			// Decode the amount as a Float
			let actualQuantityFilled = 0n;
			try {
				const amountFloatResult = Float.fromHex(assetVaultChange.amount as Hex);
				console.log('Amount Float result:', amountFloatResult);

				if (!amountFloatResult.error && amountFloatResult.value) {
					// Get absolute value
					const absResult = amountFloatResult.value.abs();
					console.log('Absolute result:', absResult);

					if (!absResult.error) {
						// Convert to FixedDecimal with asset token decimals
						const fixedResult = absResult.value.toFixedDecimalLossy(assetTokenDecimals);
						console.log('Fixed decimal result:', fixedResult);

						if (!fixedResult.error && fixedResult.value) {
							// Extract the string value from FixedDecimal
							const fdValue = fixedResult.value;
							if (typeof (fdValue as any).value === 'string') {
								actualQuantityFilled = BigInt((fdValue as any).value);
								console.log('Extracted quantity filled:', actualQuantityFilled.toString());
							}
						}
					}
				}
			} catch (e) {
				console.error('Error decoding amount Float:', e);
			}

			console.log('Final actual quantity filled:', actualQuantityFilled.toString());
			console.log('Estimated average price:', weightedAveragePrice);

			// Build summary from actual transaction data
			const summary: MarketOrderSummary = {
				orderSide: orderSideFromTrade,
				quantityFilled: actualQuantityFilled,
				quantityRequested: estimatedQuantityFilled,
				outputTokenDecimals: assetTokenDecimals,
				outputTokenSymbol: orderSideFromTrade === 'Buy' ? outputToken?.symbol ?? '' : inputToken?.symbol ?? '',
				averagePrice: weightedAveragePrice,
				paymentTokenSymbol: orderSideFromTrade === 'Buy' ? inputToken?.symbol ?? '' : outputToken?.symbol ?? '',
				actualSlippage: 0n,
				isPartialFill: false
			};

			// Check if fill is complete (within 99.9% tolerance)
			const fillPercentage = estimatedQuantityFilled > 0n ? Number(actualQuantityFilled) / Number(estimatedQuantityFilled) : 1;
			summary.isPartialFill = fillPercentage < 0.999;

			console.log('=== SUMMARY BUILT FROM ACTUAL DATA ===');
			console.log('Final summary:', {
				orderSide: summary.orderSide,
				quantityFilled: summary.quantityFilled.toString(),
				quantityRequested: summary.quantityRequested.toString(),
				outputTokenDecimals: summary.outputTokenDecimals,
				outputTokenSymbol: summary.outputTokenSymbol,
				averagePrice: summary.averagePrice,
				paymentTokenSymbol: summary.paymentTokenSymbol,
				isPartialFill: summary.isPartialFill,
				fillPercentage: (fillPercentage * 100).toFixed(2) + '%'
			});

			const chainId = network.id;
			const tokenSold = `${parseFloat(
				formatUnits(
					BigInt(Math.abs(Number(trade.inputVaultBalanceChange.amount))),
					Number(raindexOrder.inputs[inputIndex].token.decimals ?? 18)
				)
			)} ${raindexOrder.inputs[inputIndex].token.symbol}`;
			const tokenBought = `${parseFloat(
				formatUnits(
					BigInt(Math.abs(Number(trade.outputVaultBalanceChange.amount))),
					Number(raindexOrder.outputs[outputIndex].token.decimals ?? 18)
				)
			)} ${raindexOrder.outputs[outputIndex].token.symbol}`;

			const orderLink = createRaindexLink(
				chainId,
				raindexOrder.orderbook.id,
				raindexOrder.orderHash,
				'View order on Raindex'
			);
			const link = `
			</div>
		`;

			console.log('=== TRANSACTION SUCCESS ===');
			console.log('Hash:', hash);
			console.log('Market order summary being passed to modal:', summary);

			return transactionSuccess(
				hash,
				link,
				{ marketOrderSummary: summary }
			);
		}
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
