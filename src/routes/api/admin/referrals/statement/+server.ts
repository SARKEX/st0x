// API endpoint to generate detailed statement for a referral code
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/adminAuth';
import { kvGet, KV_KEYS, type SnapshotBlockRecord } from '$lib/server/kv';
import { getWalletsByCode } from '$lib/server/accessCodes';
import { list } from '@vercel/blob';
import { TOKENS } from '$lib/config/tokens';
import type { BlockSnapshot } from '$lib/server/snapshots/types';
import { env } from '$env/dynamic/private';

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
			console.error(`[Statement] Error fetching snapshot ${symbol}/${blockNumber}:`, error);
		}
	}

	return null;
}

interface WalletTokenHolding {
	symbol: string;
	quantity: number;
	price: number;
	usdValue: number;
	points: number;
}

interface SnapshotWalletData {
	address: string;
	holdings: WalletTokenHolding[];
	totalUsdValue: number;
	totalPoints: number;
}

interface SnapshotData {
	blockNumber: number;
	timestamp: number;
	date: string;
	wallets: SnapshotWalletData[];
	totalUsdValue: number;
	totalPoints: number;
}

export const GET: RequestHandler = async ({ url, cookies, request }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-referrals-statement');
	if (guardResponse) return guardResponse;

	const code = url.searchParams.get('code');
	const month = url.searchParams.get('month');

	if (!code || !month) {
		return json({ error: 'Missing code or month parameter' }, { status: 400 });
	}

	try {
		// Get wallets for this code
		const codeWallets = await getWalletsByCode(code);

		if (codeWallets.length === 0) {
			return json({
				success: true,
				code,
				month,
				wallets: [],
				snapshots: [],
				message: 'No wallets registered with this code'
			});
		}

		// Get all snapshot blocks for the month
		const allBlocks = (await kvGet<SnapshotBlockRecord[]>(KV_KEYS.snapshotBlocks())) || [];
		const monthBlocks = allBlocks
			.filter((b) => b.date.startsWith(month))
			.sort((a, b) => a.blockNumber - b.blockNumber);

		if (monthBlocks.length === 0) {
			return json({
				success: true,
				code,
				month,
				wallets: codeWallets,
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

			const walletDataMap = new Map<string, SnapshotWalletData>();

			// Process each token snapshot
			for (let i = 0; i < tokenSnapshots.length; i++) {
				const snapshot = tokenSnapshots[i];
				const symbol = tokenSymbols[i];

				if (!snapshot) continue;

				const price = snapshot.price?.price ?? 0;

				// Check each wallet in the code
				for (const walletAddress of codeWallets) {
					const normalizedAddress = walletAddress.toLowerCase();
					const balanceStr =
						snapshot.balances[normalizedAddress] || snapshot.balances[walletAddress];

					if (!balanceStr) continue;

					const balance = BigInt(balanceStr);
					if (balance <= 0n) continue;

					const quantity = Number(balance) / 1e18;
					const usdValue = quantity * price;
					const points = usdValue * POINTS_PER_DOLLAR;

					if (!walletDataMap.has(normalizedAddress)) {
						walletDataMap.set(normalizedAddress, {
							address: normalizedAddress,
							holdings: [],
							totalUsdValue: 0,
							totalPoints: 0
						});
					}

					const walletData = walletDataMap.get(normalizedAddress)!;
					walletData.holdings.push({
						symbol,
						quantity,
						price,
						usdValue,
						points
					});
					walletData.totalUsdValue += usdValue;
					walletData.totalPoints += points;
				}
			}

			// Calculate snapshot totals
			let snapshotTotalUsd = 0;
			let snapshotTotalPoints = 0;
			const wallets: SnapshotWalletData[] = [];

			for (const walletData of walletDataMap.values()) {
				// Sort holdings by USD value descending
				walletData.holdings.sort((a, b) => b.usdValue - a.usdValue);
				wallets.push(walletData);
				snapshotTotalUsd += walletData.totalUsdValue;
				snapshotTotalPoints += walletData.totalPoints;
			}

			// Sort wallets by total USD value descending
			wallets.sort((a, b) => b.totalUsdValue - a.totalUsdValue);

			snapshotsData.push({
				blockNumber: block.blockNumber,
				timestamp: block.timestamp,
				date: block.date,
				wallets,
				totalUsdValue: snapshotTotalUsd,
				totalPoints: snapshotTotalPoints
			});
		}

		// Calculate wallet summary across all snapshots
		const walletSummary = new Map<
			string,
			{ totalUsdValue: number; totalPoints: number; snapshotCount: number }
		>();

		for (const snapshot of snapshotsData) {
			for (const wallet of snapshot.wallets) {
				if (!walletSummary.has(wallet.address)) {
					walletSummary.set(wallet.address, { totalUsdValue: 0, totalPoints: 0, snapshotCount: 0 });
				}
				const summary = walletSummary.get(wallet.address)!;
				summary.totalUsdValue += wallet.totalUsdValue;
				summary.totalPoints += wallet.totalPoints;
				summary.snapshotCount += 1;
			}
		}

		const walletSummaryArray = Array.from(walletSummary.entries())
			.map(([address, data]) => ({
				address,
				...data,
				avgUsdValue: data.snapshotCount > 0 ? data.totalUsdValue / data.snapshotCount : 0
			}))
			.sort((a, b) => b.totalPoints - a.totalPoints);

		return json({
			success: true,
			code,
			month,
			walletSummary: walletSummaryArray,
			snapshots: snapshotsData,
			totals: {
				totalUsdValue: snapshotsData.reduce((sum, s) => sum + s.totalUsdValue, 0),
				totalPoints: snapshotsData.reduce((sum, s) => sum + s.totalPoints, 0),
				snapshotCount: snapshotsData.length,
				walletCount: codeWallets.length
			}
		});
	} catch (error) {
		console.error('[Statement API] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
