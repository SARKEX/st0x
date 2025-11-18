import { describe, it, expect, vi } from 'vitest';

const { domainKeys, mockedDefinitions, mockCreatePollingController, mockedControllers } =
	vi.hoisted(() => {
		const domainKeys = [
			'vaultSnapshot',
			'orderbookQuotes',
			'priceFeeds',
			'tradeActivity',
			'pendingTrades',
			'oracleQuotes'
		] as const;

		type Controller = {
			getStore: ReturnType<typeof vi.fn>;
			ensure: ReturnType<typeof vi.fn>;
			stop: ReturnType<typeof vi.fn>;
		};

		const mockedControllers = new Map<(typeof domainKeys)[number], Controller>();

		const mockedDefinitions = domainKeys.reduce(
			(acc, key) => {
				acc[key] = {
					refreshInterval: 1000,
					autoPause: false,
					fetcher: vi.fn()
				};
				return acc;
			},
			{} as Record<(typeof domainKeys)[number], Record<string, unknown>>
		);

		const mockCreatePollingController = vi.fn((options: Record<string, unknown>) => {
			const domain = domainKeys.find((key) => mockedDefinitions[key] === options);
			if (!domain) {
				throw new Error('Unknown domain definition');
			}
			const controller: Controller = {
				getStore: vi.fn().mockReturnValue(`${domain}-store`),
				ensure: vi.fn(),
				stop: vi.fn()
			};
			mockedControllers.set(domain, controller);
			return controller;
		});

		return {
			domainKeys,
			mockedDefinitions,
			mockCreatePollingController,
			mockedControllers
		};
	});

vi.mock('$lib/data/domains', () => ({
	DOMAIN_DEFINITIONS: mockedDefinitions
}));

vi.mock('$lib/data/polling-cache', () => ({
	createPollingController: mockCreatePollingController
}));

import { getResourceStore, ensureResource, stopResourceTimer } from '$lib/stores/network-data-cache';

describe('network-data-cache', () => {
	it('creates polling controllers for every domain', () => {
		expect(mockCreatePollingController).toHaveBeenCalledTimes(domainKeys.length);
		domainKeys.forEach((key) => {
			expect(mockCreatePollingController).toHaveBeenCalledWith(mockedDefinitions[key]);
			expect(mockedControllers.has(key)).toBe(true);
		});
	});

	it('delegates getResourceStore to the correct controller', () => {
		const controller = mockedControllers.get('vaultSnapshot');
		expect(controller).toBeDefined();
		controller?.getStore.mockClear();
		const result = getResourceStore(1, 'vaultSnapshot');
		expect(controller?.getStore).toHaveBeenCalledWith(1);
		expect(result).toBe('vaultSnapshot-store');
	});

	it('delegates ensureResource to the correct controller', () => {
		const controller = mockedControllers.get('orderbookQuotes');
		expect(controller).toBeDefined();
		controller?.ensure.mockClear();
		ensureResource(5, 'orderbookQuotes', { force: true });
		expect(controller?.ensure).toHaveBeenCalledWith(5, { force: true });
	});

	it('delegates stopResourceTimer to the correct controller', () => {
		const controller = mockedControllers.get('oracleQuotes');
		expect(controller).toBeDefined();
		controller?.stop.mockClear();
		stopResourceTimer(9, 'oracleQuotes');
		expect(controller?.stop).toHaveBeenCalledWith(9);
	});
});
