import { RaindexClient } from '@rainlanguage/orderbook';
import { fetchJson } from '$lib/clients/http';

export const RAIN_STRATEGIES_COMMIT = 'b2e056bb58f0e467a515132ce7a1b25bc624bd09';
export const RAIN_STRATEGIES_URL = `https://raw.githubusercontent.com/rainlanguage/rain.strategies/${RAIN_STRATEGIES_COMMIT}/settings.yaml`;

// Cache the strategies YAML so we don’t refetch on every client creation.
let strategiesYamlPromise: Promise<string> | null = null;

async function getStrategiesYaml(): Promise<string> {
	if (!strategiesYamlPromise) {
		strategiesYamlPromise = fetchJson<string>(RAIN_STRATEGIES_URL);
	}
	return strategiesYamlPromise;
}

export async function createRaindexClient(): Promise<RaindexClient> {
	const yamlConfig = await getStrategiesYaml();
	const clientResult = await RaindexClient.new([yamlConfig]);
	if (clientResult.error) {
		throw new Error(`Failed to create RaindexClient: ${clientResult.error.readableMsg}`);
	}
	return clientResult.value;
}
