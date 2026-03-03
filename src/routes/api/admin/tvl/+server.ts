// API endpoint to calculate TVL from snapshots
// TVL = sum of (balance / 1e18) * price for all wallets, all tokens
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	kvGet,
	getKv,
	KV_KEYS,
	getExcludedWalletsSet,
	getTeamWalletsSet,
	getPoolWalletsSet,
	type SnapshotBlockRecord
} from '$lib/server/kv';
import { list } from '@vercel/blob';
import type { BlockSnapshot } from '$lib/server/snapshots/types';
import { TOKENS } from '$lib/config/tokens';
import { env } from '$env/dynamic/private';
import { requireAdmin } from '$lib/server/adminAuth';

// Build token symbol map with fallback names for renamed tokens
const tokenSymbols = TOKENS.map((t) => t.symbol);
const previousSymbolsByToken = new Map<string, string[]>(
	TOKENS.filter((t) => t.previousSymbols?.length).map((t) => [t.symbol, t.previousSymbols!])
);

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
	totalTvl: number; // All wallets
	eligibleTvl: number; // Excluding excluded wallets
	tvlExcludingTeam: number; // Excluding both excluded and team wallets
	tokenTvl: Record<string, number>; // symbol -> TVL
	walletTvl: Record<string, number>; // wallet address -> TVL
	codeTvl: Record<string, number>; // code -> TVL
}

interface TvlResponse {
	success: boolean;
	latest: {
		timestamp: number;
		blockNumber: number;
		totalTvl: number; // All wallets including excluded
		eligibleTvl: number; // Excluding excluded wallets
		tvlExcludingTeam: number; // Excluding both excluded wallets AND team wallets
		tokenTvl: Record<string, number>;
		walletTvl: WalletTvlEntry[];
		codeTvl: CodeTvlEntry[];
		walletCount: number;
		excludedWalletCount: number;
		teamWalletCount: number;
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

		// Fetch wallets for all codes in parallel
		const walletArrays = await Promise.all(
			allCodes.map(async (code) => {
				const walletAddresses = (await kvGet<string[]>(KV_KEYS.codeWallets(code))) || [];
				return { code, walletAddresses };
			})
		);
		for (const { code, walletAddresses } of walletArrays) {
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

	// Try the current symbol first, then fall back to previous symbol names
	const candidates = [tokenSymbol, ...(previousSymbolsByToken.get(tokenSymbol) ?? [])];

	for (const symbol of candidates) {
		try {
			const prefix = `snapshots/${symbol}/${blockNumber}.json`;
			const { blobs } = await list({ prefix, limit: 1, token: env.BLOB_READ_WRITE_TOKEN });

			if (blobs.length === 0) continue;

			const response = await fetch(blobs[0].url);
			if (!response.ok) continue;

			return await response.json();
		} catch (error) {
			console.error(`[TVL] Error fetching snapshot ${symbol}/${blockNumber}:`, error);
		}
	}

	return null;
}

/**
 * Calculate detailed TVL from snapshots at a given block
 */
async function calculateDetailedTvlAtBlock(
	blockNumber: number,
	walletToCode: Map<string, string>,
	excludedWallets: Set<string>,
	teamWallets: Set<string>
): Promise<{
	totalTvl: number; // All wallets including excluded
	eligibleTvl: number; // Excluding excluded wallets
	tvlExcludingTeam: number; // Excluding both excluded wallets AND team wallets
	tokenTvl: Record<string, number>;
	walletTvl: WalletTvlEntry[];
	codeTvl: CodeTvlEntry[];
	walletTvlMap: Record<string, number>;
	codeTvlMap: Record<string, number>;
	excludedWalletCount: number;
	teamWalletCount: number;
} | null> {
	const tokenTvl: Record<string, number> = {};
	const walletData = new Map<
		string,
		{ tvl: number; tokenBreakdown: Record<string, number>; isExcluded: boolean; isTeam: boolean }
	>();
	let totalTvl = 0;
	let eligibleTvl = 0;
	let tvlExcludingTeam = 0;

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
			const isExcluded = excludedWallets.has(address);
			const isTeam = teamWallets.has(address);

			const balanceFloat = Number(balance) / 1e18;
			const usdValue = balanceFloat * price;

			// Always add to total TVL
			tokenTotal += usdValue;

			// Track per-wallet TVL (including excluded for tracking)
			if (!walletData.has(address)) {
				walletData.set(address, { tvl: 0, tokenBreakdown: {}, isExcluded, isTeam });
			}
			const wallet = walletData.get(address)!;
			wallet.tvl += usdValue;
			wallet.tokenBreakdown[symbol] = (wallet.tokenBreakdown[symbol] || 0) + usdValue;

			// Only add to eligible TVL if not excluded
			if (!isExcluded) {
				eligibleTvl += usdValue;
			}

			// Only add to tvlExcludingTeam if not excluded AND not team
			if (!isExcluded && !isTeam) {
				tvlExcludingTeam += usdValue;
			}
		}

		tokenTvl[symbol] = tokenTotal;
		totalTvl += tokenTotal;
	}

	// Build wallet TVL entries with access code info (excluding excluded wallets from list)
	const walletTvl: WalletTvlEntry[] = [];
	const walletTvlMap: Record<string, number> = {};
	let excludedWalletCount = 0;
	let teamWalletCount = 0;

	for (const [address, data] of walletData) {
		if (data.isExcluded) {
			excludedWalletCount++;
			continue; // Don't include excluded wallets in the wallet list
		}
		if (data.isTeam) {
			teamWalletCount++;
			// Team wallets ARE included in the wallet list (they're eligible for rewards)
		}
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

	// Aggregate TVL by access code (only non-excluded wallets)
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
		eligibleTvl,
		tvlExcludingTeam,
		tokenTvl,
		walletTvl,
		codeTvl,
		walletTvlMap,
		codeTvlMap,
		excludedWalletCount,
		teamWalletCount
	};
}

/**
 * Simple TVL calculation for daily data (less detailed)
 */
async function calculateSimpleTvlAtBlock(
	blockNumber: number,
	walletToCode: Map<string, string>,
	excludedWallets: Set<string>,
	teamWallets: Set<string>
): Promise<{
	totalTvl: number;
	eligibleTvl: number;
	tvlExcludingTeam: number;
	tokenTvl: Record<string, number>;
	walletTvl: Record<string, number>;
	codeTvl: Record<string, number>;
} | null> {
	const tokenTvl: Record<string, number> = {};
	const walletTvl: Record<string, number> = {};
	const codeTvl: Record<string, number> = {};
	let totalTvl = 0;
	let eligibleTvl = 0;
	let tvlExcludingTeam = 0;

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
			const isExcluded = excludedWallets.has(address);
			const isTeam = teamWallets.has(address);

			const balanceFloat = Number(balance) / 1e18;
			const usdValue = balanceFloat * price;

			// Always add to total TVL
			tokenTotal += usdValue;

			// Add to eligible TVL if not excluded
			if (!isExcluded) {
				eligibleTvl += usdValue;

				// Track per-wallet TVL (only non-excluded)
				walletTvl[address] = (walletTvl[address] || 0) + usdValue;

				// Track per-code TVL (only non-excluded)
				const code = walletToCode.get(address);
				if (code) {
					codeTvl[code] = (codeTvl[code] || 0) + usdValue;
				}
			}

			// Add to tvlExcludingTeam if not excluded AND not team
			if (!isExcluded && !isTeam) {
				tvlExcludingTeam += usdValue;
			}
		}

		tokenTvl[symbol] = tokenTotal;
		totalTvl += tokenTotal;
	}

	return {
		totalTvl,
		eligibleTvl,
		tvlExcludingTeam,
		tokenTvl,
		walletTvl,
		codeTvl
	};
}

export const GET: RequestHandler = async ({ url, cookies, request }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-tvl');
	if (guardResponse) return guardResponse;

	try {
		const limitParam = url.searchParams.get('limit');
		const parsedLimit = limitParam ? parseInt(limitParam) : 90;
		const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 365) : 90;

		// Check KV cache first (skip if refresh=1 query param)
		const cacheKey = `tvl:cache:${limit}`;
		const skipCache = url.searchParams.get('refresh') === '1';
		if (!skipCache) {
			const cached = await kvGet<TvlResponse>(cacheKey);
			if (cached) {
				return json(cached, {
					headers: {
						'Cache-Control': 'private, max-age=60'
					}
				});
			}
		}

		// Get wallet-to-code mapping, excluded wallets, team wallets, and pool wallets
		const [walletToCode, excludedWallets, teamWallets, poolWallets] = await Promise.all([
			fetchWalletToCodeMapping(),
			getExcludedWalletsSet(),
			getTeamWalletsSet(),
			getPoolWalletsSet()
		]);

		// Pool wallets should count toward TVL even if also in the excluded list
		for (const pool of poolWallets) {
			excludedWallets.delete(pool);
		}

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
			excludedWallets,
			teamWallets
		);

		// Calculate TVL for each day (in parallel, but limit concurrency)
		const dailyTvl: DailyTvlEntry[] = [];

		// Process in batches of 15 to avoid overwhelming the blob storage
		const batchSize = 15;
		for (let i = 0; i < limitedDates.length; i += batchSize) {
			const batch = limitedDates.slice(i, i + batchSize);
			const batchResults = await Promise.all(
				batch.map(async (date) => {
					const block = blocksByDate.get(date)!;
					const tvl = await calculateSimpleTvlAtBlock(
						block.blockNumber,
						walletToCode,
						excludedWallets,
						teamWallets
					);

					if (tvl) {
						return {
							date,
							timestamp: block.timestamp,
							blockNumber: block.blockNumber,
							totalTvl: tvl.totalTvl,
							eligibleTvl: tvl.eligibleTvl,
							tvlExcludingTeam: tvl.tvlExcludingTeam,
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

		const response: TvlResponse = {
			success: true,
			latest: latestTvl
				? {
						timestamp: latestBlock.timestamp,
						blockNumber: latestBlock.blockNumber,
						totalTvl: latestTvl.totalTvl,
						eligibleTvl: latestTvl.eligibleTvl,
						tvlExcludingTeam: latestTvl.tvlExcludingTeam,
						tokenTvl: latestTvl.tokenTvl,
						walletTvl: latestTvl.walletTvl,
						codeTvl: latestTvl.codeTvl,
						walletCount: latestTvl.walletTvl.length,
						excludedWalletCount: latestTvl.excludedWalletCount,
						teamWalletCount: latestTvl.teamWalletCount
					}
				: null,
			daily: dailyTvl
		};

		// Cache in KV with 1-hour TTL (don't fail the response on cache errors)
		try {
			const client = await getKv();
			if (client) {
				await client.set(cacheKey, JSON.stringify(response), { EX: 3600 });
			}
		} catch (cacheError) {
			console.error('[TVL API] Cache write failed:', cacheError);
		}

		return json(response, {
			headers: {
				'Cache-Control': 'private, max-age=60'
			}
		});
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
