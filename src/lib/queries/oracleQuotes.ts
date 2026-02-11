import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { TOKENS, CRYPTO_TOKENS } from '$lib/config/network';
import { getNetworkOracleSnapshots, type OracleSnapshot } from '$lib/api/pyth';

export interface OracleQuote {
	feedId: string;
	tokenAddress: string;
	price: number | null;
	confidence: number | null;
	publishTime: number | null;
}

function tokensWithPriceFeed(network: Network | null) {
	if (!network) return [];
	const all = [...TOKENS, ...CRYPTO_TOKENS];
	return all.filter((token) => token.chainId === network.chainId && token.priceFeedId);
}

export function createOracleQuotesQuery(network: Network | null) {
	return createQuery<Record<string, OracleQuote>>({
		queryKey: ['oracleQuotes', network?.id],
		enabled: Boolean(network),
		refetchInterval: 15_000,
		queryFn: async () => {
			const tokens = tokensWithPriceFeed(network);
			if (!tokens.length || !network) return {};
			const snapshots: OracleSnapshot[] = await getNetworkOracleSnapshots(tokens, network);
			const records: Record<string, OracleQuote> = {};
			snapshots.forEach((snapshot) => {
				const address = snapshot.token.address?.toLowerCase?.() ?? snapshot.feedId;
				records[address] = {
					feedId: snapshot.feedId,
					tokenAddress: snapshot.token.address,
					price: snapshot.price,
					confidence: snapshot.confidence,
					publishTime: snapshot.publishTime
				};
			});
			return records;
		}
	});
}
