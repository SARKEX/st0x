// API endpoint to preview/generate snapshots without saving
// Uses the same core calculation functions as points.ts for consistency
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getCurrentBlockNumber,
	getBlockTimestamp,
	generateAllTokenSnapshots_v2
} from '$lib/server/snapshots/generator';
import { kvGet, KV_KEYS } from '$lib/server/kv';
import { calculateWalletPointsFromSnapshots } from '$lib/server/snapshots/points';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const blockParam = url.searchParams.get('block');
		const overallStart = Date.now();

		console.log(`[Preview] Step 1/6: Getting current block number...`);
		let stepStart = Date.now();
		const targetBlock = blockParam ? parseInt(blockParam) : await getCurrentBlockNumber();
		console.log(`[Preview] Step 1/6: Done (${Date.now() - stepStart}ms)`);

		if (isNaN(targetBlock) || targetBlock <= 0) {
			return json({ error: 'Invalid block number' }, { status: 400 });
		}

		console.log(`[Preview] Generating preview for block ${targetBlock}`);

		// Use the same core generator function as the cron job
		console.log(`[Preview] Step 2/6: Generating token snapshots (transfers, prices, vaults)...`);
		stepStart = Date.now();
		const snapshots = await generateAllTokenSnapshots_v2(targetBlock);
		console.log(`[Preview] Step 2/6: Done - ${snapshots.length} tokens (${Date.now() - stepStart}ms)`);

		// Get timestamp and excluded wallets for response metadata
		console.log(`[Preview] Step 3/6: Getting block timestamp...`);
		stepStart = Date.now();
		const timestamp = await getBlockTimestamp(targetBlock);
		const blockDate = new Date(timestamp * 1000).toISOString();
		console.log(`[Preview] Step 3/6: Done - ${blockDate} (${Date.now() - stepStart}ms)`);

		console.log(`[Preview] Step 4/6: Loading excluded wallets...`);
		stepStart = Date.now();
		const excludedWallets = (await kvGet<string[]>(KV_KEYS.excludedWallets())) || [];
		const excludedSet = new Set(excludedWallets.map((w) => w.toLowerCase()));
		console.log(`[Preview] Step 4/6: Done - ${excludedWallets.length} excluded (${Date.now() - stepStart}ms)`);

		// Calculate per-token summary stats (for tools section)
		const tokenSummary = snapshots.map((s) => ({
			token: s.tokenSymbol,
			tokenAddress: s.tokenAddress,
			holders: Object.keys(s.balances).length,
			totalSupply: s.totalSupply,
			price: s.price?.price ?? null,
			priceConfidence: s.price?.confidence ?? null
		}));

		// Use the same calculation function as points.ts (includes LP attribution)
		console.log(`[Preview] Step 5/6: Calculating wallet points with LP attribution...`);
		stepStart = Date.now();
		const walletPointsMap = await calculateWalletPointsFromSnapshots(snapshots, targetBlock);
		console.log(`[Preview] Step 5/6: Done - ${walletPointsMap.size} wallets (${Date.now() - stepStart}ms)`);

		// Build token address to symbol map for display
		const tokenSymbolMap = new Map<string, string>();
		for (const s of snapshots) {
			tokenSymbolMap.set(s.tokenAddress.toLowerCase(), s.tokenSymbol);
		}

		// Build token address to price map for value calculation
		const tokenPriceMap = new Map<string, number>();
		for (const s of snapshots) {
			tokenPriceMap.set(s.tokenAddress.toLowerCase(), s.price?.price ?? 0);
		}

		// Transform to preview format
		const wallets = Array.from(walletPointsMap.entries())
			.map(([address, data]) => {
				const tokens = Array.from(data.tokens.entries()).map(([tokenAddress, tokenData]) => {
					const price = tokenPriceMap.get(tokenAddress) ?? 0;
					const balanceFloat = Number(tokenData.balance) / 1e18;
					const value = balanceFloat * price;

					return {
						symbol: tokenSymbolMap.get(tokenAddress) ?? 'UNKNOWN',
						address: tokenAddress,
						balance: tokenData.balance.toString(),
						value,
						points: tokenData.points
					};
				});

				const totalValue = tokens.reduce((sum, t) => sum + t.value, 0);

				return {
					address,
					totalValue,
					totalPoints: data.totalPoints,
					tokens,
					isExcluded: excludedSet.has(address)
				};
			})
			.sort((a, b) => b.totalValue - a.totalValue);

		console.log(`[Preview] Step 6/6: Formatting response...`);
		stepStart = Date.now();
		const response = {
			success: true,
			blockNumber: targetBlock,
			timestamp,
			blockDate,
			tokensProcessed: snapshots.length,
			walletCount: wallets.length,
			excludedCount: wallets.filter((w) => w.isExcluded).length,
			// Main data: wallets ranked by holdings (with LP attribution applied)
			wallets,
			// Tools data: per-token breakdown
			tokenSummary,
			snapshots
		};
		console.log(`[Preview] Step 6/6: Done (${Date.now() - stepStart}ms)`);
		console.log(`[Preview] ✓ Complete! Total time: ${((Date.now() - overallStart) / 1000).toFixed(1)}s`);

		return json(response);
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
