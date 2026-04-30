// API endpoint to preview/generate snapshots without saving.
// Per-wallet points calculation removed in Phase 1 (DEPR-02 D-03); preview now
// returns wallet holdings + per-token TVL from the surviving snapshot pipeline.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getCurrentBlockNumber,
	getBlockTimestamp,
	generateAllTokenSnapshots
} from '$lib/server/snapshots/generator';
import { kvGet, KV_KEYS } from '$lib/server/kv';
import { applyTieredRateLimit } from '$lib/server/rateLimit';

export const GET: RequestHandler = async ({ url, request, cookies }) => {
	// SEC-06: tiered rate-limit. Plan 03-08b / SEC-03 will swap 'wallet-address' → 'session' cookie + KV lookup.
	const cookieWallet = cookies.get('wallet-address');
	const wallet =
		cookieWallet && /^0x[a-fA-F0-9]{40}$/.test(cookieWallet) ? cookieWallet : null;
	const rateLimitResponse = await applyTieredRateLimit(
		request,
		'snapshotsPreview',
		'snapshots-preview',
		wallet
	);
	if (rateLimitResponse) return rateLimitResponse;

	try {
		const blockParam = url.searchParams.get('block');
		const overallStart = Date.now();

		console.log(`[Preview] Step 1/5: Getting current block number...`);
		let stepStart = Date.now();
		const targetBlock = blockParam ? parseInt(blockParam) : await getCurrentBlockNumber();
		console.log(`[Preview] Step 1/5: Done (${Date.now() - stepStart}ms)`);

		if (isNaN(targetBlock) || targetBlock <= 0) {
			return json({ error: 'Invalid block number' }, { status: 400 });
		}

		console.log(`[Preview] Generating preview for block ${targetBlock}`);

		// Use the same core generator function as the cron job
		console.log(`[Preview] Step 2/5: Generating token snapshots (transfers, prices, vaults)...`);
		stepStart = Date.now();
		const snapshots = await generateAllTokenSnapshots(targetBlock);
		console.log(
			`[Preview] Step 2/5: Done - ${snapshots.length} tokens (${Date.now() - stepStart}ms)`
		);

		// Get timestamp and excluded wallets for response metadata
		console.log(`[Preview] Step 3/5: Getting block timestamp...`);
		stepStart = Date.now();
		const timestamp = await getBlockTimestamp(targetBlock);
		const blockDate = new Date(timestamp * 1000).toISOString();
		console.log(`[Preview] Step 3/5: Done - ${blockDate} (${Date.now() - stepStart}ms)`);

		console.log(`[Preview] Step 4/5: Loading excluded wallets...`);
		stepStart = Date.now();
		const excludedWallets = (await kvGet<string[]>(KV_KEYS.excludedWallets())) || [];
		const excludedSet = new Set(excludedWallets.map((w) => w.toLowerCase()));
		console.log(
			`[Preview] Step 4/5: Done - ${excludedWallets.length} excluded (${Date.now() - stepStart}ms)`
		);

		// Calculate per-token summary stats (for tools section)
		const tokenSummary = snapshots.map((s) => ({
			token: s.tokenSymbol,
			tokenAddress: s.tokenAddress,
			holders: Object.keys(s.balances).length,
			totalSupply: s.totalSupply,
			price: s.price?.price ?? null,
			priceConfidence: s.price?.confidence ?? null
		}));

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

		// Aggregate per-wallet holdings + USD value across all token snapshots.
		// Replaces the deleted points-aggregation step; the wallet UI of the admin
		// preview consumes `tokens` + `totalValue` (TVL view), not `totalPoints`.
		type PreviewWallet = {
			address: string;
			totalValue: number;
			tokens: { symbol: string; address: string; balance: string; value: number }[];
			isExcluded: boolean;
		};
		const walletAggregates = new Map<
			string,
			{ tokens: { symbol: string; address: string; balance: string; value: number }[]; totalValue: number }
		>();
		for (const snapshot of snapshots) {
			const tokenAddressLower = snapshot.tokenAddress.toLowerCase();
			const symbol = tokenSymbolMap.get(tokenAddressLower) ?? 'UNKNOWN';
			const price = tokenPriceMap.get(tokenAddressLower) ?? 0;
			for (const [walletAddress, balanceStr] of Object.entries(snapshot.balances)) {
				const address = walletAddress.toLowerCase();
				const balance = BigInt(balanceStr);
				if (balance <= 0n) continue;

				const balanceFloat = Number(balance) / 1e18;
				const value = balanceFloat * price;

				if (!walletAggregates.has(address)) {
					walletAggregates.set(address, { tokens: [], totalValue: 0 });
				}
				const agg = walletAggregates.get(address)!;
				agg.tokens.push({
					symbol,
					address: tokenAddressLower,
					balance: balance.toString(),
					value
				});
				agg.totalValue += value;
			}
		}

		const wallets: PreviewWallet[] = Array.from(walletAggregates.entries())
			.map(([address, data]) => ({
				address,
				totalValue: data.totalValue,
				tokens: data.tokens,
				isExcluded: excludedSet.has(address)
			}))
			.sort((a, b) => b.totalValue - a.totalValue);

		console.log(`[Preview] Step 5/5: Formatting response...`);
		stepStart = Date.now();
		const response = {
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
		};
		console.log(`[Preview] Step 5/5: Done (${Date.now() - stepStart}ms)`);
		console.log(
			`[Preview] Complete - total time: ${((Date.now() - overallStart) / 1000).toFixed(1)}s`
		);

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
