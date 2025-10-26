import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TimedResource } from './polling-cache';

const { browserState, mockGetNetworkById } = vi.hoisted(() => ({
	browserState: { value: true },
	mockGetNetworkById: vi.fn()
}));

vi.mock('$app/environment', () => ({
	get browser() {
		return browserState.value;
	}
}));

vi.mock('$lib/network', () => ({
	getNetworkById: mockGetNetworkById
}));

import { createPollingController } from './polling-cache';

describe('createPollingController', () => {
	const network = {
		id: 1,
		chainId: 1,
		displayName: 'Test Network'
	};

	beforeEach(() => {
		browserState.value = true;
		mockGetNetworkById.mockImplementation((id: number) =>
			id === network.id ? network : undefined
		);
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.resetAllMocks();
	});

	it('fetches data when a subscriber attaches and updates the store state', async () => {
		const fetcher = vi.fn().mockResolvedValue('payload');
		const controller = createPollingController<string>({
			refreshInterval: 1000,
			autoPause: false,
			fetcher
		});

		const store = controller.getStore(network.id);
		const states: TimedResource<string>[] = [];
		const unsubscribe = store.subscribe((value) => {
			states.push(value);
		});

		await controller.ensure(network.id);

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(states[0]?.status).toBe('loading');
		expect(states.some((state) => state.status === 'loading')).toBe(true);
		const lastState = states.at(-1);
		expect(lastState?.status).toBe('ready');
		expect(lastState?.data).toBe('payload');
		expect(lastState?.updatedAt).toBe(Number(new Date('2024-01-01T00:00:00.000Z')));

		unsubscribe();
	});

	it('deduplicates concurrent ensure calls', async () => {
		let resolveFetcher: (value: string) => void;
		const fetcherPromise = new Promise<string>((resolve) => {
			resolveFetcher = resolve;
		});
		const fetcher = vi.fn().mockReturnValue(fetcherPromise);
		const controller = createPollingController<string>({
			refreshInterval: 1000,
			autoPause: false,
			fetcher
		});

		const first = controller.ensure(network.id);
		const second = controller.ensure(network.id);

		expect(fetcher).toHaveBeenCalledTimes(1);

		resolveFetcher!('payload');
		await Promise.all([first, second]);
	});

	it('forces a refresh when requested', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
		const controller = createPollingController<string>({
			refreshInterval: 1000,
			autoPause: false,
			fetcher
		});

		const first = controller.ensure(network.id);
		const second = controller.ensure(network.id, { force: true });

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(first).not.toBe(second);

		await Promise.all([first, second]);
	});

	it('schedules periodic refreshes and stops when autoPause triggers', async () => {
		const fetcher = vi.fn().mockResolvedValue('value');
		const controller = createPollingController<string>({
			refreshInterval: 5000,
			autoPause: true,
			fetcher
		});

		const store = controller.getStore(network.id);
		const unsubscribe = store.subscribe(() => {});

		await controller.ensure(network.id);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(1);

		unsubscribe();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('does not fetch when the network is unknown', async () => {
		mockGetNetworkById.mockReturnValue(undefined);
		const fetcher = vi.fn();
		const controller = createPollingController<string>({
			refreshInterval: 1000,
			autoPause: false,
			fetcher
		});

		await controller.ensure(999);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('respects the browserOnly flag', async () => {
		browserState.value = false;
		const fetcher = vi.fn();
		const controller = createPollingController<string>({
			refreshInterval: 1000,
			autoPause: false,
			browserOnly: true,
			fetcher
		});

		await controller.ensure(network.id);
		expect(fetcher).not.toHaveBeenCalled();
	});
});
