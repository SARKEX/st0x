import { writable, type Readable } from 'svelte/store';

export type DebouncedValue<T> = Readable<T> & {
	set(value: T): void;
	setImmediately(value: T): void;
	destroy(): void;
};

/** A small lifecycle-aware store for debouncing request inputs. */
export function createDebouncedValue<T>(initialValue: T, delayMs: number): DebouncedValue<T> {
	const store = writable(initialValue);
	let timeout: ReturnType<typeof setTimeout> | null = null;

	function clearPending() {
		if (timeout !== null) {
			clearTimeout(timeout);
			timeout = null;
		}
	}

	return {
		subscribe: store.subscribe,
		set(value) {
			clearPending();
			timeout = setTimeout(() => {
				timeout = null;
				store.set(value);
			}, delayMs);
		},
		setImmediately(value) {
			clearPending();
			store.set(value);
		},
		destroy: clearPending
	};
}
