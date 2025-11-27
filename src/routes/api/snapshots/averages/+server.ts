// API endpoint to retrieve monthly average data
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getMonthlyAverages,
	getAvailableMonths,
	calculateWalletAverage,
	calculateTokenAverage
} from '$lib/server/snapshots/averages';
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

		const monthlyData = await getMonthlyAverages(month);

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

			// Calculate averages for this wallet
			const averagePortfolioValue = calculateWalletAverage(walletData);

			const tokenAverages = Object.entries(walletData.tokens).map(([tokenAddress, tokenData]) => ({
				tokenAddress,
				tokenSymbol: tokenSymbolMap.get(tokenAddress) || 'UNKNOWN',
				averageValue: calculateTokenAverage(tokenData),
				averageBalance: (
					BigInt(tokenData.balanceSum) / BigInt(tokenData.snapshotCount || 1)
				).toString(),
				snapshotCount: tokenData.snapshotCount
			}));

			return json({
				success: true,
				month,
				wallet,
				snapshotCount: walletData.snapshotCount,
				averagePortfolioValue,
				tokens: tokenAverages
			});
		}

		// Return summary for all wallets
		const walletSummaries = Object.entries(monthlyData.wallets)
			.map(([address, data]) => ({
				address,
				averagePortfolioValue: calculateWalletAverage(data),
				snapshotCount: data.snapshotCount,
				tokenCount: Object.keys(data.tokens).length
			}))
			.sort((a, b) => b.averagePortfolioValue - a.averagePortfolioValue);

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
		console.error('[Averages API] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
