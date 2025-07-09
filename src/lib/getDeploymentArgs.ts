import { get } from 'svelte/store';
import { signerAddress } from 'svelte-wagmi';
import { DotrainOrderGui } from '@rainlanguage/orderbook';
import { Token } from 'sushi/currency';
import type { Hex } from 'viem';
import { formatUnits } from 'viem';
import { TARGET_NETWORK } from './network';
import { getPeriodInSeconds } from './derivations';

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
			'https://raw.githubusercontent.com/rainlanguage/rain.strategies/e9b2c5bf2ec6500f4def41b74653cdd998c26df5/src/auction-dca.rain'
		)
	).text();
	const gui = (await DotrainOrderGui.newWithDeployment(dcaStrategy, TARGET_NETWORK))
		.value as DotrainOrderGui;

	await gui.saveSelectToken('output', args.outputToken.address);
	await gui.saveSelectToken('input', args.inputToken.address);

	const periodInSeconds = getPeriodInSeconds(args.selectedPeriod, args.selectedPeriodUnit);
	gui.saveFieldValue('time-per-amount-epoch', periodInSeconds.toString());
	gui.saveFieldValue('time-per-trade-epoch', '3600');
	gui.saveFieldValue('next-trade-multiplier', '1.01');
	gui.saveFieldValue('next-trade-baseline-multiplier', '0');

	gui.saveFieldValue('amount-per-epoch', formatUnits(args.budgetAmount, args.outputToken.decimals));

	gui.saveFieldValue(
		'max-trade-amount',
		formatUnits(args.maxTradeAmount, args.outputToken.decimals)
	);

	gui.saveFieldValue(
		'min-trade-amount',
		formatUnits(args.minTradeAmount, args.outputToken.decimals)
	);

	gui.saveFieldValue('baseline', args.baseline);

	gui.saveFieldValue('initial-io', args.kickoff);

	gui.saveDeposit('output', formatUnits(args.depositAmount, args.outputToken.decimals));

	if (args.inputVaultId) {
		gui.setVaultId(true, 0, args.inputVaultId);
	}

	if (args.outputVaultId) {
		gui.setVaultId(false, 0, args.outputVaultId);
	}

	const $signerAddress = get(signerAddress);
	if (!$signerAddress) throw new Error('Signer address not found');

	const composedRainlangResult = await gui.getComposedRainlang();
	if (composedRainlangResult.error) throw new Error(composedRainlangResult.error.readableMsg);
	const composedRainlang = composedRainlangResult.value;

	const deploymentArgsResult = await gui.getDeploymentTransactionArgs($signerAddress);
	if (deploymentArgsResult.error) throw new Error(deploymentArgsResult.error.readableMsg);
	const deploymentArgs = deploymentArgsResult.value;

	return {
		composedRainlang,
		deploymentArgs
	};
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
	const limitStrategy = await (
		await fetch(
			'https://raw.githubusercontent.com/rainlanguage/rain.strategies/e9b2c5bf2ec6500f4def41b74653cdd998c26df5/src/fixed-limit.rain'
		)
	).text();
	const guiResult = await DotrainOrderGui.newWithDeployment(limitStrategy, TARGET_NETWORK);
	if (guiResult.error) throw new Error(guiResult.error.readableMsg);
	const gui = guiResult.value;

	await gui.saveSelectToken('token1', args.inputToken.address);
	await gui.saveSelectToken('token2', args.outputToken.address);

	// Save field values using the selected strategy parameters
	gui.saveFieldValue('fixed-io', args.ioRatio);

	gui.saveDeposit('token2', formatUnits(args.depositAmount, args.outputToken.decimals));

	if (args.inputVaultId) {
		gui.setVaultId(true, 0, args.inputVaultId);
	}

	if (args.outputVaultId) {
		gui.setVaultId(false, 0, args.outputVaultId);
	}

	const $signerAddress = get(signerAddress);
	if (!$signerAddress) throw new Error('Signer address not found');

	const composedRainlangResult = await gui.getComposedRainlang();
	if (composedRainlangResult.error) throw new Error(composedRainlangResult.error.readableMsg);
	const composedRainlang = composedRainlangResult.value;

	const deploymentArgsResult = await gui.getDeploymentTransactionArgs($signerAddress);
	if (deploymentArgsResult.error) throw new Error(deploymentArgsResult.error.readableMsg);
	const deploymentArgs = deploymentArgsResult.value;

	return {
		composedRainlang,
		deploymentArgs
	};
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
			'https://raw.githubusercontent.com/rainlanguage/rain.strategies/e9b2c5bf2ec6500f4def41b74653cdd998c26df5/src/dynamic-spread.rain'
		)
	).text();
	const guiResult = await DotrainOrderGui.newWithDeployment(dsfStrategy, TARGET_NETWORK);
	if (guiResult.error) throw new Error(guiResult.error.readableMsg);
	const gui = guiResult.value;

	await gui.saveSelectToken('token1', args.token1.address);
	await gui.saveSelectToken('token2', args.token2.address);

	// Save field values using the selected strategy parameters
	gui.saveFieldValue('amount-is-fast-exit', args.amountIsFastExit ? '1' : '0');

	gui.saveFieldValue('not-amount-is-fast-exit', args.notAmountIsFastExit ? '1' : '0');

	gui.saveFieldValue('initial-io', args.initialIo);

	gui.saveFieldValue('max-amount', formatUnits(args.maxAmount, args.token1.decimals));

	gui.saveFieldValue('min-amount', formatUnits(args.minAmount, args.token1.decimals));

	// Default Args
	gui.saveFieldValue('next-trade-multiplier', '1.01');
	gui.saveFieldValue('cost-basis-multiplier', '1');
	gui.saveFieldValue('time-per-epoch', '3600');

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

	const composedRainlangResult = await gui.getComposedRainlang();
	if (composedRainlangResult.error) throw new Error(composedRainlangResult.error.readableMsg);
	const composedRainlang = composedRainlangResult.value;

	const deploymentArgsResult = await gui.getDeploymentTransactionArgs($signerAddress);
	if (deploymentArgsResult.error) throw new Error(deploymentArgsResult.error.readableMsg);
	const deploymentArgs = deploymentArgsResult.value;

	return {
		composedRainlang,
		deploymentArgs
	};
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
			'https://raw.githubusercontent.com/rainlanguage/rain.strategies/6bb0e30cc5c5716a7860c6960b3cd924e3d80843/src/folio.rain'
		)
	).text();
	const guiResult = await DotrainOrderGui.newWithDeployment(folioStrategy, 'arbitrum');
	if (guiResult.error) throw new Error(guiResult.error.readableMsg);
	const gui = guiResult.value;

	await gui.saveSelectToken('token1', args.selectedToken1.address);
	await gui.saveSelectToken('token2', args.selectedToken2.address);
	await gui.saveSelectToken('token3', args.selectedToken3.address);
	await gui.saveSelectToken('token4', args.selectedToken4.address);
	await gui.saveSelectToken('token5', args.selectedToken5.address);
	await gui.saveSelectToken('token6', args.selectedToken6.address);
	await gui.saveSelectToken('token7', args.selectedToken7.address);

	if (args.overrideThreshold) {
		gui.saveFieldValue('threshold', args.overrideThreshold);
	} else {
		gui.saveFieldValue('threshold', '0.05');
	}

	if (args.overrideFee) {
		gui.saveFieldValue('fee', args.overrideFee);
	} else {
		gui.saveFieldValue('fee', '0.003');
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

	const composedRainlangResult = await gui.getComposedRainlang();
	if (composedRainlangResult.error) throw new Error(composedRainlangResult.error.readableMsg);
	const composedRainlang = composedRainlangResult.value;

	const deploymentArgsResult = await gui.getDeploymentTransactionArgs($signerAddress);
	if (deploymentArgsResult.error) throw new Error(deploymentArgsResult.error.readableMsg);
	const deploymentArgs = deploymentArgsResult.value;

	return {
		composedRainlang,
		deploymentArgs
	};
};
