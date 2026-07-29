import type { ApiTradeByAddress } from '$lib/api/st0xApi';
import type { Network } from '$lib/config/network';
import { networks } from '$lib/config/network';
import { getAllTokensByNetwork } from '$lib/config/tokens';
import type { ServerTradesQueryFetcher } from '$lib/server/st0xTradesFetcher';
import { normalizeAddress } from '$lib/utils/tokenMath';
import { bucketTimestamp, TRADE_WINDOW_BUCKET_SECONDS } from '$lib/utils/timeWindow';

const WINDOW_SECONDS = 30 * 24 * 60 * 60;
const PAGE_SIZE = 500;
const MAX_PAGES = 1_000;
export const PUBLIC_TRADE_ACTIVITY_REFRESH_TIMEOUT_MS = 90_000;

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

interface PublicTradeActivityBase {
	range: { from: number; to: number };
	totals: {
		tradingVolume: number;
		totalTrades: number;
	};
	networks: NetworkTradeStats[];
}

export interface PublicTradeActivitySnapshot extends PublicTradeActivityBase {
	success: true;
}

export interface PublicTradeActivityFailure extends PublicTradeActivityBase {
	success: false;
}

export type PublicTradeActivityResponse = PublicTradeActivitySnapshot | PublicTradeActivityFailure;

type AnalyzedApiTrade = {
	txHash: string;
	assetAddress: string;
	side: 'bid' | 'ask';
	tokens: number;
	quote: number;
};

export function tradeActivityWindow(epochSeconds: number): { from: number; to: number } {
	const to = bucketTimestamp(epochSeconds, TRADE_WINDOW_BUCKET_SECONDS);
	return { from: to - WINDOW_SECONDS, to };
}

function networkTokenAddresses(network: Network): string[] {
	const paymentTokenAddress = normalizeAddress(network.defaultPaymentToken?.address ?? '');
	return Array.from(
		new Set(
			getAllTokensByNetwork(network.chainId)
				.map((token) => normalizeAddress(token.address))
				.filter((address): address is string => Boolean(address))
				.filter((address) => address !== paymentTokenAddress)
		)
	).sort();
}

export async function fetchNetworkTrades(
	network: Network,
	range: { from: number; to: number },
	fetchPage: ServerTradesQueryFetcher
): Promise<ApiTradeByAddress[]> {
	const tokenAddresses = networkTokenAddresses(network);
	if (tokenAddresses.length === 0) return [];

	const trades: ApiTradeByAddress[] = [];
	let page = 1;
	let hasMore = true;
	while (hasMore && page <= MAX_PAGES) {
		const response = await fetchPage({
			chainId: network.chainId,
			tokenAddresses,
			startTime: range.from,
			endTime: range.to,
			page,
			pageSize: PAGE_SIZE,
			denomination: 'wrapped'
		});
		trades.push(...response.trades);
		hasMore = response.pagination.hasMore;
		page++;
	}
	if (hasMore) {
		throw new Error(`Batch trades pagination exceeded ${MAX_PAGES} pages`);
	}
	return trades;
}

export function analyzeApiTrades(
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

		const inputAmount = Math.abs(Number.parseFloat(trade.inputAmount));
		const outputAmount = Math.abs(Number.parseFloat(trade.outputAmount));
		if (!Number.isFinite(inputAmount) || !Number.isFinite(outputAmount)) continue;
		if (inputAmount <= 0 || outputAmount <= 0) continue;

		if (inputAddr === quoteAddr) {
			analyzed.push({
				txHash: trade.txHash,
				assetAddress: outputAddr,
				side: 'ask',
				tokens: outputAmount,
				quote: inputAmount
			});
		} else if (outputAddr === quoteAddr) {
			analyzed.push({
				txHash: trade.txHash,
				assetAddress: inputAddr,
				side: 'bid',
				tokens: inputAmount,
				quote: outputAmount
			});
		}
	}
	return analyzed;
}

export function aggregateNetwork(
	network: Network,
	analyzed: AnalyzedApiTrade[]
): NetworkTradeStats {
	const networkTokens = getAllTokensByNetwork(network.chainId);
	const seenTx = new Set<string>();
	let tradingVolume = 0;

	type TokenTradingAccumulator = Omit<TokenTradingRow, 'trades'> & {
		transactions: Set<string>;
	};
	const rows = new Map<string, TokenTradingAccumulator>();
	for (const token of networkTokens) {
		const address = normalizeAddress(token.address);
		if (!address) continue;
		rows.set(address, {
			address,
			symbol: token.symbol,
			name: token.name,
			logoUrl: token.logoUrl,
			inVolume: 0,
			outVolume: 0,
			totalVolume: 0,
			quoteVolume: 0,
			transactions: new Set<string>()
		});
	}

	for (const entry of analyzed) {
		const address = normalizeAddress(entry.assetAddress);
		if (!address) continue;
		const row = rows.get(address);
		if (!row) continue;

		const isNewTx = !entry.txHash || !seenTx.has(entry.txHash);
		if (entry.txHash) seenTx.add(entry.txHash);
		if (isNewTx) tradingVolume += entry.quote;

		if (entry.side === 'bid') row.inVolume += entry.tokens;
		else row.outVolume += entry.tokens;
		row.totalVolume += entry.tokens;

		if (entry.txHash && !row.transactions.has(entry.txHash)) {
			row.transactions.add(entry.txHash);
			row.quoteVolume += entry.quote;
		}
	}

	const tokens = Array.from(rows.values())
		.map(({ transactions, ...row }) => ({ ...row, trades: transactions.size }))
		.sort((a, b) => b.trades - a.trades || a.address.localeCompare(b.address));

	return {
		chainId: network.chainId,
		networkId: network.id,
		tradingVolume,
		totalTrades: seenTx.size,
		tokens
	};
}

export async function computePublicTradeActivity(
	fetchPage: ServerTradesQueryFetcher,
	epochSeconds = Math.floor(Date.now() / 1000),
	configuredNetworks: Network[] = networks
): Promise<PublicTradeActivitySnapshot> {
	const range = tradeActivityWindow(epochSeconds);
	const perNetwork = await Promise.all(
		configuredNetworks.map(async (network) => {
			const trades = await fetchNetworkTrades(network, range, fetchPage);
			const quoteTokenAddress = network.defaultPaymentToken?.address;
			if (!quoteTokenAddress) return aggregateNetwork(network, []);
			return aggregateNetwork(network, analyzeApiTrades(trades, quoteTokenAddress));
		})
	);

	return {
		success: true,
		range,
		totals: {
			tradingVolume: perNetwork.reduce((sum, network) => sum + network.tradingVolume, 0),
			totalTrades: perNetwork.reduce((sum, network) => sum + network.totalTrades, 0)
		},
		networks: perNetwork
	};
}
