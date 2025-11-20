import type { Readable } from 'svelte/store';
import {
	DOMAIN_DEFINITIONS,
	type DomainKey,
	type DomainPayloads,
	type TradeMetricPayload,
	type PendingTradePayload,
	type OracleQuote
} from '$lib/api/domains';
import {
	createPollingController,
	type PollingController,
	type TimedResource
} from '$lib/stores/polling';

type ControllerMap = { [K in DomainKey]: PollingController<DomainPayloads[K]> };

const controllers: ControllerMap = {
	vaultSnapshot: createPollingController(DOMAIN_DEFINITIONS.vaultSnapshot),
	priceFeeds: createPollingController(DOMAIN_DEFINITIONS.priceFeeds),
	tradeActivity: createPollingController(DOMAIN_DEFINITIONS.tradeActivity),
	pendingTrades: createPollingController(DOMAIN_DEFINITIONS.pendingTrades),
	oracleQuotes: createPollingController(DOMAIN_DEFINITIONS.oracleQuotes)
};

export type {
	TimedResource,
	TradeMetricPayload,
	PendingTradePayload,
	DomainKey,
	OracleQuote
};

export function getResourceStore<K extends DomainKey>(
	networkId: number,
	domain: K
): Readable<TimedResource<DomainPayloads[K]>> {
	return controllers[domain].getStore(networkId);
}

export function ensureResource(
	networkId: number,
	domain: DomainKey,
	options?: { force?: boolean }
) {
	return controllers[domain].ensure(networkId, options);
}

export function stopResourceTimer(networkId: number, domain: DomainKey) {
	controllers[domain].stop(networkId);
}
