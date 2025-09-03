import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { currentNetwork } from './stores';

export interface SearchEvent {
	id: string;
	timestamp: number;
	searchTerm: string;
	resultsCount: number;
	networkId: number;
	sessionId: string;
	userId?: string;
	selectedResult?: string;
	searchDuration?: number;
}

export interface ClickEvent {
	id: string;
	timestamp: number;
	searchId: string;
	selectedToken: string;
	position: number;
	networkId: number;
}

interface AnalyticsStore {
	searches: SearchEvent[];
	clicks: ClickEvent[];
	sessionId: string;
}

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getSessionId(): string {
	if (!browser) return '';

	let sessionId = sessionStorage.getItem('analytics_session_id');
	if (!sessionId) {
		sessionId = generateId();
		sessionStorage.setItem('analytics_session_id', sessionId);
	}
	return sessionId;
}

function getVisitorId(): string {
	if (!browser) return '';

	let visitorId = localStorage.getItem('analytics_visitor_id');
	if (!visitorId) {
		visitorId = generateId();
		localStorage.setItem('analytics_visitor_id', visitorId);
	}
	return visitorId;
}

function createAnalyticsStore() {
	const initialState: AnalyticsStore = {
		searches: [],
		clicks: [],
		sessionId: getSessionId()
	};

	const { subscribe, set, update } = writable<AnalyticsStore>(initialState);

	let searchStartTime: number | null = null;
	let currentSearchId: string | null = null;

	return {
		subscribe,

		trackSearchStart: () => {
			searchStartTime = Date.now();
			currentSearchId = generateId();
		},

		trackSearch: (searchTerm: string, resultsCount: number, selectedResult?: string) => {
			const network = get(currentNetwork);
			const searchDuration = searchStartTime ? Date.now() - searchStartTime : undefined;

			const searchEvent: SearchEvent = {
				id: currentSearchId || generateId(),
				timestamp: Date.now(),
				searchTerm,
				resultsCount,
				networkId: network?.id || 0,
				sessionId: getSessionId(),
				selectedResult,
				searchDuration
			};

			update((store) => ({
				...store,
				searches: [...store.searches, searchEvent]
			}));

			// Send to analytics endpoint
			if (browser) {
				sendAnalytics('search', searchEvent);
			}

			// Store locally for backup
			storeLocally('search', searchEvent);

			return searchEvent.id;
		},

		trackClick: (searchId: string, selectedToken: string, position: number) => {
			const network = get(currentNetwork);

			const clickEvent: ClickEvent = {
				id: generateId(),
				timestamp: Date.now(),
				searchId,
				selectedToken,
				position,
				networkId: network?.id || 0
			};

			update((store) => ({
				...store,
				clicks: [...store.clicks, clickEvent]
			}));

			// Send to analytics endpoint
			if (browser) {
				sendAnalytics('click', clickEvent);
			}

			// Store locally for backup
			storeLocally('click', clickEvent);
		},

		getSearchStats: () => {
			const store = get({ subscribe });
			const stats = {
				totalSearches: store.searches.length,
				uniqueTerms: new Set(store.searches.map((s) => s.searchTerm.toLowerCase())).size,
				avgResultsCount:
					store.searches.reduce((acc, s) => acc + s.resultsCount, 0) / store.searches.length || 0,
				clickThroughRate: (store.clicks.length / store.searches.length) * 100 || 0,
				topSearchTerms: getTopSearchTerms(store.searches),
				searchesWithNoResults: store.searches.filter((s) => s.resultsCount === 0).length,
				avgSearchDuration:
					store.searches
						.filter((s) => s.searchDuration)
						.reduce((acc, s) => acc + (s.searchDuration || 0), 0) /
						store.searches.filter((s) => s.searchDuration).length || 0
			};
			return stats;
		},

		exportData: () => {
			const store = get({ subscribe });
			return {
				searches: store.searches,
				clicks: store.clicks,
				sessionId: store.sessionId,
				exportedAt: Date.now()
			};
		},

		clearData: () => {
			set(initialState);
			if (browser) {
				localStorage.removeItem('search_analytics');
				localStorage.removeItem('click_analytics');
			}
		}
	};
}

function getTopSearchTerms(searches: SearchEvent[], limit = 10): { term: string; count: number }[] {
	const termCounts = searches.reduce(
		(acc, search) => {
			const term = search.searchTerm.toLowerCase();
			acc[term] = (acc[term] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);

	return Object.entries(termCounts)
		.map(([term, count]) => ({ term, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, limit);
}

function storeLocally(type: 'search' | 'click', event: SearchEvent | ClickEvent) {
	if (!browser) return;

	const key = `${type}_analytics`;
	const stored = localStorage.getItem(key);
	const events = stored ? JSON.parse(stored) : [];

	// Keep only last 1000 events
	events.push(event);
	if (events.length > 1000) {
		events.shift();
	}

	localStorage.setItem(key, JSON.stringify(events));
}

async function sendAnalytics(type: 'search' | 'click', event: SearchEvent | ClickEvent) {
	try {
		// Only send search events to KV storage
		if (type !== 'search') return;

		const searchEvent = event as SearchEvent;
		const response = await fetch('/api/analytics', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				searchTerm: searchEvent.searchTerm,
				visitorId: getVisitorId(),
				timestamp: searchEvent.timestamp,
				resultsCount: searchEvent.resultsCount,
				network: searchEvent.networkId,
				sessionId: searchEvent.sessionId
			})
		});

		if (!response.ok) {
			console.warn('Failed to send analytics:', response.status);
		}
	} catch (error) {
		console.warn('Analytics error:', error);
		// Fail silently - don't break the app for analytics
	}
}

export const searchAnalytics = createAnalyticsStore();

// Debounced search tracking with deduplication
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let lastSearchTerm: string = '';
let lastSearchTime: number = 0;

export function trackSearchDebounced(searchTerm: string, resultsCount: number, delay = 800) {
	if (searchDebounceTimer) {
		clearTimeout(searchDebounceTimer);
	}

	// Don't track if it's the same search within 5 seconds
	const now = Date.now();
	if (searchTerm === lastSearchTerm && now - lastSearchTime < 5000) {
		return;
	}

	searchDebounceTimer = setTimeout(() => {
		lastSearchTerm = searchTerm;
		lastSearchTime = now;
		searchAnalytics.trackSearch(searchTerm, resultsCount);
	}, delay);
}
