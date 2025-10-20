import { get, writable } from 'svelte/store';
import { currentNetwork } from '$lib/stores';
import { encodeFunctionData, erc20Abi, type Hex } from 'viem';
import { readContract, sendTransaction, waitForTransactionReceipt } from '@wagmi/core';
import { getTakeOrders2Calldata, type TakeOrdersConfigV3 } from '@rainlanguage/orderbook'
import { TransactionErrorMessage } from '$lib/types/errors';
import {
	getTransactionAddOrders,
	getVaultWithdrawCalldata,
	type DeploymentTransactionArgs,
	type SgVault
} from '@rainlanguage/orderbook';
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

	const checkingWalletAllowance = (message?: string) =>
		update((state) => ({
			...state,
			status: TransactionStatus.CHECKING_ALLOWANCE,
			message: message || ''
		}));
	const awaitWalletConfirmation = (message?: string) =>
		update((state) => ({
			...state,
			status: TransactionStatus.PENDING_WALLET,
			message: message || ''
		}));
	const awaitApprovalTx = (hash: string) =>
		update((state) => ({
			...state,
			hash: hash,
			status: TransactionStatus.PENDING_APPROVAL,
			message: ''
		}));
	const transactionSuccess = (hash: string, message?: string) =>
		update((state) => ({
			...state,
			status: TransactionStatus.SUCCESS,
			hash: hash,
			message: message || ''
		}));
	const transactionError = (message: TransactionErrorMessage, hash?: string) =>
		update((state) => ({
			...state,
			status: TransactionStatus.ERROR,
			error: message,
			hash: hash || ''
		}));

	const handleWithdraw = async (vault: SgVault) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const vaultWithdrawCalldata = await getVaultWithdrawCalldata(vault, vault.balance);
		let hash: string;
		try {
			awaitWalletConfirmation(`Awaiting wallet confirmation for withdrawal...`);

			hash = await sendTransaction(config, {
				data: vaultWithdrawCalldata.value as Hex,
				to: vault.orderbook.id as `0x${string}`
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
				href="https://v2.raindex.finance/orders/${chainId}-${vault.orderbook.id}-${vault.id}"
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

	const handleStrategyDeployment = async (deploymentArgs: DeploymentTransactionArgs) => {
		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');

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
					// @ts-expect-error Send transaction error
					return transactionError(error?.cause?.details || TransactionErrorMessage.GENERIC);
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
			awaitWalletConfirmation(`Awaiting transaction confirmation...`);
		} catch (error) {
			// @ts-expect-error Send transaction error
			return transactionError(error?.cause?.details || TransactionErrorMessage.GENERIC);
		}
		// Poll for the order to be added to the orderbook
		const interval = setInterval(async () => {
			const network = get(currentNetwork);
			const orders = (await getTransactionAddOrders(network.orderbook_subgraph_url, hash)).value;
			if (orders && orders.length > 0) {
				clearInterval(interval);
				const orderHash = orders[0].order.orderHash;
				const orderbookId = orders[0].order.orderbook.id;
				const chainId = get(currentNetwork).id;
				const link = `
				<a
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-1 text-sm text-yellow-500 hover:text-yellow-400 hover:underline transition-colors justify-center"
								href="https://v2.raindex.finance/orders/${chainId}-${orderbookId}-${orderHash}"
								data-testid="raindex-link">
								Manage your order on Raindex
								<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
								</svg>
							</a>
				`;

				return transactionSuccess(hash, link);
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

	const handleTakeOrders = async (args: TakeOrdersConfigV3, orderbookAddress: `0x${string}`, marketPrice: bigint) => {

		const config = get(wagmiConfig);
		if (!config) throw new Error('Wagmi config not found');
		const $signerAddress = get(signerAddress);
		if (!$signerAddress) throw new Error('Signer address not found');

		// Get the input token from the first order
		const inputToken = args.orders[0].order.validInputs[0];
		if (!inputToken) {
			return transactionError('No input token found in order' as TransactionErrorMessage);
		}

		const outputToken = args.orders[0].order.validOutputs[0];
		if (!outputToken) {
			return transactionError('No input token found in order' as TransactionErrorMessage);
		}

		// Check current allowance
		checkingWalletAllowance(`Checking token allowance...`);
		const currentAllowance = await readContract(config, {
			abi: erc20Abi,
			address: inputToken.token as `0x${string}`,
			functionName: 'allowance',
			args: [$signerAddress as Hex, orderbookAddress]
		});

		// Calculate required amount from maxInput
		const requiredAmount = BigInt(BigInt(args.maximumInput) * BigInt(10 ** (18 - Number(outputToken.decimals))));
		const requiredAmountFp18 = ((requiredAmount * marketPrice) / 1000000000000000000n);
		
		// rounding up
		const requiredAmountFormattedDecimals = requiredAmountFp18 / BigInt(10 ** (18 - Number(inputToken.decimals))) + 1n;

		if (currentAllowance < BigInt(requiredAmountFormattedDecimals)) {
			// Need to approve more tokens
			awaitWalletConfirmation(`Approving token spend...`);

			const approvalHash = await sendTransaction(config, {
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: 'approve',
					args: [orderbookAddress, requiredAmountFormattedDecimals]
				}) as Hex,
				to: inputToken.token as `0x${string}`
			});

			await waitForTransactionReceipt(config, { hash: approvalHash });
		}

		// Now take the order
		awaitWalletConfirmation(`Executing market order...`);

		let result;
		try {
			result = getTakeOrders2Calldata(args);

			if (result.error) {
				console.log('result.error', result.error);
				return transactionError(result.error as unknown as TransactionErrorMessage);
			}

			if (!result.value) {
				console.log('result.value', result.value);
				return transactionError(
					'Failed to generate transaction calldata x1' as TransactionErrorMessage
				);
			}
		} catch (error) {
			// void error;
			console.log('error', error);
			return transactionError('Failed to generate transaction calldata x2' as TransactionErrorMessage);
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

			// const req = await simulateContract

			const hash = await sendTransaction(config, {
				data: calldata as Hex,
				to: orderbookAddress
			});

			await waitForTransactionReceipt(config, { hash });
			transactionSuccess(hash, `Order taken successfully!`);
		} catch (error) {
			// @ts-expect-error Send transaction error
			return transactionError(error?.cause?.details || TransactionErrorMessage.GENERIC);
		}

	}

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
		handleWithdraw,
		handleTakeOrders
	};
};

export default transactionStore();
