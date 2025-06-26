import type { Token } from 'sushi/currency';
import { USDC_TOKEN } from './network';
import { getPrice } from './getPrice';
import { parseUnits } from 'viem';
import type { PythToken } from './types';

// Returns the period in seconds
export const getPeriodInSeconds = (
	period: string,
	periodUnit: 'Days' | 'Hours' | 'Minutes'
): number => {
	switch (periodUnit) {
		case 'Days':
			return Number(period) * 86400;
		case 'Hours':
			return Number(period) * 3600;
		case 'Minutes':
			return Number(period) * 60;
	}
};

// Returns 1/10 of the normalised daily amount
export const getMaxTradeAmount = (
	amount: bigint,
	period: string,
	periodUnit: 'Days' | 'Hours' | 'Minutes'
) => {
	const periodInSeconds = BigInt(getPeriodInSeconds(period, periodUnit));
	const normalisedDailyAmount = (amount * 8640n) / periodInSeconds;
	return normalisedDailyAmount;
};

export const getMinTradeAmount = async (amountToken: Token, minAmountInUSDC: bigint) => {
	if (USDC_TOKEN.address.toLowerCase() === amountToken.address.toLowerCase()) {
		return minAmountInUSDC;
	}
	const price = await getPrice(USDC_TOKEN, amountToken);
	const fp18Price =
		parseUnits(price, amountToken.decimals) * 10n ** (18n - BigInt(amountToken.decimals));
	const minAmountInUSDCFp18 = minAmountInUSDC * 10n ** (18n - BigInt(USDC_TOKEN.decimals));
	const minAmountFp18 = (minAmountInUSDCFp18 * fp18Price) / 10n ** 18n;
	const minAmountInAmountToken = minAmountFp18 / 10n ** (18n - BigInt(amountToken.decimals));

	return minAmountInAmountToken;
};

// Get baseline
export const getBaseline = (selectedBuyOrSell: 'Buy' | 'Sell', selectedBaseline: string) => {
	const finalBaseline =
		selectedBuyOrSell === 'Buy' ? (1 / +selectedBaseline).toString() : selectedBaseline;
	return finalBaseline;
};
export const hasValidPriceFeedId = (token: Token): token is PythToken => {
	return (
		'priceFeedId' in token &&
		token.priceFeedId !== '0x0000000000000000000000000000000000000000000000000000000000000000'
	);
};
