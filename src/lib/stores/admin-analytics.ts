import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface AnalyticsSearchSummary {
	totalSearches: number;
	uniqueVisitorsToday: number;
	topSearchTerms: Array<{ term: string; count: number }>;
	searchesWithNoResults: number;
	recentSearches: Array<{
		searchTerm: string;
		visitorId: string;
		timestamp: number;
		resultsCount?: number;
		network?: string;
		sessionId?: string;
	}>;
	dailyStats: Array<{ date: string; count: number }>;
}

type AnalyticsDashboardStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AnalyticsDashboardState {
	status: AnalyticsDashboardStatus;
	data: AnalyticsSearchSummary | null;
	error: string | null;
	updatedAt: number | null;
}

const initialState: AnalyticsDashboardState = {
	status: 'idle',
	data: null,
	error: null,
	updatedAt: null
};

const store = writable<AnalyticsDashboardState>(initialState);
let inFlight: Promise<void> | null = null;

async function fetchAnalyticsSummary(): Promise<AnalyticsSearchSummary> {
	const response = await fetch('/api/analytics');
	if (!response.ok) {
		throw new Error(`Analytics request failed with status ${response.status}`);
	}
	return (await response.json()) as AnalyticsSearchSummary;
}

export async function loadAnalyticsDashboard(options?: { force?: boolean }) {
	if (!browser) return;
	if (inFlight && !options?.force) {
		return inFlight;
	}

	store.update((current) => ({
		...current,
		status: 'loading',
		error: null
	}));

	inFlight = (async () => {
		try {
			const data = await fetchAnalyticsSummary();
			store.set({
				status: 'ready',
				data,
				error: null,
				updatedAt: Date.now()
			});
		} catch (error) {
			console.log('error : ', error);
			const message = error instanceof Error ? error.message : 'Unable to load analytics';
			store.set({
				status: 'error',
				data: null,
				error: message,
				updatedAt: Date.now()
			});
		} finally {
			inFlight = null;
		}
	})();

	return inFlight;
}

export const analyticsDashboard = {
	subscribe: store.subscribe,
	load: loadAnalyticsDashboard,
	reset() {
		store.set(initialState);
	}
};
