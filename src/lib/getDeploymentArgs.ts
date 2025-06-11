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

export type MarketMakingDeploymentArgs = {
	token1: Token;
	token2: Token;
	amountIsFastExit: boolean;
	notAmountIsFastExit: boolean;
	initialIo: string;
	maxAmount: bigint;
	minAmount: bigint;
	depositAmountToken1: bigint;
	depositAmountToken2: bigint;
	inputVaultIdToken1: Hex | undefined;
	inputVaultIdToken2: Hex | undefined;
	outputVaultIdToken1: Hex | undefined;
	outputVaultIdToken2: Hex | undefined;
};

export const getMarketMakingDeploymentArgs = async (args: MarketMakingDeploymentArgs) => {
	const dsfStrategy = await (
		await fetch(
			'https://raw.githubusercontent.com/rainlanguage/rain.strategies/b0703df4179caa96f217fc0a03b463e29d67c262/src/dynamic-spread.rain'
		)
	).text();
	const gui = await DotrainOrderGui.chooseDeployment(dsfStrategy, TARGET_NETWORK);

	await gui.saveSelectToken('token1', args.token1.address);
	await gui.saveSelectToken('token2', args.token2.address);

	// Save field values using the selected strategy parameters
	gui.saveFieldValue('amount-is-fast-exit', {
		value: args.amountIsFastExit ? '1' : '0',
		isPreset: false
	});

	gui.saveFieldValue('not-amount-is-fast-exit', {
		value: args.notAmountIsFastExit ? '1' : '0',
		isPreset: false
	});

	gui.saveFieldValue('initial-io', {
		value: args.initialIo,
		isPreset: false
	});

	gui.saveFieldValue('max-amount', {
		value: formatUnits(args.maxAmount, args.token1.decimals),
		isPreset: false
	});

	gui.saveFieldValue('min-amount', {
		value: formatUnits(args.minAmount, args.token1.decimals),
		isPreset: false
	});

	gui.saveDeposit('token1', formatUnits(args.depositAmountToken1, args.token1.decimals));
	gui.saveDeposit('token2', formatUnits(args.depositAmountToken2, args.token2.decimals));

	if (args.inputVaultIdToken1) {
		gui.setVaultId(true, 0, args.inputVaultIdToken1);
	}
	if (args.inputVaultIdToken2) {
		gui.setVaultId(true, 1, args.inputVaultIdToken2);
	}
	if (args.outputVaultIdToken1) {
		gui.setVaultId(false, 0, args.outputVaultIdToken1);
	}
	if (args.outputVaultIdToken2) {
		gui.setVaultId(false, 1, args.outputVaultIdToken2);
	}

	const $signerAddress = get(signerAddress);
	if (!$signerAddress) throw new Error('Signer address not found');

	const deploymentArgs = await gui.getDeploymentTransactionArgs($signerAddress);

	return deploymentArgs;
};

export type FolioDeploymentArgs = {
	selectedToken1: Token;
	selectedToken2: Token;
	selectedToken3: Token;
	selectedToken4: Token;
	selectedToken5: Token;
	selectedToken6: Token;
	selectedToken7: Token;
	overrideThreshold: string | undefined;
	overrideFee: string | undefined;
	depositAmount1: bigint;
	depositAmount2: bigint;
	depositAmount3: bigint;
	depositAmount4: bigint;
	depositAmount5: bigint;
	depositAmount6: bigint;
	depositAmount7: bigint;
	inputVaultId1: Hex | undefined;
	inputVaultId2: Hex | undefined;
	inputVaultId3: Hex | undefined;
	inputVaultId4: Hex | undefined;
	inputVaultId5: Hex | undefined;
	inputVaultId6: Hex | undefined;
	inputVaultId7: Hex | undefined;
	outputVaultId1: Hex | undefined;
	outputVaultId2: Hex | undefined;
	outputVaultId3: Hex | undefined;
	outputVaultId4: Hex | undefined;
	outputVaultId5: Hex | undefined;
	outputVaultId6: Hex | undefined;
	outputVaultId7: Hex | undefined;
};

export const getFolioDeploymentArgs = async (args: FolioDeploymentArgs) => {
	const folioStrategy = await (
		await fetch(
			'https://raw.githubusercontent.com/rainlanguage/rain.strategies/5d1bef14c9ef9860e05dcdbf8babdd565aa8af7d/src/folio.rain'
		)
	).text();
	const gui = await DotrainOrderGui.chooseDeployment(folioStrategy, TARGET_NETWORK);

	await gui.saveSelectToken('token1', args.selectedToken1.address);
	await gui.saveSelectToken('token2', args.selectedToken2.address);
	await gui.saveSelectToken('token3', args.selectedToken3.address);
	await gui.saveSelectToken('token4', args.selectedToken4.address);
	await gui.saveSelectToken('token5', args.selectedToken5.address);
	await gui.saveSelectToken('token6', args.selectedToken6.address);
	await gui.saveSelectToken('token7', args.selectedToken7.address);

	if (args.overrideThreshold) {
		gui.saveFieldValue('threshold', {
			value: args.overrideThreshold,
			isPreset: false
		});
	}

	if (args.overrideFee) {
		gui.saveFieldValue('fee', {
			value: args.overrideFee,
			isPreset: false
		});
	}

	gui.saveDeposit('token1', formatUnits(args.depositAmount1, args.selectedToken1.decimals));
	gui.saveDeposit('token2', formatUnits(args.depositAmount2, args.selectedToken2.decimals));
	gui.saveDeposit('token3', formatUnits(args.depositAmount3, args.selectedToken3.decimals));
	gui.saveDeposit('token4', formatUnits(args.depositAmount4, args.selectedToken4.decimals));
	gui.saveDeposit('token5', formatUnits(args.depositAmount5, args.selectedToken5.decimals));
	gui.saveDeposit('token6', formatUnits(args.depositAmount6, args.selectedToken6.decimals));
	gui.saveDeposit('token7', formatUnits(args.depositAmount7, args.selectedToken7.decimals));

	if (args.inputVaultId1) {
		gui.setVaultId(true, 0, args.inputVaultId1);
	}

	if (args.inputVaultId2) {
		gui.setVaultId(true, 1, args.inputVaultId2);
	}

	if (args.inputVaultId3) {
		gui.setVaultId(true, 2, args.inputVaultId3);
	}

	if (args.inputVaultId4) {
		gui.setVaultId(true, 3, args.inputVaultId4);
	}

	if (args.inputVaultId5) {
		gui.setVaultId(true, 4, args.inputVaultId5);
	}

	if (args.inputVaultId6) {
		gui.setVaultId(true, 5, args.inputVaultId6);
	}

	if (args.inputVaultId7) {
		gui.setVaultId(true, 6, args.inputVaultId7);
	}

	if (args.outputVaultId1) {
		gui.setVaultId(false, 0, args.outputVaultId1);
	}

	if (args.outputVaultId2) {
		gui.setVaultId(false, 1, args.outputVaultId2);
	}

	if (args.outputVaultId3) {
		gui.setVaultId(false, 2, args.outputVaultId3);
	}

	if (args.outputVaultId4) {
		gui.setVaultId(false, 3, args.outputVaultId4);
	}

	if (args.outputVaultId5) {
		gui.setVaultId(false, 4, args.outputVaultId5);
	}

	if (args.outputVaultId6) {
		gui.setVaultId(false, 5, args.outputVaultId6);
	}

	if (args.outputVaultId7) {
		gui.setVaultId(false, 6, args.outputVaultId7);
	}

	const $signerAddress = get(signerAddress);
	if (!$signerAddress) throw new Error('Signer address not found');

	const deploymentArgs = await gui.getDeploymentTransactionArgs($signerAddress);

	return deploymentArgs;
}