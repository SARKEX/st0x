import { EvmToken } from 'sushi/evm';
import { formatUnits } from 'viem';
import { currentNetwork } from './stores';
import { get } from 'svelte/store';
import type { SwapResponse } from 'sushi/evm';

export const getPrice = async (baseToken: EvmToken, quoteToken: EvmToken): Promise<string> => {
	const network = get(currentNetwork);
	if (!network) {
		throw new Error('No active network configured');
	}
	const defaultPaymentToken = network.defaultPaymentToken ?? network.paymentTokens?.[0];
	if (!defaultPaymentToken) {
		throw new Error('No default payment token configured for current network');
	}
	if (
		baseToken.address.toLowerCase() === defaultPaymentToken.address.toLowerCase() &&
		quoteToken.address.toLowerCase() === defaultPaymentToken.address.toLowerCase()
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
		const amountIn = BigInt(data.amountIn) * BigInt(10 ** (18 - baseToken.decimals));
		const amountOut = BigInt(data.assumedAmountOut) * BigInt(10 ** (18 - quoteToken.decimals));
		const price = (amountOut * BigInt(10 ** 18)) / amountIn;

		// Guard rail: ensure price is never zero
		if (price === 0n) {
			throw new Error(
				`Price calculation resulted in zero for ${baseToken.symbol}/${quoteToken.symbol}. This may indicate insufficient liquidity or invalid token pair.`
			);
		}

		return formatUnits(price, 18);
	}

	throw new Error(`Swap API returned unsuccessful status: ${data.status}`);
};
