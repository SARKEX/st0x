// API endpoint to generate detailed statement for a single wallet
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminAuthenticated } from '$lib/server/adminAuth';
import { kvGet, KV_KEYS, type SnapshotBlockRecord } from '$lib/server/kv';
import { list } from '@vercel/blob';
import { TOKENS } from '$lib/config/tokens';
import type { BlockSnapshot } from '$lib/server/snapshots/types';
import { env } from '$env/dynamic/private';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';

const POINTS_PER_DOLLAR = 100;
const tokenSymbols = TOKENS.map((t) => t.symbol);
const previousSymbolsByToken = new Map<string, string[]>(
	TOKENS.filter((t) => t.previousSymbols?.length).map((t) => [t.symbol, t.previousSymbols!])
);

async function fetchSnapshot(
	tokenSymbol: string,
	blockNumber: number
): Promise<BlockSnapshot | null> {
	if (!env.BLOB_READ_WRITE_TOKEN) {
		return null;
	}

	// Try current symbol first, then fall back to previous symbol names
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
			console.error(`[Wallet Statement] Error fetching snapshot ${symbol}/${blockNumber}:`, error);
		}
	}

	return null;
}

interface TokenHolding {
	symbol: string;
	quantity: number;
	price: number;
	usdValue: number;
	points: number;
}

interface SnapshotData {
	blockNumber: number;
	timestamp: number;
	date: string;
	holdings: TokenHolding[];
	totalUsdValue: number;
	totalPoints: number;
}

export const GET: RequestHandler = async ({ url, cookies, request }) => {
	const rateLimitResponse = await applyRateLimit(
		request,
		rateLimiters.admin,
		'admin-wallet-statement'
	);
	if (rateLimitResponse) return rateLimitResponse;

	if (!isAdminAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const wallet = url.searchParams.get('wallet');
	const month = url.searchParams.get('month');

	if (!wallet || !month) {
		return json({ error: 'Missing wallet or month parameter' }, { status: 400 });
	}

	const normalizedWallet = wallet.toLowerCase();

	try {
		// Get all snapshot blocks for the month
		const allBlocks = (await kvGet<SnapshotBlockRecord[]>(KV_KEYS.snapshotBlocks())) || [];
		const monthBlocks = allBlocks
			.filter((b) => b.date.startsWith(month))
			.sort((a, b) => a.blockNumber - b.blockNumber);

		if (monthBlocks.length === 0) {
			return json({
				success: true,
				wallet: normalizedWallet,
				month,
				snapshots: [],
				message: 'No snapshots found for this month'
			});
		}

		// Process each block
		const snapshotsData: SnapshotData[] = [];

		for (const block of monthBlocks) {
			// Fetch all token snapshots for this block
			const tokenSnapshots = await Promise.all(
				tokenSymbols.map((symbol) => fetchSnapshot(symbol, block.blockNumber))
			);

			const holdings: TokenHolding[] = [];
			let totalUsdValue = 0;
			let totalPoints = 0;

			// Process each token snapshot
			for (let i = 0; i < tokenSnapshots.length; i++) {
				const snapshot = tokenSnapshots[i];
				const symbol = tokenSymbols[i];

				if (!snapshot) continue;

				const price = snapshot.price?.price ?? 0;
				const balanceStr = snapshot.balances[normalizedWallet] || snapshot.balances[wallet];

				if (!balanceStr) continue;

				const balance = BigInt(balanceStr);
				if (balance <= 0n) continue;

				const quantity = Number(balance) / 1e18;
				const usdValue = quantity * price;
				const points = usdValue * POINTS_PER_DOLLAR;

				holdings.push({
					symbol,
					quantity,
					price,
					usdValue,
					points
				});

				totalUsdValue += usdValue;
				totalPoints += points;
			}

			// Sort holdings by USD value descending
			holdings.sort((a, b) => b.usdValue - a.usdValue);

			snapshotsData.push({
				blockNumber: block.blockNumber,
				timestamp: block.timestamp,
				date: block.date,
				holdings,
				totalUsdValue,
				totalPoints
			});
		}

		// Calculate totals
		const grandTotalUsdValue = snapshotsData.reduce((sum, s) => sum + s.totalUsdValue, 0);
		const grandTotalPoints = snapshotsData.reduce((sum, s) => sum + s.totalPoints, 0);
		const avgUsdValue = snapshotsData.length > 0 ? grandTotalUsdValue / snapshotsData.length : 0;

		return json({
			success: true,
			wallet: normalizedWallet,
			month,
			snapshots: snapshotsData,
			totals: {
				totalUsdValue: grandTotalUsdValue,
				totalPoints: grandTotalPoints,
				avgUsdValue,
				snapshotCount: snapshotsData.length
			}
		});
	} catch (error) {
		console.error('[Wallet Statement API] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
