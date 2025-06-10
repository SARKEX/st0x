import { Token } from 'sushi/currency';
import { ethers } from 'ethers';
import { EvmChainId, getSwap } from 'sushi';
import { formatUnits } from 'viem';

export const getPrice = async (baseToken: Token, quoteToken: Token): Promise<string> => {
	try {
		const recipientAddress = ethers.Wallet.createRandom().address;
		const amountIn = 10n ** BigInt(baseToken.decimals);

		const data = await getSwap({
			chainId: EvmChainId.ARBITRUM,
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
