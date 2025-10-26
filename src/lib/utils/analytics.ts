import type { AnalyticsSearchSummary } from '$lib/stores/admin-analytics';

export function averageResultsPerSearch(
	summary: AnalyticsSearchSummary | null | undefined
): number {
	if (!summary || summary.totalSearches === 0) {
		return 0;
	}

	const resultsTotal = (summary.recentSearches ?? []).reduce(
		(acc, search) => acc + (search.resultsCount ?? 0),
		0
	);

	return resultsTotal / summary.totalSearches || 0;
}
