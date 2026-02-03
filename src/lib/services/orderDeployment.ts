/**
 * Order Deployment Service
 *
 * Business logic for building order deployment arguments.
 * Transforms user inputs into Rain strategy deployment parameters.
 *
 * This service layer:
 * - Fetches Rain strategies from GitHub (with caching)
 * - Configures DotrainOrderGui with user inputs
 * - Generates deployment transaction arguments
 * - Does NOT import from stores (accepts parameters instead)
 */

import { get } from 'svelte/store';
import { DotrainOrderGui } from '@rainlanguage/orderbook';
import type { Token } from '$lib/types';
import type { Network } from '$lib/config/network';
import type { Hex } from 'viem';
import { formatUnits } from 'viem';
import { getPeriodInSeconds } from '$lib/utils/derivations';
import { DotrainRegistry } from '@rainlanguage/orderbook';
import { walletAddress } from '$lib/stores/authStore';

/** Registry URL for rain.strategies (order definitions + shared settings). */
const REGISTRY_URL =
	'https://raw.githubusercontent.com/rainlanguage/rain.strategies/54af971b68ec7685eb19aff3d6e9dd174b199a58/registry';

/** Maps app network slug to the deployment key in rain.strategies registry. */
function getDeploymentKey(raindexNetworkSlug: string): string {
	switch (raindexNetworkSlug) {
		case 'base':
			return 'base';
		case 'polygon':
			return 'polygon';
		case 'arbitrum':
			return 'fixed-limit-arbitrum';
		default:
			return raindexNetworkSlug;
	}
}

/**
 * Loads the registry and returns a DotrainOrderGui for the given order and network.
 * Use this for all order types so strategy and settings stay in sync with the registry.
 */
async function getGuiFromRegistry(orderKey: string, raindexNetworkSlug: string) {
	const registryResult = await DotrainRegistry.new(REGISTRY_URL);
	if (registryResult.error) throw new Error(registryResult.error.readableMsg);
	const deploymentKey = getDeploymentKey(raindexNetworkSlug);
	const guiResult = await registryResult.value.getGui(orderKey, deploymentKey);
	if (guiResult.error) throw new Error(guiResult.error.readableMsg);
	return guiResult.value;
}

// Default input vault ID for DCA and limit orders (32 bytes, padded)
// Using a simple constant allows multiple orders to share the same input vault
export const DEFAULT_INPUT_VAULT_ID: Hex =
	'0x0000000000000000000000000000000000000000000000000000000000000001';

/**
 * Generates a sequential vault ID (32 bytes, padded)
 * @param n - The vault number (1, 2, 3, etc.)
 * @returns Hex string padded to 32 bytes
 */
export function getSequentialVaultId(n: number): Hex {
	return `0x${n.toString(16).padStart(64, '0')}` as Hex;
}

/**
 * Parses a vault ID to extract its sequential number if it's a sequential vault
 * Returns undefined if not a sequential vault (e.g., random vault ID)
 * @param vaultId - The vault ID (can be bigint or hex string)
 */
export function parseSequentialVaultNumber(vaultId: bigint | string): number | undefined {
	const num = typeof vaultId === 'bigint' ? vaultId : BigInt(vaultId);
	// Only consider it sequential if it's a reasonable number (< 1000)
	if (num > 0n && num < 1000n) {
		return Number(num);
	}
	return undefined;
}


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
	depositAmount: bigint;
	inputVaultId?: Hex; // Optional override for input vault (defaults to DEFAULT_INPUT_VAULT_ID)
};

export const getDcaDeploymentArgs = async (network: Network, args: DcaDeploymentArgs) => {
	const gui = await getGuiFromRegistry('auction-dca', network.raindexNetworkSlug);

	await gui.setSelectToken('output', args.outputToken.address);
	await gui.setSelectToken('input', args.inputToken.address);

	const periodInSeconds = getPeriodInSeconds(args.selectedPeriod, args.selectedPeriodUnit);
	gui.setFieldValue('time-per-amount-epoch', periodInSeconds.toString());
	gui.setFieldValue('time-per-trade-epoch', '3600');
	gui.setFieldValue('next-trade-multiplier', '1.01');
	gui.setFieldValue('next-trade-baseline-multiplier', '0');

	gui.setFieldValue('amount-per-epoch', formatUnits(args.budgetAmount, args.outputToken.decimals));

	gui.setFieldValue(
		'max-trade-amount',
		formatUnits(args.maxTradeAmount, args.outputToken.decimals)
	);

	gui.setFieldValue(
		'min-trade-amount',
		formatUnits(args.minTradeAmount, args.outputToken.decimals)
	);

	gui.setFieldValue('baseline', args.baseline);

	gui.setFieldValue('initial-io', args.kickoff);

	gui.setDeposit('output', formatUnits(args.depositAmount, args.outputToken.decimals));

	const $walletAddress = get(walletAddress);
	if (!$walletAddress) throw new Error('Wallet address not found');

	// DCA vault management:
	// - Input vault: Use provided vault ID if specified, otherwise let system generate random
	// - Output vault: Always let system generate random (unique per order)
	if (args.inputVaultId) {
		gui.setVaultId('input', 'input', args.inputVaultId);
	}

	const composedRainlangResult = await gui.getComposedRainlang();
	if (composedRainlangResult.error) throw new Error(composedRainlangResult.error.readableMsg);
	const composedRainlang = composedRainlangResult.value;

	const deploymentArgsResult = await gui.getDeploymentTransactionArgs($walletAddress);
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
	inputVaultId?: Hex; // Optional override for input vault (defaults to DEFAULT_INPUT_VAULT_ID)
};

export const getLimitOrderDeploymentArgs = async (
	network: Network,
	args: LimitOrderDeploymentArgs
) => {
	const gui = await getGuiFromRegistry('fixed-limit', network.raindexNetworkSlug);

	await gui.setSelectToken('token1', args.inputToken.address);
	await gui.setSelectToken('token2', args.outputToken.address);

	// Save field values using the selected strategy parameters
	gui.setFieldValue('fixed-io', args.ioRatio);

	gui.setDeposit('token2', formatUnits(args.depositAmount, args.outputToken.decimals));

	const $walletAddress = get(walletAddress);
	if (!$walletAddress) throw new Error('Wallet address not found');

	// Limit order vault management:
	// - Input vault: Use provided vault ID if specified, otherwise let system generate random
	// - Output vault: Always let system generate random (unique per order)
	if (args.inputVaultId) {
		gui.setVaultId('input', 'token1', args.inputVaultId);
	}

	const composedRainlangResult = await gui.getComposedRainlang();
	if (composedRainlangResult.error) throw new Error(composedRainlangResult.error.readableMsg);
	const composedRainlang = composedRainlangResult.value;

	const deploymentArgsResult = await gui.getDeploymentTransactionArgs($walletAddress);
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

export const getMarketMakingDeploymentArgs = async (
	network: Network,
	args: MarketMakingDeploymentArgs
) => {
	const gui = await getGuiFromRegistry('dynamic-spread', network.raindexNetworkSlug);

	await gui.setSelectToken('token1', args.token1.address);
	await gui.setSelectToken('token2', args.token2.address);

	// Save field values using the selected strategy parameters
	gui.setFieldValue('amount-is-fast-exit', args.amountIsFastExit ? '1' : '0');

	gui.setFieldValue('not-amount-is-fast-exit', args.notAmountIsFastExit ? '1' : '0');

	gui.setFieldValue('initial-io', args.initialIo);

	gui.setFieldValue('max-amount', formatUnits(args.maxAmount, args.token1.decimals));

	gui.setFieldValue('min-amount', formatUnits(args.minAmount, args.token1.decimals));

	// Default Args
	gui.setFieldValue('next-trade-multiplier', '1.01');
	gui.setFieldValue('cost-basis-multiplier', '1');
	gui.setFieldValue('time-per-epoch', '3600');

	gui.setDeposit('token1', formatUnits(args.depositAmountToken1, args.token1.decimals));
	gui.setDeposit('token2', formatUnits(args.depositAmountToken2, args.token2.decimals));

	const $walletAddress = get(walletAddress);
	if (!$walletAddress) throw new Error('Wallet address not found');

	if (args.inputVaultIdToken1) {
		gui.setVaultId('input', 'token1', args.inputVaultIdToken1);
	}
	if (args.inputVaultIdToken2) {
		gui.setVaultId('input', 'token2', args.inputVaultIdToken2);
	}
	if (args.outputVaultIdToken1) {
		gui.setVaultId('output', 'token1', args.outputVaultIdToken1);
	}
	if (args.outputVaultIdToken2) {
		gui.setVaultId('output', 'token2', args.outputVaultIdToken2);
	}

	const composedRainlangResult = await gui.getComposedRainlang();
	if (composedRainlangResult.error) throw new Error(composedRainlangResult.error.readableMsg);
	const composedRainlang = composedRainlangResult.value;

	const deploymentArgsResult = await gui.getDeploymentTransactionArgs($walletAddress);
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

export const getFolioDeploymentArgs = async (network: Network, args: FolioDeploymentArgs) => {
	const gui = await getGuiFromRegistry('folio', network.raindexNetworkSlug);

	await gui.setSelectToken('token1', args.selectedToken1.address);
	await gui.setSelectToken('token2', args.selectedToken2.address);
	await gui.setSelectToken('token3', args.selectedToken3.address);
	await gui.setSelectToken('token4', args.selectedToken4.address);
	await gui.setSelectToken('token5', args.selectedToken5.address);
	await gui.setSelectToken('token6', args.selectedToken6.address);
	await gui.setSelectToken('token7', args.selectedToken7.address);

	if (args.overrideThreshold) {
		gui.setFieldValue('threshold', args.overrideThreshold);
	} else {
		gui.setFieldValue('threshold', '0.05');
	}

	if (args.overrideFee) {
		gui.setFieldValue('fee', args.overrideFee);
	} else {
		gui.setFieldValue('fee', '0.003');
	}

	gui.setDeposit('token1', formatUnits(args.depositAmount1, args.selectedToken1.decimals));
	gui.setDeposit('token2', formatUnits(args.depositAmount2, args.selectedToken2.decimals));
	gui.setDeposit('token3', formatUnits(args.depositAmount3, args.selectedToken3.decimals));
	gui.setDeposit('token4', formatUnits(args.depositAmount4, args.selectedToken4.decimals));
	gui.setDeposit('token5', formatUnits(args.depositAmount5, args.selectedToken5.decimals));
	gui.setDeposit('token6', formatUnits(args.depositAmount6, args.selectedToken6.decimals));
	gui.setDeposit('token7', formatUnits(args.depositAmount7, args.selectedToken7.decimals));

	const $walletAddress = get(walletAddress);
	if (!$walletAddress) throw new Error('Wallet address not found');

	if (args.inputVaultId1) {
		gui.setVaultId('input', 'token1', args.inputVaultId1);
	}

	if (args.inputVaultId2) {
		gui.setVaultId('input', 'token2', args.inputVaultId2);
	}

	if (args.inputVaultId3) {
		gui.setVaultId('input', 'token3', args.inputVaultId3);
	}

	if (args.inputVaultId4) {
		gui.setVaultId('input', 'token4', args.inputVaultId4);
	}

	if (args.inputVaultId5) {
		gui.setVaultId('input', 'token5', args.inputVaultId5);
	}

	if (args.inputVaultId6) {
		gui.setVaultId('input', 'token6', args.inputVaultId6);
	}

	if (args.inputVaultId7) {
		gui.setVaultId('input', 'token7', args.inputVaultId7);
	}

	if (args.outputVaultId1) {
		gui.setVaultId('output', 'token1', args.outputVaultId1);
	}

	if (args.outputVaultId2) {
		gui.setVaultId('output', 'token2', args.outputVaultId2);
	}

	if (args.outputVaultId3) {
		gui.setVaultId('output', 'token3', args.outputVaultId3);
	}

	if (args.outputVaultId4) {
		gui.setVaultId('output', 'token4', args.outputVaultId4);
	}

	if (args.outputVaultId5) {
		gui.setVaultId('output', 'token5', args.outputVaultId5);
	}

	if (args.outputVaultId6) {
		gui.setVaultId('output', 'token6', args.outputVaultId6);
	}

	if (args.outputVaultId7) {
		gui.setVaultId('output', 'token7', args.outputVaultId7);
	}

	const composedRainlangResult = await gui.getComposedRainlang();
	if (composedRainlangResult.error) throw new Error(composedRainlangResult.error.readableMsg);
	const composedRainlang = composedRainlangResult.value;

	const deploymentArgsResult = await gui.getDeploymentTransactionArgs($walletAddress);
	if (deploymentArgsResult.error) throw new Error(deploymentArgsResult.error.readableMsg);
	const deploymentArgs = deploymentArgsResult.value;

	return {
		composedRainlang,
		deploymentArgs
	};
};
