// API endpoint to preview/generate snapshots without saving
// Uses the same core generator functions as the cron job
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getCurrentBlockNumber,
	getBlockTimestamp,
	generateAllTokenSnapshots_v2
} from '$lib/server/snapshots/generator';
import { kv, KV_KEYS } from '$lib/server/kv';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const blockParam = url.searchParams.get('block');
		const targetBlock = blockParam ? parseInt(blockParam) : await getCurrentBlockNumber();

		if (isNaN(targetBlock) || targetBlock <= 0) {
			return json({ error: 'Invalid block number' }, { status: 400 });
		}

		console.log(`[Preview] Generating preview for block ${targetBlock}`);

		// Use the same core generator function as the cron job
		const snapshots = await generateAllTokenSnapshots_v2(targetBlock);

		// Get timestamp and excluded wallets for response metadata
		const timestamp = await getBlockTimestamp(targetBlock);
		const blockDate = new Date(timestamp * 1000).toISOString();
		const excludedWallets = kv ? (await kv.get<string[]>(KV_KEYS.excludedWallets())) || [] : [];

		// Calculate per-token summary stats (for tools section)
		const tokenSummary = snapshots.map((s) => ({
			token: s.tokenSymbol,
			tokenAddress: s.tokenAddress,
			holders: Object.keys(s.balances).length,
			totalSupply: s.totalSupply,
			price: s.price?.price ?? null,
			priceConfidence: s.price?.confidence ?? null
		}));

		// Calculate consolidated wallet holdings across all tokens
		const walletHoldings = new Map<
			string,
			{
				totalValue: number;
				totalPoints: number;
				tokens: Array<{
					symbol: string;
					address: string;
					balance: string;
					value: number;
					points: number;
				}>;
				isExcluded: boolean;
			}
		>();

		for (const snapshot of snapshots) {
			const price = snapshot.price?.price ?? 0;

			for (const [walletAddress, balanceStr] of Object.entries(snapshot.balances)) {
				const address = walletAddress.toLowerCase();
				const balanceFloat = Number(BigInt(balanceStr)) / 1e18;
				const value = balanceFloat * price;
				const points = value * 100; // 100 points per $1

				if (!walletHoldings.has(address)) {
					walletHoldings.set(address, {
						totalValue: 0,
						totalPoints: 0,
						tokens: [],
						isExcluded: excludedWallets.includes(address)
					});
				}

				const wallet = walletHoldings.get(address)!;
				wallet.totalValue += value;
				wallet.totalPoints += points;
				wallet.tokens.push({
					symbol: snapshot.tokenSymbol,
					address: snapshot.tokenAddress,
					balance: balanceStr,
					value,
					points
				});
			}
		}

		// Convert to sorted array (by total value descending)
		const wallets = Array.from(walletHoldings.entries())
			.map(([address, data]) => ({
				address,
				...data
			}))
			.sort((a, b) => b.totalValue - a.totalValue);

		return json({
			success: true,
			blockNumber: targetBlock,
			timestamp,
			blockDate,
			tokensProcessed: snapshots.length,
			walletCount: wallets.length,
			excludedCount: wallets.filter((w) => w.isExcluded).length,
			// Main data: wallets ranked by holdings
			wallets,
			// Tools data: per-token breakdown
			tokenSummary,
			snapshots
		});
	} catch (error) {
		console.error('[Preview] Error generating preview:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
