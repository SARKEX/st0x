import { get, writable } from 'svelte/store';
import type { Hex } from 'viem';
import { sendTransaction, waitForTransactionReceipt } from '@wagmi/core';
import { TransactionErrorMessage } from '$lib/types/errors';
import {
	getTransactionAddOrders,
	type DeploymentTransactionArgs
} from '@rainlanguage/orderbook/js_api';
import { wagmiConfig } from 'svelte-wagmi';
// import {
// 	getMarketMakingDeploymentArgs,
// 	getDcaDeploymentArgs,
// 	type DcaDeploymentArgs,
// 	type MarketMakingDeploymentArgs
// } from './getDeploymentArgs';
// import { TARGET_NETWORK_SUBGRAPH_URL } from './network';
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

	// const handleStrategyDeployment = async (deploymentArgs: DeploymentTransactionArgs) => {
	// 	const config = get(wagmiConfig);
	// 	if (!config) throw new Error('Wagmi config not found');

	// 	if (deploymentArgs.approvals.length > 0) {
	// 		for (const approval of deploymentArgs.approvals) {
	// 			try {
	// 				awaitWalletConfirmation(`Awaiting wallet confirmation to approve ${approval.symbol}...`);
	// 				const hash = await sendTransaction(config, {
	// 					data: approval.calldata as Hex,
	// 					to: approval.token as `0x${string}`
	// 				});
	// 				await waitForTransactionReceipt(config, {
	// 					hash: hash
	// 				});
	// 			} catch (error) {
	// 				// @ts-expect-error Send transaction error
	// 				return transactionError(error?.cause?.details || TransactionErrorMessage.GENERIC);
	// 			}
	// 		}
	// 	}
	// 	let hash: string;
	// 	try {
	// 		awaitWalletConfirmation(`Awaiting wallet confirmation to deploy your strategy...`);

	// 		hash = await sendTransaction(config, {
	// 			data: deploymentArgs.deploymentCalldata as Hex,
	// 			to: deploymentArgs.orderbookAddress as `0x${string}`
	// 		});
	// 	} catch (error) {
	// 		// @ts-expect-error Send transaction error
	// 		return transactionError(error?.cause?.details || TransactionErrorMessage.GENERIC);
	// 	}
	// 	// Poll for the order to be added to the orderbook
	// 	const interval = setInterval(async () => {
	// 		const orders = await getTransactionAddOrders(TARGET_NETWORK_SUBGRAPH_URL, hash);
	// 		if (orders.length > 0) {
	// 			clearInterval(interval);
	// 			const orderHash = orders[0].order.orderHash;
	// 			const link = `
	// 			<a
	// 							target="_blank"
	// 							class="whitespace-pre-wrap break-words text-center hover:underline"
	// 							href="https://v2.raindex.finance/orders/polygon-${orderHash}"
	// 							data-testid="raindex-link">Manage your order on Raindex</a
	// 						>
	// 			`;

	// 			return transactionSuccess(hash, link);
	// 		}
	// 	}, 2000);
	// };

	// const handleDsfDeploy = async (args: MarketMakingDeploymentArgs) => {
	// 	const config = get(wagmiConfig);
	// 	if (!config) throw new Error('Wagmi config not found');
	// 	awaitWalletConfirmation(`Preparing strategy...`);
	// 	const deploymentArgs = await getMarketMakingDeploymentArgs(args);
	// 	await handleStrategyDeployment(deploymentArgs);
	// };

	// const handleDcaDeploy = async (args: DcaDeploymentArgs) => {
	// 	const config = get(wagmiConfig);
	// 	if (!config) throw new Error('Wagmi config not found');
	// 	awaitWalletConfirmation(`Preparing strategy...`);
	// 	const deploymentArgs = await getDcaDeploymentArgs(args);
	// 	await handleStrategyDeployment(deploymentArgs);
	// };

	return {
		subscribe,
		reset,
		checkingWalletAllowance,
		awaitWalletConfirmation,
		awaitApprovalTx,
		transactionSuccess,
		transactionError
		// handleDsfDeploy,
		// handleDcaDeploy
	};
};

export default transactionStore();
