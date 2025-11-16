import { RaindexClient } from '@rainlanguage/orderbook';

/**
 * RaindexClient Utility Functions
 *
 * This module provides centralized functions for creating and managing RaindexClient instances.
 * It centralizes the configuration and error handling for RaindexClient creation.
 *
 * Key Features:
 * - Standardized client creation with consistent error handling
 * - Centralized configuration management
 * - Easy to update Raindex strategies commit hash
 * - Reusable across different components
 */

export const RAIN_STRATEGIES_COMMIT = 'b2e056bb58f0e467a515132ce7a1b25bc624bd09';
export const RAIN_STRATEGIES_URL = `https://raw.githubusercontent.com/rainlanguage/rain.strategies/${RAIN_STRATEGIES_COMMIT}/settings.yaml`;

/**
 * Creates a new RaindexClient instance with the standard configuration
 * @returns Promise<RaindexClient> - The initialized RaindexClient instance
 * @throws Error if the client creation fails
 */
export async function createRaindexClient(): Promise<RaindexClient> {
	try {
		const response = await fetch(RAIN_STRATEGIES_URL);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch Raindex configuration: ${response.status} ${response.statusText}`
			);
		}

		const yamlConfig = await response.text();
		const clientResult = await RaindexClient.new([yamlConfig]);

		if (clientResult.error) {
			throw new Error(`Failed to create RaindexClient: ${clientResult.error.readableMsg}`);
		}

		return clientResult.value;
	} catch (error) {
		console.error('Error creating RaindexClient:', error);
		throw new Error(
			`Failed to initialize RaindexClient: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`
		);
	}
}

/**
 * Creates a RaindexClient with a custom YAML configuration
 * @param yamlConfig - Custom YAML configuration string
 * @returns Promise<RaindexClient> - The initialized RaindexClient instance
 * @throws Error if the client creation fails
 */
export async function createRaindexClientWithConfig(yamlConfig: string): Promise<RaindexClient> {
	try {
		const clientResult = await RaindexClient.new([yamlConfig]);

		if (clientResult.error) {
			throw new Error(`Failed to create RaindexClient: ${clientResult.error.readableMsg}`);
		}

		return clientResult.value;
	} catch (error) {
		console.error('Error creating RaindexClient with custom config:', error);
		throw new Error(
			`Failed to initialize RaindexClient: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`
		);
	}
}

/**
 * Gets the current Raindex strategies commit hash
 * @returns string - The current commit hash
 */
export function getRainStrategiesCommit(): string {
	return RAIN_STRATEGIES_COMMIT;
}

/**
 * Gets the current Raindex strategies URL
 * @returns string - The current URL
 */
export function getRainStrategiesUrl(): string {
	return RAIN_STRATEGIES_URL;
}
