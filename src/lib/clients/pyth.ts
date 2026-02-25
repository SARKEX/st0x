import { fetchJson } from '$lib/clients/http';
import { HERMES_BASE_URL } from '$lib/config/constants';

export interface HermesPriceData {
	price: number | string;
	expo: number;
	conf?: number | string;
	publish_time?: number | string;
}

export interface HermesEntry {
	id: string;
	price: HermesPriceData | null;
	publish_time?: number | string;
}

export interface HermesResponse {
	parsed?: HermesEntry[];
}

const normaliseFeedId = (feedId: string) => feedId.replace(/^0x/, '').toLowerCase();

export async function fetchLatestPrices(feedIds: string[]): Promise<Map<string, HermesEntry>> {
	const normalizedIds = feedIds.map(normaliseFeedId);
	if (!normalizedIds.length) return new Map();

	const idsParams = normalizedIds.map((id) => `ids[]=${id}`).join('&');
	const url = `${HERMES_BASE_URL}/latest?${idsParams}`;

	const result = new Map<string, HermesEntry>();
	try {
		const data = await fetchJson<HermesResponse>(url);
		data.parsed?.forEach((entry) => {
			result.set(normaliseFeedId(entry.id), entry);
		});
	} catch {
		// swallow – caller should handle missing entries
	}

	return result;
}
