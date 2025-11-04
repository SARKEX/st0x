import { get, writable } from 'svelte/store';
import { currentNetwork } from '$lib/stores';
import { encodeFunctionData, erc20Abi, formatUnits, type Hex } from 'viem';
import { readContract, sendTransaction, waitForTransactionReceipt } from '@wagmi/core';
import {
	getTakeOrders3Calldata,
	type SgOrder,
	type TakeOrdersConfigV4,
	type DeploymentTransactionArgs,
	RaindexVault
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
import { decodeFunctionData } from 'viem';
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

const initialState = {
	status: TransactionStatus.IDLE,
	error: '',
	hash: '',
	data: null,
	functionName: '',
	message: ''
};

const transactionStore = () => {
	const { subscribe, set, update } = writable(initialState);
	const reset = () => set(initialState);

	// Generic state update helper
	const setState = (
		status: TransactionStatus,
		options: { message?: string; hash?: string; error?: string } = {}
	) =>
		update((state) => ({
			...state,
			status,
			message: options.message ?? '',
			hash: options.hash ?? '',
			error: options.error ?? ''
		}));

	const checkingWalletAllowance = (message?: string) =>
		setState(TransactionStatus.CHECKING_ALLOWANCE, { message });
	const awaitWalletConfirmation = (message?: string) =>
		setState(TransactionStatus.PENDING_WALLET, { message });
	const awaitApprovalTx = (hash: string) => setState(TransactionStatus.PENDING_APPROVAL, { hash });
	const transactionSuccess = (hash: string, message?: string) =>
		setState(TransactionStatus.SUCCESS, { hash, message });
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
		let hash: string;
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
		let hash: string;
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
		requiredApprovalAmount: bigint
	) => {
		console.log('args : ', args);
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const $signerAddress = get(signerAddress);
		if (!$signerAddress) throw new Error('Signer address not found');

		// Get the input token from the first order
		const inputToken = raindexOrder.inputs[0];
		if (!inputToken) {
			return transactionError('No input token found in order' as TransactionErrorMessage);
		}

		const outputToken = raindexOrder.outputs[0];
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

		let hash: string;
		try {
			awaitWalletConfirmation(`Awaiting wallet confirmation to take order...`);

			// Convert Uint8Array to hex string
			const calldata =
				'0x' +
				Array.from(result.value)
					.map((b) => {
						const hex = Number(b).toString(16);
						return hex.length === 1 ? '0' + hex : hex;
					})
					.join('');

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

			// Search for our specific trade in the cached data
			const trade = $resource.data.trades.find(
				(t) =>
					t.tradeEvent?.transaction?.id.toLowerCase() === hash.toLowerCase() &&
					t.order?.orderHash.toLowerCase() === raindexOrder.orderHash.toLowerCase()
			) as unknown as {
				tradeEvent?: { transaction?: { id?: string } };
				order?: {
					orderHash?: string;
					inputs?: Array<{ token?: { decimals?: number; symbol?: string } }>;
					outputs?: Array<{ token?: { decimals?: number; symbol?: string } }>;
				};
				inputVaultBalanceChange?: { amount?: string | number };
				outputVaultBalanceChange?: { amount?: string | number };
			};

			if (
				trade &&
				trade.inputVaultBalanceChange &&
				trade.outputVaultBalanceChange &&
				trade.order?.inputs?.[0]?.token &&
				trade.order?.outputs?.[0]?.token
			) {
				cleanup();
				const chainId = network.id;
				const tokenSold = `${parseFloat(
					formatUnits(
						BigInt(Math.abs(Number(trade.inputVaultBalanceChange.amount))),
						trade.order.inputs[0].token.decimals ?? 18
					)
				)} ${trade.order.inputs[0].token.symbol}`;
				const tokenBought = `${parseFloat(
					formatUnits(
						BigInt(Math.abs(Number(trade.outputVaultBalanceChange.amount))),
						trade.order.outputs[0].token.decimals ?? 18
					)
				)} ${trade.order.outputs[0].token.symbol}`;

				const orderLink = createRaindexLink(chainId, raindexOrder.orderbook.id, raindexOrder.orderHash, 'View order on Raindex');
				const link = `
				<div class="flex flex-col gap-2 text-center">
					<div class="text-base text-gray-300">
						${tokenBought} bought, ${tokenSold} sold
					</div>
					${orderLink}
				</div>
			`;

				return transactionSuccess(hash, link);
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
