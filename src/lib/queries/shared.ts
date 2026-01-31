import type { Network } from '$lib/config/network';
import { TOKENS, CRYPTO_TOKENS } from '$lib/config/network';

export function tokensWithPriceFeed(network: Network | null) {
	if (!network) return [];
	const all = [...TOKENS, ...CRYPTO_TOKENS];
	return all.filter((token) => token.chainId === network.chainId && token.priceFeedId);
}
