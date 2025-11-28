// API endpoint to retrieve monthly points data
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMonthlyPoints, getAvailableMonths } from '$lib/server/snapshots/points';
import { TOKENS } from '$lib/config/tokens';

// Build token symbol map for display
const tokenSymbolMap = new Map(TOKENS.map((t) => [t.address.toLowerCase(), t.symbol]));

export const GET: RequestHandler = async ({ url }) => {
	const month = url.searchParams.get('month'); // YYYY-MM format
	const wallet = url.searchParams.get('wallet')?.toLowerCase();

	console.log(`[Points API] Request received - month: ${month}, wallet: ${wallet}`);

	try {
		// If no month specified, return list of available months
		if (!month) {
			console.log('[Points API] No month specified, fetching available months');
			const months = await getAvailableMonths();
			console.log(`[Points API] Available months: ${JSON.stringify(months)}`);
			return json({
				success: true,
				availableMonths: months
			});
		}

		// Validate month format
		if (!/^\d{4}-\d{2}$/.test(month)) {
			return json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
		}

		console.log(`[Points API] Fetching monthly points for ${month}...`);
		const monthlyData = await getMonthlyPoints(month);
		console.log(`[Points API] getMonthlyPoints returned, exists: ${!!monthlyData}`);
		if (monthlyData) {
			const walletKeys = Object.keys(monthlyData.wallets || {});
			console.log(`[Points API] snapshotCount: ${monthlyData.snapshotCount}`);
			console.log(`[Points API] wallets keys count: ${walletKeys.length}`);
			console.log(`[Points API] wallets sample: ${JSON.stringify(walletKeys.slice(0, 3))}`);
		}

		if (!monthlyData) {
			return json(
				{
					success: false,
					error: `No data found for ${month}`
				},
				{ status: 404 }
			);
		}

		// If specific wallet requested, return just that wallet's data
		if (wallet) {
			const walletData = monthlyData.wallets[wallet];

			if (!walletData) {
				return json(
					{
						success: false,
						error: `No data found for wallet ${wallet} in ${month}`
					},
					{ status: 404 }
				);
			}

			const tokenPoints = Object.entries(walletData.tokens).map(([tokenAddress, tokenData]) => ({
				tokenAddress,
				tokenSymbol: tokenSymbolMap.get(tokenAddress) || 'UNKNOWN',
				points: Math.round(tokenData.points),
				lastBalance: tokenData.lastBalance
			}));

			return json({
				success: true,
				month,
				wallet,
				snapshotCount: monthlyData.snapshotCount,
				totalPoints: Math.round(walletData.totalPoints),
				tokens: tokenPoints
			});
		}

		// Return summary for all wallets
		const walletSummaries = Object.entries(monthlyData.wallets)
			.map(([address, data]) => ({
				address,
				totalPoints: Math.round(data.totalPoints),
				tokenCount: Object.keys(data.tokens).length
			}))
			.sort((a, b) => b.totalPoints - a.totalPoints);

		return json({
			success: true,
			month: monthlyData.month,
			snapshotCount: monthlyData.snapshotCount,
			blockNumbers: monthlyData.blockNumbers,
			walletCount: walletSummaries.length,
			updatedAt: monthlyData.updatedAt,
			wallets: walletSummaries
		});
	} catch (error) {
		console.error('[Points API] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
