// Public API endpoint for aggregated 30-day trade activity across all networks.
// Pre-computes per-network totals and per-token breakdowns server-side so the
// platform-metrics page can render from a single cached response instead of
// 5k+ trades of client-side aggregation.
//
// Fetches from the st0x REST API per-token, then aggregates server-side.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import { withConditionalCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';
import { networks, TOKENS, CRYPTO_TOKENS } from '$lib/config/network';
import type { Network } from '$lib/config/network';
import { normalizeAddress } from '$lib/utils/tokenMath';
import { ensureServerTokenCatalog } from '$lib/server/tokenCatalog';
import { bucketTimestamp, TRADE_WINDOW_BUCKET_SECONDS } from '$lib/utils/timeWindow';
import { logQueryFailure, errorMessage } from '$lib/utils/monitoring';
import type { ApiTradeByAddress, ApiTradesByAddressResponse } from '$lib/api/st0xApi';

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

// ============================================================================
// Server-side REST API fetch (bypasses the browser-only proxy)
// ============================================================================

function getApiConfig(): { apiBase: string; authHeader: string } | null {
	const url = env.ST0X_API_URL;
	const key = env.ST0X_API_KEY;
	const secret = env.ST0X_API_SECRET;
	if (!url || !key || !secret) return null;
	return {
		apiBase: url.replace(/\/+$/, ''),
		authHeader: 'Basic ' + btoa(`${key}:${secret}`)
	};
}

async function fetchTradesForToken(
	apiBase: string,
	authHeader: string,
	tokenAddress: string,
	from: number,
	to: number
): Promise<ApiTradeByAddress[]> {
	const allTrades: ApiTradeByAddress[] = [];
	let page = 1;

	while (page <= 50) {
		const params = new URLSearchParams({
			page: String(page),
			pageSize: '200',
			startTime: String(from),
			endTime: String(to)
		});
		const url = `${apiBase}/v1/trades/token/${tokenAddress}?${params}`;
		const res = await fetch(url, {
			headers: { Authorization: authHeader, Accept: 'application/json' }
		});
		if (!res.ok) break;
		const data: ApiTradesByAddressResponse = await res.json();
		allTrades.push(...(data.trades ?? []));
		if (!data.pagination?.hasMore) break;
		page++;
	}

	return allTrades;
}

async function fetchNetworkTradesFromApi(
	network: Network,
	from: number,
	to: number
): Promise<ApiTradeByAddress[]> {
	const config = getApiConfig();
	if (!config) throw new Error('REST API not configured');

	const canonicalTokens = [...TOKENS, ...CRYPTO_TOKENS].filter(
		(t) => t.chainId === network.chainId
	);

	const results = await Promise.allSettled(
		canonicalTokens.map((token) =>
			fetchTradesForToken(config.apiBase, config.authHeader, token.address, from, to)
		)
	);

	// Dedup across tokens (same trade may appear for both input and output token queries)
	const seen = new Set<string>();
	const allTrades: ApiTradeByAddress[] = [];

	for (const result of results) {
		if (result.status !== 'fulfilled') continue;
		for (const trade of result.value) {
			const key = `${trade.txHash}-${trade.orderHash ?? ''}-${trade.inputToken.address}`;
			if (!seen.has(key)) {
				seen.add(key);
				allTrades.push(trade);
			}
		}
	}

	return allTrades;
}

// ============================================================================
// Trade analysis (simplified for REST API response format)
// ============================================================================

type AnalyzedApiTrade = {
	txHash: string;
	assetAddress: string;
	side: 'bid' | 'ask';
	tokens: number;
	quote: number;
};

function analyzeApiTrades(
	trades: ApiTradeByAddress[],
	quoteTokenAddress: string
): AnalyzedApiTrade[] {
	const quoteAddr = normalizeAddress(quoteTokenAddress);
	if (!quoteAddr) return [];

	const analyzed: AnalyzedApiTrade[] = [];

	for (const trade of trades) {
		const inputAddr = normalizeAddress(trade.inputToken.address);
		const outputAddr = normalizeAddress(trade.outputToken.address);
		if (!inputAddr || !outputAddr) continue;

		const inputAmount = Math.abs(parseFloat(trade.inputAmount));
		const outputAmount = Math.abs(parseFloat(trade.outputAmount));
		if (!Number.isFinite(inputAmount) || !Number.isFinite(outputAmount)) continue;
		if (inputAmount <= 0 || outputAmount <= 0) continue;

		let side: 'bid' | 'ask';
		let tokens: number;
		let quote: number;
		let assetAddress: string;

		if (inputAddr === quoteAddr) {
			// ASK: quote token goes in, asset comes out
			side = 'ask';
			tokens = outputAmount;
			quote = inputAmount;
			assetAddress = outputAddr;
		} else if (outputAddr === quoteAddr) {
			// BID: asset goes in, quote token comes out
			side = 'bid';
			tokens = inputAmount;
			quote = outputAmount;
			assetAddress = inputAddr;
		} else {
			continue;
		}

		analyzed.push({ txHash: trade.txHash, assetAddress, side, tokens, quote });
	}

	return analyzed;
}

function aggregateNetwork(network: Network, analyzed: AnalyzedApiTrade[]): NetworkTradeStats {
	const canonicalTokens = new Set<string>(
		[...TOKENS, ...CRYPTO_TOKENS]
			.filter((t) => t.chainId === network.chainId)
			.map((t) => normalizeAddress(t.address))
			.filter((addr): addr is string => Boolean(addr))
	);

	const seenTx = new Set<string>();
	let tradingVolume = 0;

	const rows = new Map<string, TokenTradingRow & { transactions: Set<string> }>();
	for (const token of [...TOKENS, ...CRYPTO_TOKENS].filter((t) => t.chainId === network.chainId)) {
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

	for (const entry of analyzed) {
		const addr = normalizeAddress(entry.assetAddress);
		if (!addr || !canonicalTokens.has(addr)) continue;

		const isNewTx = !entry.txHash || !seenTx.has(entry.txHash);
		if (entry.txHash) seenTx.add(entry.txHash);
		if (isNewTx) tradingVolume += entry.quote;

		const row = rows.get(addr);
		if (!row) continue;

		if (entry.side === 'bid') {
			row.inVolume += entry.tokens;
		} else if (entry.side === 'ask') {
			row.outVolume += entry.tokens;
		}
		row.totalVolume += entry.tokens;

		if (entry.txHash && !row.transactions.has(entry.txHash)) {
			row.transactions.add(entry.txHash);
			row.quoteVolume += entry.quote;
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
	// Bucket the window edge so the per-token upstream fan-out reuses one cache
	// key across recomputes instead of cache-busting on every second.
	const now = bucketTimestamp(Math.floor(Date.now() / 1000), TRADE_WINDOW_BUCKET_SECONDS);
	const from = now - WINDOW_SECONDS;

	const perNetwork = await Promise.all(
		networks.map(async (network) => {
			try {
				const trades = await fetchNetworkTradesFromApi(network, from, now);
				const quoteTokenAddress = network.defaultPaymentToken?.address;
				if (!quoteTokenAddress) return aggregateNetwork(network, []);
				const analyzed = analyzeApiTrades(trades, quoteTokenAddress);
				return aggregateNetwork(network, analyzed);
			} catch (error) {
				logQueryFailure({
					kind: 'public_endpoint_network_failed',
					endpoint: 'public-trade-activity',
					network: network.name,
					error: errorMessage(error)
				});
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
	await ensureServerTokenCatalog();
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
