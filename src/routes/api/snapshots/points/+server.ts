// API endpoint to retrieve monthly points data
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMonthlyPoints, getAvailableMonths } from '$lib/server/snapshots/points';
import { TOKENS } from '$lib/config/tokens';

// Build token symbol map for display
const tokenSymbolMap = new Map(TOKENS.map((t) => [t.address.toLowerCase(), t.symbol]));

export const GET: RequestHandler = async ({ url }) => {
	try {
		const month = url.searchParams.get('month'); // YYYY-MM format
		const wallet = url.searchParams.get('wallet')?.toLowerCase();

		// If no month specified, return list of available months
		if (!month) {
			const months = await getAvailableMonths();
			return json({
				success: true,
				availableMonths: months
			});
		}

		// Validate month format
		if (!/^\d{4}-\d{2}$/.test(month)) {
			return json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
		}

		const monthlyData = await getMonthlyPoints(month);

		// Debug logging
		console.log(`[Points API] Fetching data for ${month}`);
		console.log(`[Points API] monthlyData exists: ${!!monthlyData}`);
		if (monthlyData) {
			console.log(`[Points API] snapshotCount: ${monthlyData.snapshotCount}`);
			console.log(`[Points API] wallets keys: ${Object.keys(monthlyData.wallets || {}).length}`);
			console.log(`[Points API] wallets type: ${typeof monthlyData.wallets}`);
			console.log(
				`[Points API] wallets sample: ${JSON.stringify(
					Object.keys(monthlyData.wallets || {}).slice(0, 3)
				)}`
			);
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
