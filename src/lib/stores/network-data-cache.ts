import type { Readable } from 'svelte/store';
import {
        DOMAIN_DEFINITIONS,
        type DomainKey,
        type DomainPayloads,
        type OrderbookQuoteCache,
        type TradeMetricPayload
} from '$lib/data/domains';
import {
        createPollingController,
        type PollingController,
        type TimedResource
} from '$lib/data/polling-cache';

type ControllerMap = { [K in DomainKey]: PollingController<DomainPayloads[K]> };

const controllers: ControllerMap = {
        vaultSnapshot: createPollingController(DOMAIN_DEFINITIONS.vaultSnapshot),
        orderbookQuotes: createPollingController(DOMAIN_DEFINITIONS.orderbookQuotes),
        priceFeeds: createPollingController(DOMAIN_DEFINITIONS.priceFeeds),
        tradeActivity: createPollingController(DOMAIN_DEFINITIONS.tradeActivity)
};

export type { TimedResource, OrderbookQuoteCache, TradeMetricPayload, DomainKey };

export function getResourceStore<K extends DomainKey>(networkId: number, domain: K): Readable<TimedResource<DomainPayloads[K]>> {
        return controllers[domain].getStore(networkId);
}

export function ensureResource(networkId: number, domain: DomainKey, options?: { force?: boolean }) {
        return controllers[domain].ensure(networkId, options);
}

export function stopResourceTimer(networkId: number, domain: DomainKey) {
        controllers[domain].stop(networkId);
}

