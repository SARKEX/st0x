// Monthly points calculation and storage
// Awards 100 points per $1 USD of holdings at each snapshot
// Points accumulate within a calendar month, reset to 0 for new month

import {
	getKv,
	kvGet,
	kvSet,
	KV_KEYS,
	type MonthlyPointsData,
	type WalletMonthlyPoints
} from '$lib/server/kv';
import type { BlockSnapshot } from './types';

const POINTS_PER_DOLLAR = 100;

/**
 * Extract YYYY-MM from a timestamp
 */
function getMonthFromTimestamp(timestamp: number): string {
	const date = new Date(timestamp * 1000);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	return `${year}-${month}`;
}

/** Type for wallet points from a single block calculation */
export type WalletPointsMap = Map<
	string,
	{ tokens: Map<string, { points: number; balance: bigint }>; totalPoints: number }
>;

/**
 * Calculate points for each wallet from a set of snapshots for a single block
 * Points = 100 per $1 USD of holdings
 */
export function calculateWalletPointsFromSnapshots(
	snapshots: BlockSnapshot[],
	_blockNumber: number
): WalletPointsMap {
	const walletPoints: WalletPointsMap = new Map();
	const totalTokens = snapshots.length;

	console.log(`[Points] Processing ${totalTokens} tokens...`);
	const startTime = Date.now();

	// Process all token snapshots
	for (const snapshot of snapshots) {
		const price = snapshot.price?.price ?? 0;
		const tokenAddress = snapshot.tokenAddress.toLowerCase();
		const holdersCount = Object.keys(snapshot.balances).length;

		console.log(`[Points] ${snapshot.tokenSymbol}: ${holdersCount} holders`);

		for (const [walletAddress, balanceStr] of Object.entries(snapshot.balances)) {
			const address = walletAddress.toLowerCase();
			const balance = BigInt(balanceStr);

			if (balance <= 0n) continue;

			const balanceFloat = Number(balance) / 1e18;
			const usdValue = balanceFloat * price;
			const points = usdValue * POINTS_PER_DOLLAR;

			if (!walletPoints.has(address)) {
				walletPoints.set(address, { tokens: new Map(), totalPoints: 0 });
			}

			const wallet = walletPoints.get(address)!;
			wallet.tokens.set(tokenAddress, { points, balance });
			wallet.totalPoints += points;
		}
	}

	console.log(`[Points] All ${totalTokens} tokens processed in ${Date.now() - startTime}ms`);
	return walletPoints;
}

/** Progress callback type for streaming updates */
export type ProgressCallback = (
	tokenIndex: number,
	tokenSymbol: string,
	holdersCount: number
) => void;

/**
 * Calculate points with progress callback for streaming updates
 */
export function calculateWalletPointsFromSnapshotsWithProgress(
	snapshots: BlockSnapshot[],
	_blockNumber: number,
	onProgress?: ProgressCallback
): WalletPointsMap {
	const walletPoints: WalletPointsMap = new Map();

	// Process all token snapshots
	for (let i = 0; i < snapshots.length; i++) {
		const snapshot = snapshots[i];
		const price = snapshot.price?.price ?? 0;
		const tokenAddress = snapshot.tokenAddress.toLowerCase();
		const holdersCount = Object.keys(snapshot.balances).length;

		// Report progress
		if (onProgress) {
			onProgress(i, snapshot.tokenSymbol, holdersCount);
		}

		for (const [walletAddress, balanceStr] of Object.entries(snapshot.balances)) {
			const address = walletAddress.toLowerCase();
			const balance = BigInt(balanceStr);

			if (balance <= 0n) continue;

			const balanceFloat = Number(balance) / 1e18;
			const usdValue = balanceFloat * price;
			const points = usdValue * POINTS_PER_DOLLAR;

			if (!walletPoints.has(address)) {
				walletPoints.set(address, { tokens: new Map(), totalPoints: 0 });
			}

			const wallet = walletPoints.get(address)!;
			wallet.tokens.set(tokenAddress, { points, balance });
			wallet.totalPoints += points;
		}
	}

	return walletPoints;
}

/**
 * Create empty monthly points data structure
 */
export function createEmptyMonthlyData(month: string): MonthlyPointsData {
	return {
		month,
		snapshotCount: 0,
		blockNumbers: [],
		wallets: {},
		updatedAt: new Date().toISOString()
	};
}

/**
 * Merge wallet points from a single block into monthly data
 * This is the single source of truth for accumulating points
 */
export function mergeWalletPointsIntoMonthlyData(
	monthlyData: MonthlyPointsData,
	walletPoints: WalletPointsMap,
	blockNumber: number
): void {
	for (const [walletAddress, walletData] of walletPoints) {
		if (!monthlyData.wallets[walletAddress]) {
			monthlyData.wallets[walletAddress] = {
				tokens: {},
				totalPoints: 0
			};
		}

		const walletMonthly = monthlyData.wallets[walletAddress];

		// Update per-token points
		for (const [tokenAddress, tokenData] of walletData.tokens) {
			if (!walletMonthly.tokens[tokenAddress]) {
				walletMonthly.tokens[tokenAddress] = {
					points: 0,
					lastBalance: '0'
				};
			}

			const tokenMonthly = walletMonthly.tokens[tokenAddress];
			tokenMonthly.points += tokenData.points;
			tokenMonthly.lastBalance = tokenData.balance.toString();
		}

		// Update total points
		walletMonthly.totalPoints += walletData.totalPoints;
	}

	// Update metadata
	monthlyData.snapshotCount += 1;
	monthlyData.blockNumbers.push(blockNumber);
	monthlyData.updatedAt = new Date().toISOString();
}

/**
 * Update monthly points with data from new snapshots
 * Should be called after generating snapshots for a block
 */
export async function updateMonthlyPoints(
	snapshots: BlockSnapshot[],
	blockNumber: number,
	timestamp: number
): Promise<void> {
	const kv = await getKv();
	if (!kv) {
		console.warn('[Points] KV not configured, skipping monthly points update');
		return;
	}

	if (snapshots.length === 0) {
		console.warn('[Points] No snapshots provided');
		return;
	}

	const month = getMonthFromTimestamp(timestamp);
	console.log(`[Points] Updating monthly points for ${month}, block ${blockNumber}`);

	// Get existing monthly data or create new (handles month rollover automatically)
	let monthlyData = await kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(month));
	const isNewMonth = !monthlyData;

	if (!monthlyData) {
		console.log(`[Points] Creating new month entry for ${month}`);
		monthlyData = createEmptyMonthlyData(month);
	}

	// Check if this block is already included
	if (monthlyData.blockNumbers.includes(blockNumber)) {
		console.log(`[Points] Block ${blockNumber} already included in ${month}, skipping`);
		return;
	}

	// Calculate points from this snapshot
	const walletPoints = calculateWalletPointsFromSnapshots(snapshots, blockNumber);

	// Merge into monthly data using shared function
	mergeWalletPointsIntoMonthlyData(monthlyData, walletPoints, blockNumber);

	// Save updated data
	await kvSet(KV_KEYS.monthlyPoints(month), monthlyData);

	// Update list of months
	const monthsList = (await kvGet<string[]>(KV_KEYS.monthlyPointsList())) || [];
	if (!monthsList.includes(month)) {
		monthsList.push(month);
		monthsList.sort(); // Keep sorted
		await kvSet(KV_KEYS.monthlyPointsList(), monthsList);
	}

	const totalPointsAwarded = Array.from(walletPoints.values()).reduce(
		(sum, w) => sum + w.totalPoints,
		0
	);

	console.log(
		`[Points] Updated ${month}${isNewMonth ? ' (new month)' : ''}: ${
			monthlyData.snapshotCount
		} snapshots, ${Object.keys(monthlyData.wallets).length} wallets, ${Math.round(
			totalPointsAwarded
		).toLocaleString()} points awarded this snapshot`
	);
}

/**
 * Get monthly points data for a specific month
 */
export async function getMonthlyPoints(month: string): Promise<MonthlyPointsData | null> {
	const kv = await getKv();
	if (!kv) {
		console.warn('[Points] KV not configured');
		return null;
	}

	return kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(month));
}

/**
 * Get list of all months with points data
 */
export async function getAvailableMonths(): Promise<string[]> {
	const kv = await getKv();
	if (!kv) {
		console.warn('[Points] KV not configured');
		return [];
	}

	return (await kvGet<string[]>(KV_KEYS.monthlyPointsList())) || [];
}

/**
 * Get a wallet's total points for a month
 */
export function getWalletTotalPoints(walletData: WalletMonthlyPoints): number {
	return walletData.totalPoints;
}

/**
 * Get a wallet's points for a specific token
 */
export function getWalletTokenPoints(
	walletData: WalletMonthlyPoints,
	tokenAddress: string
): number {
	return walletData.tokens[tokenAddress.toLowerCase()]?.points ?? 0;
}
