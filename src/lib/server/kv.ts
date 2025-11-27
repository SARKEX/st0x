import { createClient } from '@vercel/kv';
import { env } from '$env/dynamic/private';

function getKvClient() {
	const url = env.KV_REST_API_URL;
	const token = env.KV_REST_API_TOKEN;

	if (!url || !token) {
		console.warn('Vercel KV not configured. Using mock storage for development.');
		return null;
	}

	return createClient({
		url,
		token
	});
}

export const kv = getKvClient();

// Key prefixes for organization
export const KV_KEYS = {
	accessCode: (code: string) => `access_codes:${code.toUpperCase()}`,
	wallet: (address: string) => `wallets:${address.toLowerCase()}`,
	codeWallets: (code: string) => `code_wallets:${code.toUpperCase()}`,
	allCodes: () => 'access_codes:__all__',
	// Snapshot keys
	snapshotBlocks: () => 'snapshots:blocks', // List of all snapshot block records
	snapshotBlocksByDate: (date: string) => `snapshots:date:${date}`, // Blocks for a specific date (YYYY-MM-DD)
	// Monthly average keys
	monthlyAverage: (month: string) => `snapshots:monthly:${month}`, // Monthly running averages (YYYY-MM)
	monthlyAveragesList: () => 'snapshots:monthly:__all__', // List of all months with data
	// Excluded wallets for rewards
	excludedWallets: () => 'rewards:excluded_wallets' // List of wallet addresses excluded from TVL
} as const;

// Types for snapshot block records
export interface SnapshotBlockRecord {
	blockNumber: number;
	timestamp: number;
	date: string; // YYYY-MM-DD
	generatedAt: string;
}

export interface DailySnapshotRecord {
	date: string;
	blocks: SnapshotBlockRecord[];
	generatedAt: string;
}

// Types for monthly running averages
export interface WalletTokenAverage {
	balanceSum: string; // Sum of balances across snapshots (string for BigInt)
	valueSum: number; // Sum of (price × balance) in USD
	snapshotCount: number; // Number of snapshots where wallet held this token
}

export interface WalletMonthlyAverage {
	// Per-token tracking
	tokens: {
		[tokenAddress: string]: WalletTokenAverage;
	};
	// Total portfolio tracking
	totalValueSum: number; // Sum of portfolio values across all snapshots
	snapshotCount: number; // Total snapshots wallet appeared in
}

export interface MonthlyAverageData {
	month: string; // YYYY-MM format
	snapshotCount: number; // Total snapshots in this month
	blockNumbers: number[]; // List of block numbers included
	wallets: {
		[address: string]: WalletMonthlyAverage;
	};
	updatedAt: string;
}
