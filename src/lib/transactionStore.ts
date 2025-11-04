import { get, writable } from 'svelte/store';
import { currentNetwork } from '$lib/stores';
import { encodeFunctionData, erc20Abi, formatUnits, type Hex } from 'viem';
import { readContract, sendTransaction, waitForTransactionReceipt } from '@wagmi/core';
import {
	getTakeOrders3Calldata,
	type SgOrder,
	type TakeOrdersConfigV4,
	type DeploymentTransactionArgs,
	type SgVault,
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
					return transactionError(errorMessage as TransactionErrorMessage);
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
			return transactionError(errorMessage as TransactionErrorMessage);
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
				const orderLink = `
					<a
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1 text-sm text-yellow-500 hover:text-yellow-400 hover:underline transition-colors justify-center"
						href="https://v5.raindex.finance"
						data-testid="raindex-link">
						Manage your order on Raindex
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
						</svg>
					</a>
				`;
				return transactionSuccess(hash, orderLink);
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
					const link = `
						<a
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1 text-sm text-yellow-500 hover:text-yellow-400 hover:underline transition-colors justify-center"
							href="https://v5.raindex.finance/orders/${chainId}-${orderbookId}-${orderHash}"
							data-testid="raindex-link">
							Manage your order on Raindex
							<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
							</svg>
						</a>
					`;

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
			const link = `
			<a
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-1 text-sm text-yellow-500 hover:text-yellow-400 hover:underline transition-colors justify-center"
				href="https://v5.raindex.finance/orders/${chainId}-${vault.orderbook}-${vault.id}"
				data-testid="raindex-link">
				Manage your order on Raindex
				<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
				</svg>
			</a>
			`;

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
		} catch (error) {
			return transactionError('Failed to generate transaction calldata' as TransactionErrorMessage);
		}

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

			const hash = await sendTransaction(config, {
				data: calldata as Hex,
				to: raindexOrder.orderbook.id as `0x${string}`
			});

			await waitForTransactionReceipt(config, { hash });
			transactionSuccess(hash, `Order taken successfully!`);
		} catch (error) {
			const errorMessage =
				(error as unknown as { cause?: { details?: string } })?.cause?.details ||
				TransactionErrorMessage.GENERIC;
			return transactionError(errorMessage as TransactionErrorMessage);
		}
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
