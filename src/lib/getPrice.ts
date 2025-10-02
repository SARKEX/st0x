import { Token } from 'sushi';
import { ethers } from 'ethers';
import { getSwap } from 'sushi';
import { formatUnits } from 'viem';
import { currentNetwork } from './stores';
import { get } from 'svelte/store';

export const getPrice = async (baseToken: Token, quoteToken: Token): Promise<string> => {
	try {
		const network = get(currentNetwork);
		const usdcToken = network.usdcToken;
		if (
			baseToken.address.toLowerCase() === usdcToken.address.toLowerCase() &&
			quoteToken.address.toLowerCase() === usdcToken.address.toLowerCase()
		) {
			return '1';
		}
		const recipientAddress = ethers.Wallet.createRandom().address;
		const amountIn = 10n ** BigInt(baseToken.decimals);

		const data = await getSwap({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			chainId: network.chainId as any,
			tokenIn: baseToken.address as `0x${string}`,
			tokenOut: quoteToken.address as `0x${string}`,
			to: recipientAddress as `0x${string}`,
			amount: amountIn,
			maxSlippage: 0.005,
			includeTransaction: true
		});
		if (data.status === 'Success') {
			const amountIn = BigInt(data.amountIn) * BigInt(10 ** (18 - baseToken.decimals));
			const amountOut = BigInt(data.assumedAmountOut) * BigInt(10 ** (18 - quoteToken.decimals));
			const price = (amountOut * BigInt(10 ** 18)) / amountIn;
			return formatUnits(price, 18);
		}
		return '0';
	} catch {
		return '0';
	}
};
