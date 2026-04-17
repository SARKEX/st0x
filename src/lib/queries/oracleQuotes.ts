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

export function tokensWithPriceFeed(network: Network | null) {
	if (!network) return [];
	const all = [...TOKENS, ...CRYPTO_TOKENS];
	return all.filter((token) => token.chainId === network.chainId && token.priceFeedId);
}

/** Fetch SPYM price from the liquidity-monitor proxy endpoint. */
async function fetchSpymPrice(): Promise<{
	price: number | null;
	timestamp: number | null;
} | null> {
	try {
		const res = await fetch('/api/prices/spym');
		if (!res.ok) return null;
		const data = await res.json();
		return { price: data.price ?? null, timestamp: data.timestamp ?? null };
	} catch {
		return null;
	}
}

export function createOracleQuotesQuery(network: Network | null) {
	return createQuery<Record<string, OracleQuote>>({
		queryKey: ['oracleQuotes', network?.id],
		enabled: Boolean(network),
		refetchInterval: 15_000,
		queryFn: async () => {
			if (!network) return {};
			const tokens = tokensWithPriceFeed(network);
			const [snapshots, spymPrice] = await Promise.all([
				tokens.length ? getNetworkOracleSnapshots(tokens, network) : ([] as OracleSnapshot[]),
				fetchSpymPrice()
			]);
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

			// Merge SPYM from liquidity-monitor (no Pyth feed)
			if (spymPrice?.price != null) {
				const spymToken = TOKENS.find(
					(t) => t.symbol === 'wtSPYM' && t.chainId === network.chainId
				);
				if (spymToken) {
					const address = spymToken.address.toLowerCase();
					records[address] = {
						feedId: '',
						tokenAddress: spymToken.address,
						price: spymPrice.price,
						confidence: null,
						publishTime: spymPrice.timestamp
					};
				}
			}

			return records;
		}
	});
}
