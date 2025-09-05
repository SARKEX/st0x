import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kv } from '@vercel/kv';
import { dev } from '$app/environment';
import { kvLocal } from '$lib/kv-local';

// Use local Redis in development, Vercel KV in production
const storage = dev && !process.env.KV_REST_API_URL ? kvLocal : kv;

interface AnalyticsEvent {
	searchTerm: string;
	visitorId: string;
	timestamp: number;
	resultsCount?: number;
	network?: string;
	sessionId?: string;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data: AnalyticsEvent = await request.json();

		// Validate required fields
		if (!data.searchTerm || !data.visitorId || !data.timestamp) {
			return json({ success: false, error: 'Missing required fields' }, { status: 400 });
		}

		// Create unique key for this event
		const eventKey = `search:${data.timestamp}:${data.visitorId}`;

		// Store the event in KV
		await storage.set(eventKey, data, {
			ex: 60 * 60 * 24 * 90 // Expire after 90 days
		});

		// Update search term counter
		const termKey = `term:${data.searchTerm.toLowerCase()}`;
		await storage.incr(termKey);

		// Update daily stats
		const today = new Date().toISOString().split('T')[0];
		const dailyKey = `daily:${today}`;
		await storage.incr(dailyKey);

		// Add to recent searches list (keep last 100)
		// Vercel KV handles JSON automatically, local Redis needs stringification
		await storage.lpush('recent:searches', data as unknown);
		await storage.ltrim('recent:searches', 0, 99);

		// Track unique visitors
		const visitorKey = `visitor:${today}:${data.visitorId}`;
		await storage.set(visitorKey, 1, {
			ex: 60 * 60 * 24 * 2 // Expire after 2 days
		});

		return json({ success: true });
	} catch (error) {
		console.error('Analytics error:', error);
		// Don't return error to client - analytics should fail silently
		return json({ success: false });
	}
};

export const GET: RequestHandler = async () => {
	try {
		// Get recent searches
		const recentSearchesRaw = await storage.lrange('recent:searches', 0, 99);
		const recentSearches = recentSearchesRaw.filter(Boolean);

		// Get top search terms
		const termKeys = await storage.keys('term:*');
		const termCounts = await Promise.all(
			termKeys.map(async (key) => {
				const count = await storage.get<number>(key);
				const term = key.replace('term:', '');
				return { term, count: count || 0 };
			})
		);
		const topSearchTerms = termCounts.sort((a, b) => b.count - a.count).slice(0, 10);

		// Get daily stats for the last 7 days
		const dailyStats = [];
		for (let i = 0; i < 7; i++) {
			const date = new Date();
			date.setDate(date.getDate() - i);
			const dateStr = date.toISOString().split('T')[0];
			const count = (await storage.get<number>(`daily:${dateStr}`)) || 0;
			dailyStats.push({ date: dateStr, count });
		}

		// Count unique visitors today
		const today = new Date().toISOString().split('T')[0];
		const visitorKeys = await storage.keys(`visitor:${today}:*`);
		const uniqueVisitorsToday = visitorKeys.length;

		// Calculate searches with no results
		const searchesWithNoResults = recentSearches.filter((s) => s.resultsCount === 0).length;

		const summary = {
			totalSearches: recentSearches.length,
			uniqueVisitorsToday,
			topSearchTerms,
			searchesWithNoResults,
			recentSearches: recentSearches.slice(0, 20),
			dailyStats: dailyStats.reverse()
		};

		return json(summary);
	} catch (error) {
		console.error('Failed to read analytics:', error);
		// Return empty stats if KV is not configured
		return json({
			totalSearches: 0,
			uniqueVisitorsToday: 0,
			topSearchTerms: [],
			searchesWithNoResults: 0,
			recentSearches: [],
			dailyStats: []
		});
	}
};
