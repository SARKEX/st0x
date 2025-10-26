import { browser } from '$app/environment';
import { readable, type Readable } from 'svelte/store';
import { getNetworkById, type Network } from '$lib/network';

export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TimedResource<T> {
        status: ResourceStatus;
        data: T | null;
        updatedAt: number | null;
        error: unknown | null;
        refreshInterval: number;
        timerId: ReturnType<typeof setTimeout> | null;
        subscribers: number;
}

export type DomainFetcher<T> = (network: Network) => Promise<T>;

export interface PollingOptions<T> {
        refreshInterval: number;
        autoPause: boolean;
        browserOnly?: boolean;
        fetcher: DomainFetcher<T>;
}

export interface PollingController<T> {
        getStore(networkId: number): Readable<TimedResource<T>>;
        ensure(networkId: number, options?: { force?: boolean }): Promise<void> | void;
        stop(networkId: number): void;
}

function createInitialResource<T>(refreshInterval: number): TimedResource<T> {
        return {
                status: 'idle',
                data: null,
                updatedAt: null,
                error: null,
                refreshInterval,
                timerId: null,
                subscribers: 0
        } satisfies TimedResource<T>;
}

export function createPollingController<T>(options: PollingOptions<T>): PollingController<T> {
        const { refreshInterval, autoPause, browserOnly = false, fetcher } = options;
        const states = new Map<number, TimedResource<T>>();
        const subscribers = new Map<number, Set<(value: TimedResource<T>) => void>>();
        const inFlight = new Map<number, Promise<void>>();

        function getState(networkId: number): TimedResource<T> {
                let state = states.get(networkId);
                if (!state) {
                        state = createInitialResource<T>(refreshInterval);
                        states.set(networkId, state);
                }
                return state;
        }

        function updateState(networkId: number, patch: Partial<TimedResource<T>>) {
                const previous = getState(networkId);
                const next: TimedResource<T> = {
                        ...previous,
                        ...patch
                };
                states.set(networkId, next);
                const listeners = subscribers.get(networkId);
                if (listeners) {
                        listeners.forEach((listener) => listener(next));
                }
        }

        function clearTimer(networkId: number) {
                const state = getState(networkId);
                if (state.timerId) {
                        clearTimeout(state.timerId);
                }
                if (state.timerId !== null) {
                        updateState(networkId, { timerId: null });
                }
        }

        function schedule(networkId: number) {
                if (browserOnly && !browser) {
                        return;
                }
                const state = getState(networkId);
                clearTimer(networkId);
                if (autoPause && state.subscribers === 0) {
                        return;
                }
                const timerId = setTimeout(() => {
                        refresh(networkId).catch(() => {
                                // errors handled in refresh
                        });
                }, state.refreshInterval);
                updateState(networkId, { timerId });
        }

        function isStale(state: TimedResource<T>): boolean {
                if (state.updatedAt === null) {
                        return true;
                }
                return Date.now() - state.updatedAt >= state.refreshInterval;
        }

        async function refresh(networkId: number, options?: { force?: boolean }) {
                if (browserOnly && !browser) {
                        return;
                }

                const network = getNetworkById(networkId);
                if (!network) {
                        return;
                }

                const existing = inFlight.get(networkId);
                if (existing && !options?.force) {
                        return existing;
                }

                updateState(networkId, { status: 'loading', error: null });

                const request = (async () => {
                        try {
                                const data = await fetcher(network);
                                updateState(networkId, {
                                        status: 'ready',
                                        data,
                                        updatedAt: Date.now(),
                                        error: null
                                });
                        } catch (error) {
                                updateState(networkId, {
                                        status: 'error',
                                        error
                                });
                        } finally {
                                inFlight.delete(networkId);
                                schedule(networkId);
                        }
                })();

                inFlight.set(networkId, request);
                return request;
        }

        async function ensure(networkId: number, options?: { force?: boolean }) {
                if (browserOnly && !browser) {
                        return;
                }

                const state = getState(networkId);
                if (!options?.force) {
                        if (state.status === 'loading') {
                                return inFlight.get(networkId);
                        }
                        const inflight = inFlight.get(networkId);
                        if (inflight) {
                                return inflight;
                        }
                        if (state.status === 'ready' && !isStale(state)) {
                                if (!state.timerId) {
                                        schedule(networkId);
                                }
                                return;
                        }
                }

                return refresh(networkId, options);
        }

        function stop(networkId: number) {
                clearTimer(networkId);
        }

        function addSubscriber(networkId: number, listener: (value: TimedResource<T>) => void) {
                const set = subscribers.get(networkId) ?? new Set();
                set.add(listener);
                subscribers.set(networkId, set);
                const state = getState(networkId);
                const newSubscriberCount = state.subscribers + 1;
                updateState(networkId, { subscribers: newSubscriberCount });
                // If we just went from 0 subscribers to 1, fetch the data
                if (state.subscribers === 0) {
                        ensure(networkId).catch(() => {});
                }
        }

        function removeSubscriber(networkId: number, listener: (value: TimedResource<T>) => void) {
                const set = subscribers.get(networkId);
                if (set) {
                        set.delete(listener);
                        if (set.size === 0) {
                                subscribers.delete(networkId);
                        }
                }
                const state = getState(networkId);
                const nextCount = Math.max(0, state.subscribers - 1);
                updateState(networkId, { subscribers: nextCount });
                if (autoPause && nextCount === 0) {
                        stop(networkId);
                }
        }

        function getStore(networkId: number): Readable<TimedResource<T>> {
                const initial = getState(networkId);
                return readable(initial, (set) => {
                        const listener = (value: TimedResource<T>) => set(value);
                        addSubscriber(networkId, listener);
                        set(getState(networkId));
                        ensure(networkId).catch(() => {});
                        return () => {
                                removeSubscriber(networkId, listener);
                        };
                });
        }

        return {
                getStore,
                ensure,
                stop
        } satisfies PollingController<T>;
}
