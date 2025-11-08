import { EvmToken } from 'sushi/evm';
import { formatUnits } from 'viem';
import { currentNetwork } from './stores';
import { get } from 'svelte/store';
import type { SwapResponse } from 'sushi/evm';

export const getPrice = async (baseToken: EvmToken, quoteToken: EvmToken): Promise<string> => {
	const network = get(currentNetwork);
	const defaultSettlementToken = network.defaultSettlementToken;
	if (!defaultSettlementToken) {
		throw new Error('No default settlement token configured for current network');
	}
	if (
		baseToken.address.toLowerCase() === defaultSettlementToken.address.toLowerCase() &&
		quoteToken.address.toLowerCase() === defaultSettlementToken.address.toLowerCase()
	) {
		return '1';
	}
	const SWAP_API_URL = new URL(`https://api.sushi.com/swap/v7/${network.chainId}`);

	// Amount to swap (1 token with proper decimals)
	const amount = 10n ** BigInt(baseToken.decimals);

	// Max Slippage
	const maxSlippage = 0.005;

	// Sender (dummy address for price calculation)
	const sender = '0x0000000000000000000000000000000000000000';

	// Set query parameters
	const { searchParams } = SWAP_API_URL;
	searchParams.set('tokenIn', baseToken.address);
	searchParams.set('tokenOut', quoteToken.address);
	searchParams.set('amount', amount.toString());
	searchParams.set('maxSlippage', maxSlippage.toString());
	searchParams.set('sender', sender);

	// Make call to API
	const res = await fetch(SWAP_API_URL.toString());

	if (!res.ok) {
		throw new Error(`API request failed with status ${res.status}: ${res.statusText}`);
	}

	const data = (await res.json()) as SwapResponse;

	if (data.status === 'Success') {
		const amountIn = BigInt(data.amountIn);
		const amountOut = BigInt(data.assumedAmountOut);

		// Price = (amountOut / amountIn) * 10^(baseDecimals - quoteDecimals)
		// Both amountIn and amountOut are in wei
		const decimalDiff = baseToken.decimals - quoteToken.decimals;
		const scaleFactor = 10n ** BigInt(Math.abs(decimalDiff));

		let price: bigint;
		if (decimalDiff >= 0) {
			price = (amountOut * scaleFactor) / amountIn;
		} else {
			price = amountOut / (amountIn * scaleFactor);
		}

		// Guard rail: ensure price is never zero
		if (price === 0n) {
			throw new Error(
				`Price calculation resulted in zero for ${baseToken.symbol}/${quoteToken.symbol}. This may indicate insufficient liquidity or invalid token pair.`
			);
		}

		// Return as decimal string with appropriate precision
		return formatUnits(price, Math.abs(decimalDiff));
	}

	throw new Error(`Swap API returned unsuccessful status: ${data.status}`);
};
