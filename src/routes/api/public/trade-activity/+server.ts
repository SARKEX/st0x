// Public API endpoint for aggregated 30-day trade activity across all networks.
// Pre-computes per-network totals and per-token breakdowns server-side so the
// platform-metrics page can render from a single cached response instead of
// 5k+ trades of client-side aggregation (which was failing on cold loads when
// Goldsky rate-limited the subgraph).
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import { withConditionalCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';
import { networks, getAllTokensByNetwork, TOKENS, CRYPTO_TOKENS } from '$lib/config/network';
import type { Network, CategorizedToken } from '$lib/config/network';
import { getTrades } from '$lib/api/subgraph';
import {
	analyzeTrade,
	createTokenLookup,
	normalizeAddress,
	type TradeAnalysis,
	type TokenLookup
} from '$lib/utils/tokenMath';
import { logQueryFailure, errorMessage } from '$lib/utils/monitoring';
import type { SgTrade } from '@rainlanguage/orderbook';

const WINDOW_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface TokenTradingRow {
	address: string;
	symbol?: string;
	name?: string;
	logoUrl?: string;
	inVolume: number;
	outVolume: number;
	totalVolume: number;
	quoteVolume: number;
	trades: number;
}

export interface NetworkTradeStats {
	chainId: number;
	networkId: number;
	tradingVolume: number;
	totalTrades: number;
	tokens: TokenTradingRow[];
}

export interface PublicTradeActivityResponse {
	success: boolean;
	range: { from: number; to: number };
	totals: {
		tradingVolume: number;
		totalTrades: number;
	};
	networks: NetworkTradeStats[];
}

type AnalyzedTrade = {
	trade: SgTrade;
	analysis: TradeAnalysis;
};

function analyzeNetworkTrades(
	trades: SgTrade[],
	network: Network,
	lookup: TokenLookup<CategorizedToken>
): AnalyzedTrade[] {
	const analyzed: AnalyzedTrade[] = [];
	for (const trade of trades) {
		const analysis = analyzeTrade(
			trade as unknown as Parameters<typeof analyzeTrade>[0],
			network.defaultPaymentToken,
			lookup
		);
		if (analysis) {
			analyzed.push({ trade, analysis });
		}
	}
	return analyzed;
}

function aggregateNetwork(
	network: Network,
	analyzed: AnalyzedTrade[]
): NetworkTradeStats {
	const canonicalTokens = new Set<string>(
		[...TOKENS, ...CRYPTO_TOKENS]
			.filter((t) => t.chainId === network.chainId)
			.map((t) => normalizeAddress(t.address))
			.filter((addr): addr is string => Boolean(addr))
	);

	// Per-network dedup across trades (dedup key = txId)
	const seenTx = new Set<string>();
	let tradingVolume = 0;

	// Pre-initialize aggregation rows for every canonical token on this network
	const rows = new Map<
		string,
		TokenTradingRow & { transactions: Set<string> }
	>();
	for (const token of [...TOKENS, ...CRYPTO_TOKENS].filter(
		(t) => t.chainId === network.chainId
	)) {
		const addr = normalizeAddress(token.address);
		if (!addr) continue;
		rows.set(addr, {
			address: addr,
			symbol: token.symbol,
			name: token.name,
			logoUrl: token.logoUrl,
			inVolume: 0,
			outVolume: 0,
			totalVolume: 0,
			quoteVolume: 0,
			trades: 0,
			transactions: new Set<string>()
		});
	}

	for (const { trade, analysis } of analyzed) {
		const addr = normalizeAddress(analysis.assetAddress);
		// Filter to canonical tokens only - matches client-side activeTokensByNetwork logic
		if (!addr || !canonicalTokens.has(addr)) continue;

		const txId = trade.tradeEvent?.transaction?.id ?? trade.id;
		const isNewTx = !txId || !seenTx.has(txId);
		if (txId) seenTx.add(txId);
		if (isNewTx) tradingVolume += analysis.quote;

		const row = rows.get(addr);
		if (!row) continue;

		if (analysis.side === 'bid') {
			row.inVolume += analysis.tokens;
		} else if (analysis.side === 'ask') {
			row.outVolume += analysis.tokens;
		}
		row.totalVolume += analysis.tokens;

		if (txId && !row.transactions.has(txId)) {
			row.transactions.add(txId);
			row.quoteVolume += analysis.quote;
		}
	}

	const tokens: TokenTradingRow[] = Array.from(rows.values())
		.map(({ transactions, ...rest }) => ({
			...rest,
			trades: transactions.size
		}))
		.sort((a, b) => b.trades - a.trades);

	return {
		chainId: network.chainId,
		networkId: network.id,
		tradingVolume,
		totalTrades: seenTx.size,
		tokens
	};
}

async function computeTradeActivity(): Promise<PublicTradeActivityResponse> {
	const now = Math.floor(Date.now() / 1000);
	const from = now - WINDOW_SECONDS;

	const perNetwork = await Promise.all(
		networks.map(async (network) => {
			try {
				const trades = await getTrades(from, now, network, true);
				const lookup = createTokenLookup<CategorizedToken>(
					getAllTokensByNetwork(network.chainId)
				);
				const analyzed = analyzeNetworkTrades(trades, network, lookup);
				return aggregateNetwork(network, analyzed);
			} catch (error) {
				logQueryFailure({
					kind: 'public_endpoint_network_failed',
					endpoint: 'public-trade-activity',
					network: network.name,
					error: errorMessage(error)
				});
				// Partial results: return an empty per-network entry so other networks are still served
				return aggregateNetwork(network, []);
			}
		})
	);

	const totalVolume = perNetwork.reduce((sum, n) => sum + n.tradingVolume, 0);
	const totalTrades = perNetwork.reduce((sum, n) => sum + n.totalTrades, 0);

	return {
		success: true,
		range: { from, to: now },
		totals: {
			tradingVolume: totalVolume,
			totalTrades
		},
		networks: perNetwork
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const clientIp = getClientIp(request);
	const rateLimit = await rateLimiters.publicApi(`public-api:${clientIp}`);

	if (!rateLimit.allowed) {
		return json(
			{ success: false, error: 'Rate limit exceeded. Please try again later.' },
			{
				status: 429,
				headers: {
					'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
					'X-RateLimit-Remaining': String(rateLimit.remaining),
					'X-RateLimit-Reset': String(rateLimit.resetAt)
				}
			}
		);
	}

	try {
		const data = await withConditionalCache<PublicTradeActivityResponse>(
			CACHE_KEYS.publicTradeActivity(),
			computeTradeActivity,
			// Only cache when we got real data - prevents poisoning the cache
			// with zero values from a transient subgraph outage
			(result) => result.success && result.totals.tradingVolume > 0,
			CACHE_TTL.LONG
		);

		return json(data, {
			headers: {
				'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
			}
		});
	} catch (error) {
		console.error('[Public TradeActivity] Error:', error);
		const now = Math.floor(Date.now() / 1000);
		return json(
			{
				success: false,
				range: { from: now - WINDOW_SECONDS, to: now },
				totals: { tradingVolume: 0, totalTrades: 0 },
				networks: []
			} satisfies PublicTradeActivityResponse,
			{ status: 500 }
		);
	}
};
