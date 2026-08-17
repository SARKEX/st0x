import { writable, type Readable } from 'svelte/store';

export type DebouncedRequestState<T> = {
	request: T | null;
	revision: number;
};

export type DebouncedRequest<T> = Readable<DebouncedRequestState<T>> & {
	set(request: T | null): void;
	destroy(): void;
};

/**
 * Debounce request payloads while invalidating the current revision immediately.
 * Semantically identical JSON payloads retain their revision and active request.
 */
export function createDebouncedRequest<T>(delayMs: number): DebouncedRequest<T> {
	const store = writable<DebouncedRequestState<T>>({ request: null, revision: 0 });
	let timeout: ReturnType<typeof setTimeout> | null = null;
	let revision = 0;
	let fingerprint: string | null = null;

	function clearPending() {
		if (timeout !== null) {
			clearTimeout(timeout);
			timeout = null;
		}
	}

	return {
		subscribe: store.subscribe,
		set(request) {
			const nextFingerprint = request === null ? null : JSON.stringify(request);
			if (nextFingerprint === fingerprint) return;

			clearPending();
			fingerprint = nextFingerprint;
			revision += 1;
			// Changing the revision detaches the query observer from the previous
			// request immediately, before the next request finishes debouncing.
			store.set({ request: null, revision });
			if (request === null) return;

			timeout = setTimeout(() => {
				timeout = null;
				store.set({ request, revision });
			}, delayMs);
		},
		destroy: clearPending
	};
}
