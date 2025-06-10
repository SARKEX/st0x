import { get } from 'svelte/store';
import { signerAddress } from 'svelte-wagmi';
import { DotrainOrderGui } from '@rainlanguage/orderbook/js_api';
import { Token } from 'sushi/currency';
// import { getPrice } from './prices';
import type { Hex } from 'viem';
import { formatUnits } from 'viem';
import { TARGET_NETWORK } from './network';
import { getPeriodInSeconds } from './derivations';
import { getPrice } from './getPrice';
// import { TARGET_NETWORK } from './network';
// import { getPeriodInSeconds } from './derivations';

// export type MarketMakingDeploymentArgs = {
// 	token1: Token;
// 	token2: Token;
// 	amountIsFastExit: boolean;
// 	notAmountIsFastExit: boolean;
// 	maxAmount: bigint;
// 	minAmount: bigint;
// 	depositAmountToken1: bigint;
// 	depositAmountToken2: bigint;
// 	costBasisMultiplier: string | undefined;
// 	inputVaultIdToken1: Hex | undefined;
// 	inputVaultIdToken2: Hex | undefined;
// 	outputVaultIdToken1: Hex | undefined;
// 	outputVaultIdToken2: Hex | undefined;
// };

// export const getMarketMakingDeploymentArgs = async (args: MarketMakingDeploymentArgs) => {
// 	const dsfStrategy = await (
// 		await fetch(
// 			'https://raw.githubusercontent.com/rainlanguage/rain.strategies/b0703df4179caa96f217fc0a03b463e29d67c262/src/dynamic-spread.rain'
// 		)
// 	).text();
// 	const gui = await DotrainOrderGui.chooseDeployment(dsfStrategy, TARGET_NETWORK);

// 	await gui.saveSelectToken('token1', args.token1.address);
// 	await gui.saveSelectToken('token2', args.token2.address);

// 	// Save field values using the selected strategy parameters
// 	gui.saveFieldValue('amount-is-fast-exit', {
// 		value: args.amountIsFastExit ? '1' : '0',
// 		isPreset: false
// 	});

// 	gui.saveFieldValue('not-amount-is-fast-exit', {
// 		value: args.notAmountIsFastExit ? '1' : '0',
// 		isPreset: false
// 	});

// 	const initialIO = await getPrice(args.token2, args.token1);
// 	gui.saveFieldValue('initial-io', {
// 		value: initialIO,
// 		isPreset: false
// 	});

// 	gui.saveFieldValue('max-amount', {
// 		value: formatUnits(args.maxAmount, args.token1.decimals),
// 		isPreset: false
// 	});

// 	gui.saveFieldValue('min-amount', {
// 		value: formatUnits(args.minAmount, args.token1.decimals),
// 		isPreset: false
// 	});

// 	if (args.costBasisMultiplier) {
// 		gui.saveFieldValue('cost-basis-multiplier', {
// 			value: args.costBasisMultiplier,
// 			isPreset: false
// 		});
// 	}

// 	gui.saveDeposit('token1', formatUnits(args.depositAmountToken1, args.token1.decimals));
// 	gui.saveDeposit('token2', formatUnits(args.depositAmountToken2, args.token2.decimals));

// 	if (args.inputVaultIdToken1) {
// 		gui.setVaultId(true, 0, args.inputVaultIdToken1);
// 	}
// 	if (args.inputVaultIdToken2) {
// 		gui.setVaultId(true, 1, args.inputVaultIdToken2);
// 	}
// 	if (args.outputVaultIdToken1) {
// 		gui.setVaultId(false, 0, args.outputVaultIdToken1);
// 	}
// 	if (args.outputVaultIdToken2) {
// 		gui.setVaultId(false, 1, args.outputVaultIdToken2);
// 	}

// 	const $signerAddress = get(signerAddress);
// 	if (!$signerAddress) throw new Error('Signer address not found');

// 	const deploymentArgs = await gui.getDeploymentTransactionArgs($signerAddress);

// 	return deploymentArgs;
// };

export type DcaDeploymentArgs = {
	outputToken: Token;
	inputToken: Token;
	budgetAmount: bigint;
	selectedPeriod: string;
	selectedPeriodUnit: 'Days' | 'Hours' | 'Minutes';
	kickoff: string;
	baseline: string;
	minTradeAmount: bigint;
	maxTradeAmount: bigint;
	inputVaultId: Hex | undefined;
	outputVaultId: Hex | undefined;
	depositAmount: bigint;
};

export const getDcaDeploymentArgs = async (args: DcaDeploymentArgs) => {
	const dcaStrategy = await (
		await fetch(
			'https://raw.githubusercontent.com/rainlanguage/rain.strategies/b0703df4179caa96f217fc0a03b463e29d67c262/src/auction-dca.rain'
		)
	).text();
	const gui = await DotrainOrderGui.chooseDeployment(dcaStrategy, TARGET_NETWORK);

	await gui.saveSelectToken('output', args.outputToken.address);
	await gui.saveSelectToken('input', args.inputToken.address);

	gui.saveFieldValue('time-per-amount-epoch', {
		value: getPeriodInSeconds(args.selectedPeriod, args.selectedPeriodUnit).toString(),
		isPreset: false
	});

	gui.saveFieldValue('amount-per-epoch', {
		value: formatUnits(args.budgetAmount, args.outputToken.decimals),
		isPreset: false
	});

	gui.saveFieldValue('max-trade-amount', {
		value: formatUnits(args.maxTradeAmount, args.outputToken.decimals),
		isPreset: false
	});

	gui.saveFieldValue('min-trade-amount', {
		value: formatUnits(args.minTradeAmount, args.outputToken.decimals),
		isPreset: false
	});

	gui.saveFieldValue('baseline', {
		value: args.baseline,
		isPreset: false
	});

	gui.saveFieldValue('initial-io', {
		value: args.kickoff,
		isPreset: false
	});

	gui.saveDeposit('output', formatUnits(args.depositAmount, args.outputToken.decimals));

	if (args.inputVaultId) {
		gui.setVaultId(true, 0, args.inputVaultId);
	}

	if (args.outputVaultId) {
		gui.setVaultId(false, 0, args.outputVaultId);
	}

	const $signerAddress = get(signerAddress);
	if (!$signerAddress) throw new Error('Signer address not found');

	const deploymentArgs = await gui.getDeploymentTransactionArgs($signerAddress);

	return deploymentArgs;
};

export type LimitOrderDeploymentArgs = {
	outputToken: Token;
	inputToken: Token;
	ioRatio: string;
	depositAmount: bigint;
	inputVaultId: Hex | undefined;
	outputVaultId: Hex | undefined;
};

export const getLimitOrderDeploymentArgs = async (args: LimitOrderDeploymentArgs) => {
	try {
		const dsfStrategy = await (
			await fetch(
				'https://raw.githubusercontent.com/rainlanguage/rain.strategies/b0703df4179caa96f217fc0a03b463e29d67c262/src/fixed-limit.rain'
			)
		).text();
		const gui = await DotrainOrderGui.chooseDeployment(dsfStrategy, TARGET_NETWORK);

		await gui.saveSelectToken('token1', args.inputToken.address);
		await gui.saveSelectToken('token2', args.outputToken.address);

		// Save field values using the selected strategy parameters
		gui.saveFieldValue('fixed-io', {
			value: args.ioRatio,
			isPreset: false
		});

		gui.saveDeposit('token2', formatUnits(args.depositAmount, args.outputToken.decimals));

		if (args.inputVaultId) {
			gui.setVaultId(true, 0, args.inputVaultId);
		}

		if (args.outputVaultId) {
			gui.setVaultId(false, 0, args.outputVaultId);
		}

		const $signerAddress = get(signerAddress);
		if (!$signerAddress) throw new Error('Signer address not found');

		const deploymentArgs = await gui.getDeploymentTransactionArgs($signerAddress);

		return deploymentArgs;
	} catch (error) {
		console.error(error);
		throw error;
	}
};
