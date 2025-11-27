// Monthly average calculation and storage
// Tracks running totals of (price × balance) for each wallet across snapshots

import {
	kv,
	KV_KEYS,
	type MonthlyAverageData,
	type WalletMonthlyAverage,
	type WalletTokenAverage
} from '$lib/server/kv';
import type { BlockSnapshot } from './types';

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
 * Calculate wallet values from a set of snapshots for a single block
 * Returns a map of wallet address -> { tokens, totalValue }
 */
function calculateWalletValuesFromSnapshots(
	snapshots: BlockSnapshot[]
): Map<string, { tokens: Map<string, { balance: bigint; value: number }>; totalValue: number }> {
	const walletValues = new Map<
		string,
		{ tokens: Map<string, { balance: bigint; value: number }>; totalValue: number }
	>();

	for (const snapshot of snapshots) {
		const price = snapshot.price?.price ?? 0;
		const tokenAddress = snapshot.tokenAddress.toLowerCase();

		for (const [walletAddress, balanceStr] of Object.entries(snapshot.balances)) {
			const address = walletAddress.toLowerCase();
			const balance = BigInt(balanceStr);

			// Calculate value: (balance / 10^18) * price
			const balanceFloat = Number(balance) / 1e18;
			const value = balanceFloat * price;

			if (!walletValues.has(address)) {
				walletValues.set(address, { tokens: new Map(), totalValue: 0 });
			}

			const wallet = walletValues.get(address)!;
			wallet.tokens.set(tokenAddress, { balance, value });
			wallet.totalValue += value;
		}
	}

	return walletValues;
}

/**
 * Update monthly averages with data from new snapshots
 * Should be called after generating snapshots for a block
 */
export async function updateMonthlyAverages(
	snapshots: BlockSnapshot[],
	blockNumber: number,
	timestamp: number
): Promise<void> {
	if (!kv) {
		console.warn('[Averages] KV not configured, skipping monthly average update');
		return;
	}

	if (snapshots.length === 0) {
		console.warn('[Averages] No snapshots provided');
		return;
	}

	const month = getMonthFromTimestamp(timestamp);
	console.log(`[Averages] Updating monthly averages for ${month}, block ${blockNumber}`);

	// Get existing monthly data or create new (handles month spillover automatically)
	let monthlyData = await kv.get<MonthlyAverageData>(KV_KEYS.monthlyAverage(month));
	const isNewMonth = !monthlyData;

	if (!monthlyData) {
		console.log(`[Averages] Creating new month entry for ${month}`);
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
		console.log(`[Averages] Block ${blockNumber} already included in ${month}, skipping`);
		return;
	}

	// Calculate wallet values from this snapshot
	const walletValues = calculateWalletValuesFromSnapshots(snapshots);

	// Update running totals
	for (const [walletAddress, walletData] of walletValues) {
		if (!monthlyData.wallets[walletAddress]) {
			monthlyData.wallets[walletAddress] = {
				tokens: {},
				totalValueSum: 0,
				snapshotCount: 0
			};
		}

		const walletAvg = monthlyData.wallets[walletAddress];

		// Update per-token data
		for (const [tokenAddress, tokenData] of walletData.tokens) {
			if (!walletAvg.tokens[tokenAddress]) {
				walletAvg.tokens[tokenAddress] = {
					balanceSum: '0',
					valueSum: 0,
					snapshotCount: 0
				};
			}

			const tokenAvg = walletAvg.tokens[tokenAddress];
			const existingBalanceSum = BigInt(tokenAvg.balanceSum);
			const newBalanceSum = existingBalanceSum + tokenData.balance;

			tokenAvg.balanceSum = newBalanceSum.toString();
			tokenAvg.valueSum += tokenData.value;
			tokenAvg.snapshotCount += 1;
		}

		// Update total portfolio value
		walletAvg.totalValueSum += walletData.totalValue;
		walletAvg.snapshotCount += 1;
	}

	// Update month metadata
	monthlyData.snapshotCount += 1;
	monthlyData.blockNumbers.push(blockNumber);
	monthlyData.updatedAt = new Date().toISOString();

	// Save updated data
	await kv.set(KV_KEYS.monthlyAverage(month), monthlyData);

	// Update list of months
	const monthsList = (await kv.get<string[]>(KV_KEYS.monthlyAveragesList())) || [];
	if (!monthsList.includes(month)) {
		monthsList.push(month);
		monthsList.sort(); // Keep sorted
		await kv.set(KV_KEYS.monthlyAveragesList(), monthsList);
	}

	console.log(
		`[Averages] Updated ${month}${isNewMonth ? ' (new month)' : ''}: ${monthlyData.snapshotCount} snapshots, ${
			Object.keys(monthlyData.wallets).length
		} wallets`
	);
}

/**
 * Get monthly average data for a specific month
 */
export async function getMonthlyAverages(month: string): Promise<MonthlyAverageData | null> {
	if (!kv) {
		console.warn('[Averages] KV not configured');
		return null;
	}

	return kv.get<MonthlyAverageData>(KV_KEYS.monthlyAverage(month));
}

/**
 * Get list of all months with average data
 */
export async function getAvailableMonths(): Promise<string[]> {
	if (!kv) {
		console.warn('[Averages] KV not configured');
		return [];
	}

	return (await kv.get<string[]>(KV_KEYS.monthlyAveragesList())) || [];
}

/**
 * Calculate the average portfolio value for a wallet in a given month
 */
export function calculateWalletAverage(walletData: WalletMonthlyAverage): number {
	if (walletData.snapshotCount === 0) return 0;
	return walletData.totalValueSum / walletData.snapshotCount;
}

/**
 * Calculate the average value for a specific token holding
 */
export function calculateTokenAverage(tokenData: WalletTokenAverage): number {
	if (tokenData.snapshotCount === 0) return 0;
	return tokenData.valueSum / tokenData.snapshotCount;
}

/**
 * Calculate average balance for a specific token holding
 */
export function calculateTokenAverageBalance(tokenData: WalletTokenAverage): bigint {
	if (tokenData.snapshotCount === 0) return 0n;
	return BigInt(tokenData.balanceSum) / BigInt(tokenData.snapshotCount);
}
