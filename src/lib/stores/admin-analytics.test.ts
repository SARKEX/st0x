import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

let browserFlag = true;

vi.mock('$app/environment', () => ({
        get browser() {
                return browserFlag;
        }
}));

const originalFetch = globalThis.fetch;

// Import after mocks so the module picks up the mocked environment
import { analyticsDashboard, loadAnalyticsDashboard } from './admin-analytics';

describe('analyticsDashboard store', () => {
        beforeEach(() => {
                browserFlag = true;
                analyticsDashboard.reset();
        });

        afterEach(() => {
                vi.restoreAllMocks();
                globalThis.fetch = originalFetch;
        });

        it('loads analytics data successfully and updates the store', async () => {
                const mockData = {
                        totalSearches: 10,
                        uniqueVisitorsToday: 5,
                        topSearchTerms: [],
                        searchesWithNoResults: 1,
                        recentSearches: [],
                        dailyStats: []
                };

                const json = vi.fn().mockResolvedValue(mockData);
                globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json }) as unknown as typeof fetch;

                const loadPromise = loadAnalyticsDashboard();

                const loadingState = get(analyticsDashboard);
                expect(loadingState.status).toBe('loading');
                expect(loadingState.error).toBeNull();

                await loadPromise;

                expect(globalThis.fetch).toHaveBeenCalledWith('/api/analytics');

                const readyState = get(analyticsDashboard);
                expect(readyState.status).toBe('ready');
                expect(readyState.data).toEqual(mockData);
                expect(readyState.error).toBeNull();
                expect(readyState.updatedAt).not.toBeNull();
        });

        it('stores an error when the fetch fails', async () => {
                browserFlag = true;
                globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

                await loadAnalyticsDashboard();

                const state = get(analyticsDashboard);
                expect(state.status).toBe('error');
                expect(state.data).toBeNull();
                expect(state.error).toBe('Analytics request failed with status 500');
                expect(state.updatedAt).not.toBeNull();
        });

        it('reuses the in-flight promise when load is called multiple times without force', async () => {
                let resolveFetch: (value: Response) => void;
                const fetchPromise = new Promise<Response>((resolve) => {
                        resolveFetch = resolve;
                });
                const json = vi.fn().mockResolvedValue({
                        totalSearches: 0,
                        uniqueVisitorsToday: 0,
                        topSearchTerms: [],
                        searchesWithNoResults: 0,
                        recentSearches: [],
                        dailyStats: []
                });
                globalThis.fetch = vi
                        .fn()
                        .mockImplementation(() => fetchPromise) as unknown as typeof fetch;

                const firstPromise = loadAnalyticsDashboard();
                const secondPromise = loadAnalyticsDashboard();

                expect(globalThis.fetch).toHaveBeenCalledTimes(1);

                resolveFetch!({ ok: true, json } as unknown as Response);
                await Promise.all([firstPromise, secondPromise]);

                expect(json).toHaveBeenCalledTimes(1);
        });

        it('forces a reload when the force option is provided', async () => {
                const mockData = {
                        totalSearches: 0,
                        uniqueVisitorsToday: 0,
                        topSearchTerms: [],
                        searchesWithNoResults: 0,
                        recentSearches: [],
                        dailyStats: []
                };
                const json = vi.fn().mockResolvedValue(mockData);
                const response = { ok: true, json } as unknown as Response;

                let resolveFirst: (value: Response) => void;
                const firstFetchPromise = new Promise<Response>((resolve) => {
                        resolveFirst = resolve;
                });

                globalThis.fetch = vi
                        .fn()
                        .mockImplementationOnce(() => firstFetchPromise)
                        .mockResolvedValue(response);

                const firstPromise = loadAnalyticsDashboard();
                expect(globalThis.fetch).toHaveBeenCalledTimes(1);

                const secondPromise = loadAnalyticsDashboard({ force: true });
                expect(globalThis.fetch).toHaveBeenCalledTimes(2);

                resolveFirst!(response);
                await Promise.all([firstPromise, secondPromise]);

                const state = get(analyticsDashboard);
                expect(state.status).toBe('ready');
                expect(state.data).toEqual(mockData);
        });

        it('resets the store to its initial state', async () => {
                const mockData = {
                        totalSearches: 1,
                        uniqueVisitorsToday: 1,
                        topSearchTerms: [],
                        searchesWithNoResults: 0,
                        recentSearches: [],
                        dailyStats: []
                };
                const json = vi.fn().mockResolvedValue(mockData);
                globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json }) as unknown as typeof fetch;

                await loadAnalyticsDashboard();
                const readyState = get(analyticsDashboard);
                expect(readyState.status).toBe('ready');

                analyticsDashboard.reset();

                const resetState = get(analyticsDashboard);
                expect(resetState).toEqual({
                        status: 'idle',
                        data: null,
                        error: null,
                        updatedAt: null
                });
        });

        it('does not attempt to load when not running in the browser', async () => {
                browserFlag = false;
                analyticsDashboard.reset();
                globalThis.fetch = vi.fn() as unknown as typeof fetch;

                await loadAnalyticsDashboard();

                expect(globalThis.fetch).not.toHaveBeenCalled();
                const state = get(analyticsDashboard);
                expect(state.status).toBe('idle');
                expect(state.data).toBeNull();
        });
});
