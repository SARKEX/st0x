/**
 * Compute projected average daily points using the last 6 snapshot totals as a
 * trend signal.  Uses `totalPointsFiltered` (excluded-wallet-aware) from each
 * snapshot entry, falling back to `totalPoints` for data written before the
 * filtered field was added.
 *
 * When >=6 snapshots exist the recent-vs-overall ratio scales the blended
 * average so projections reflect recent TVL trends.  With fewer snapshots it
 * falls back to `totalPoints / daysElapsed`.
 */
export function computeProjectedDailyPoints(
	totalPoints: number,
	daysElapsed: number,
	snapshotTotals: { totalPoints: number; totalPointsFiltered?: number }[]
): number {
	if (snapshotTotals.length >= 6) {
		const recent = snapshotTotals.slice(-6);
		const recentSum = recent.reduce(
			(s, t) => s + (t.totalPointsFiltered ?? t.totalPoints),
			0
		);
		const overallSum = snapshotTotals.reduce(
			(s, t) => s + (t.totalPointsFiltered ?? t.totalPoints),
			0
		);
		const recentAvg = recentSum / recent.length;
		const overallAvg = overallSum / snapshotTotals.length;
		const scaleFactor = overallAvg > 0 ? recentAvg / overallAvg : 1;
		return (totalPoints / daysElapsed) * scaleFactor;
	}
	return totalPoints / daysElapsed;
}
