// Legacy cache API deprecated in favor of Tanstack Query. Placeholder for compatibility.
export type TimedResource<T> = {
	status: 'idle' | 'loading' | 'ready' | 'error';
	data: T | null;
	updatedAt: number | null;
	error: unknown | null;
	refreshInterval: number;
	timerId: ReturnType<typeof setTimeout> | null;
	subscribers: number;
};

export type DomainKey = never;

export function getResourceStore() {
	throw new Error('Polling cache removed; use Tanstack Query instead.');
}

export function ensureResource() {
	throw new Error('Polling cache removed; use Tanstack Query instead.');
}

export function stopResourceTimer() {
	return;
}
