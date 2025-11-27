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

/**
 * Calculate points for each wallet from a set of snapshots for a single block
 * Points = 100 per $1 USD of holdings
 */
function calculateWalletPointsFromSnapshots(
	snapshots: BlockSnapshot[]
): Map<string, { tokens: Map<string, { points: number; balance: bigint }>; totalPoints: number }> {
	const walletPoints = new Map<
		string,
		{ tokens: Map<string, { points: number; balance: bigint }>; totalPoints: number }
	>();

	for (const snapshot of snapshots) {
		const price = snapshot.price?.price ?? 0;
		const tokenAddress = snapshot.tokenAddress.toLowerCase();

		for (const [walletAddress, balanceStr] of Object.entries(snapshot.balances)) {
			const address = walletAddress.toLowerCase();
			const balance = BigInt(balanceStr);

			// Calculate USD value: (balance / 10^18) * price
			const balanceFloat = Number(balance) / 1e18;
			const usdValue = balanceFloat * price;

			// Calculate points: 100 per $1
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
		monthlyData = {
			month,
			snapshotCount: 0,
			blockNumbers: [],
			wallets: {},
			updatedAt: new Date().toISOString()
		};
	}

	// Check if this block is already included
	if (monthlyData.blockNumbers.includes(blockNumber)) {
		console.log(`[Points] Block ${blockNumber} already included in ${month}, skipping`);
		return;
	}

	// Calculate points from this snapshot
	const walletPoints = calculateWalletPointsFromSnapshots(snapshots);

	// Add points to running totals
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

	// Update month metadata
	monthlyData.snapshotCount += 1;
	monthlyData.blockNumbers.push(blockNumber);
	monthlyData.updatedAt = new Date().toISOString();

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
