// API endpoint to calculate TVL from snapshots
// TVL = sum of (balance / 1e18) * price for all wallets, all tokens
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kvGet, KV_KEYS, getExcludedWalletsSet, type SnapshotBlockRecord } from '$lib/server/kv';
import { list } from '@vercel/blob';
import type { BlockSnapshot } from '$lib/server/snapshots/types';
import { TOKENS } from '$lib/config/tokens';
import { env } from '$env/dynamic/private';

// Build token symbol map
const tokenSymbols = TOKENS.map((t) => t.symbol);

interface WalletTvlEntry {
	address: string;
	tvl: number;
	tokenBreakdown: Record<string, number>; // symbol -> TVL
	accessCode: string | null;
}

interface CodeTvlEntry {
	code: string;
	tvl: number;
	walletCount: number;
}

interface DailyTvlEntry {
	date: string; // YYYY-MM-DD
	timestamp: number;
	blockNumber: number;
	totalTvl: number;
	tokenTvl: Record<string, number>; // symbol -> TVL
	walletTvl: Record<string, number>; // wallet address -> TVL
	codeTvl: Record<string, number>; // code -> TVL
}

interface TvlResponse {
	success: boolean;
	latest: {
		timestamp: number;
		blockNumber: number;
		totalTvl: number;
		tokenTvl: Record<string, number>;
		walletTvl: WalletTvlEntry[];
		codeTvl: CodeTvlEntry[];
		walletCount: number;
	} | null;
	daily: DailyTvlEntry[];
	error?: string;
}

/**
 * Fetch all registered wallets and build wallet -> code mapping
 */
async function fetchWalletToCodeMapping(): Promise<Map<string, string>> {
	const walletToCode = new Map<string, string>();

	try {
		// Fetch all access codes
		const allCodes = (await kvGet<string[]>(KV_KEYS.allCodes())) || [];

		// Fetch wallets for each code
		for (const code of allCodes) {
			const walletAddresses = (await kvGet<string[]>(KV_KEYS.codeWallets(code))) || [];
			for (const address of walletAddresses) {
				walletToCode.set(address.toLowerCase(), code);
			}
		}
	} catch (error) {
		console.error('[TVL] Error fetching wallet-to-code mapping:', error);
	}

	return walletToCode;
}

/**
 * Fetch a snapshot from Vercel Blob
 */
async function fetchSnapshot(
	tokenSymbol: string,
	blockNumber: number
): Promise<BlockSnapshot | null> {
	// Check if Blob token is available (required for Vercel Blob storage)
	if (!env.BLOB_READ_WRITE_TOKEN) {
		return null;
	}

	try {
		const prefix = `snapshots/${tokenSymbol}/${blockNumber}.json`;
		const { blobs } = await list({ prefix, limit: 1, token: env.BLOB_READ_WRITE_TOKEN });

		if (blobs.length === 0) {
			return null;
		}

		const response = await fetch(blobs[0].url);
		if (!response.ok) {
			return null;
		}

		return await response.json();
	} catch (error) {
		console.error(`[TVL] Error fetching snapshot ${tokenSymbol}/${blockNumber}:`, error);
		return null;
	}
}

/**
 * Calculate detailed TVL from snapshots at a given block
 */
async function calculateDetailedTvlAtBlock(
	blockNumber: number,
	walletToCode: Map<string, string>,
	excludedWallets: Set<string>
): Promise<{
	totalTvl: number;
	tokenTvl: Record<string, number>;
	walletTvl: WalletTvlEntry[];
	codeTvl: CodeTvlEntry[];
	// Simplified maps for daily data
	walletTvlMap: Record<string, number>;
	codeTvlMap: Record<string, number>;
} | null> {
	const tokenTvl: Record<string, number> = {};
	const walletData = new Map<string, { tvl: number; tokenBreakdown: Record<string, number> }>();
	let totalTvl = 0;

	// Fetch all token snapshots in parallel
	const snapshotPromises = tokenSymbols.map((symbol) => fetchSnapshot(symbol, blockNumber));
	const snapshots = await Promise.all(snapshotPromises);

	for (let i = 0; i < snapshots.length; i++) {
		const snapshot = snapshots[i];
		const symbol = tokenSymbols[i];

		if (!snapshot) {
			tokenTvl[symbol] = 0;
			continue;
		}

		const price = snapshot.price?.price ?? 0;
		let tokenTotal = 0;

		// Sum all wallet balances * price
		for (const [walletAddress, balanceStr] of Object.entries(snapshot.balances)) {
			const balance = BigInt(balanceStr);
			if (balance <= 0n) continue;

			const address = walletAddress.toLowerCase();

			// Skip excluded wallets
			if (excludedWallets.has(address)) continue;

			const balanceFloat = Number(balance) / 1e18;
			const usdValue = balanceFloat * price;
			tokenTotal += usdValue;

			// Track per-wallet TVL
			if (!walletData.has(address)) {
				walletData.set(address, { tvl: 0, tokenBreakdown: {} });
			}
			const wallet = walletData.get(address)!;
			wallet.tvl += usdValue;
			wallet.tokenBreakdown[symbol] = (wallet.tokenBreakdown[symbol] || 0) + usdValue;
		}

		tokenTvl[symbol] = tokenTotal;
		totalTvl += tokenTotal;
	}

	// Build wallet TVL entries with access code info
	const walletTvl: WalletTvlEntry[] = [];
	const walletTvlMap: Record<string, number> = {};

	for (const [address, data] of walletData) {
		walletTvl.push({
			address,
			tvl: data.tvl,
			tokenBreakdown: data.tokenBreakdown,
			accessCode: walletToCode.get(address) || null
		});
		walletTvlMap[address] = data.tvl;
	}

	// Sort by TVL descending
	walletTvl.sort((a, b) => b.tvl - a.tvl);

	// Aggregate TVL by access code
	const codeAggregation = new Map<string, { tvl: number; walletCount: number }>();

	for (const wallet of walletTvl) {
		if (wallet.accessCode) {
			if (!codeAggregation.has(wallet.accessCode)) {
				codeAggregation.set(wallet.accessCode, { tvl: 0, walletCount: 0 });
			}
			const code = codeAggregation.get(wallet.accessCode)!;
			code.tvl += wallet.tvl;
			code.walletCount += 1;
		}
	}

	const codeTvl: CodeTvlEntry[] = [];
	const codeTvlMap: Record<string, number> = {};

	for (const [code, data] of codeAggregation) {
		codeTvl.push({
			code,
			tvl: data.tvl,
			walletCount: data.walletCount
		});
		codeTvlMap[code] = data.tvl;
	}

	// Sort by TVL descending
	codeTvl.sort((a, b) => b.tvl - a.tvl);

	return {
		totalTvl,
		tokenTvl,
		walletTvl,
		codeTvl,
		walletTvlMap,
		codeTvlMap
	};
}

/**
 * Simple TVL calculation for daily data (less detailed)
 */
async function calculateSimpleTvlAtBlock(
	blockNumber: number,
	walletToCode: Map<string, string>,
	excludedWallets: Set<string>
): Promise<{
	totalTvl: number;
	tokenTvl: Record<string, number>;
	walletTvl: Record<string, number>;
	codeTvl: Record<string, number>;
} | null> {
	const tokenTvl: Record<string, number> = {};
	const walletTvl: Record<string, number> = {};
	const codeTvl: Record<string, number> = {};
	let totalTvl = 0;

	// Fetch all token snapshots in parallel
	const snapshotPromises = tokenSymbols.map((symbol) => fetchSnapshot(symbol, blockNumber));
	const snapshots = await Promise.all(snapshotPromises);

	for (let i = 0; i < snapshots.length; i++) {
		const snapshot = snapshots[i];
		const symbol = tokenSymbols[i];

		if (!snapshot) {
			tokenTvl[symbol] = 0;
			continue;
		}

		const price = snapshot.price?.price ?? 0;
		let tokenTotal = 0;

		// Sum all wallet balances * price
		for (const [walletAddress, balanceStr] of Object.entries(snapshot.balances)) {
			const balance = BigInt(balanceStr);
			if (balance <= 0n) continue;

			const address = walletAddress.toLowerCase();

			// Skip excluded wallets
			if (excludedWallets.has(address)) continue;

			const balanceFloat = Number(balance) / 1e18;
			const usdValue = balanceFloat * price;
			tokenTotal += usdValue;

			// Track per-wallet TVL
			walletTvl[address] = (walletTvl[address] || 0) + usdValue;

			// Track per-code TVL
			const code = walletToCode.get(address);
			if (code) {
				codeTvl[code] = (codeTvl[code] || 0) + usdValue;
			}
		}

		tokenTvl[symbol] = tokenTotal;
		totalTvl += tokenTotal;
	}

	return {
		totalTvl,
		tokenTvl,
		walletTvl,
		codeTvl
	};
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const limitParam = url.searchParams.get('limit');
		const limit = limitParam ? parseInt(limitParam) : 90; // Default to 90 days

		// Get wallet-to-code mapping and excluded wallets
		const [walletToCode, excludedWallets] = await Promise.all([
			fetchWalletToCodeMapping(),
			getExcludedWalletsSet()
		]);

		// Get all snapshot block records
		const allBlocks = (await kvGet<SnapshotBlockRecord[]>(KV_KEYS.snapshotBlocks())) || [];

		if (allBlocks.length === 0) {
			return json({
				success: true,
				latest: null,
				daily: [],
				message: 'No snapshots found'
			} as TvlResponse);
		}

		// Sort by block number descending (most recent first)
		const sortedBlocks = [...allBlocks].sort((a, b) => b.blockNumber - a.blockNumber);

		// Group by date and get the last snapshot (highest block) for each day
		const blocksByDate = new Map<string, SnapshotBlockRecord>();
		for (const block of sortedBlocks) {
			if (!blocksByDate.has(block.date)) {
				blocksByDate.set(block.date, block);
			}
		}

		// Sort dates descending
		const sortedDates = Array.from(blocksByDate.keys()).sort().reverse();
		const limitedDates = sortedDates.slice(0, limit);

		// Calculate detailed TVL for the latest snapshot
		const latestBlock = sortedBlocks[0];
		const latestTvl = await calculateDetailedTvlAtBlock(
			latestBlock.blockNumber,
			walletToCode,
			excludedWallets
		);

		// Calculate TVL for each day (in parallel, but limit concurrency)
		const dailyTvl: DailyTvlEntry[] = [];

		// Process in batches of 5 to avoid overwhelming the blob storage
		const batchSize = 5;
		for (let i = 0; i < limitedDates.length; i += batchSize) {
			const batch = limitedDates.slice(i, i + batchSize);
			const batchResults = await Promise.all(
				batch.map(async (date) => {
					const block = blocksByDate.get(date)!;
					const tvl = await calculateSimpleTvlAtBlock(
						block.blockNumber,
						walletToCode,
						excludedWallets
					);

					if (tvl) {
						return {
							date,
							timestamp: block.timestamp,
							blockNumber: block.blockNumber,
							totalTvl: tvl.totalTvl,
							tokenTvl: tvl.tokenTvl,
							walletTvl: tvl.walletTvl,
							codeTvl: tvl.codeTvl
						};
					}
					return null;
				})
			);

			for (const result of batchResults) {
				if (result) {
					dailyTvl.push(result);
				}
			}
		}

		// Sort daily TVL by date ascending for charts
		dailyTvl.sort((a, b) => a.date.localeCompare(b.date));

		return json({
			success: true,
			latest: latestTvl
				? {
						timestamp: latestBlock.timestamp,
						blockNumber: latestBlock.blockNumber,
						totalTvl: latestTvl.totalTvl,
						tokenTvl: latestTvl.tokenTvl,
						walletTvl: latestTvl.walletTvl,
						codeTvl: latestTvl.codeTvl,
						walletCount: latestTvl.walletTvl.length
					}
				: null,
			daily: dailyTvl
		} as TvlResponse);
	} catch (error) {
		console.error('[TVL API] Error:', error);
		return json(
			{
				success: false,
				latest: null,
				daily: [],
				error: error instanceof Error ? error.message : 'Unknown error'
			} as TvlResponse,
			{ status: 500 }
		);
	}
};
