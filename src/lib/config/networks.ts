import type { Token } from '$lib/types';
import type { CategorizedToken } from '$lib/config/tokens';
import {
	DEFAULT_PAYMENT_TOKENS,
	PAYMENT_TOKENS_BY_NETWORK,
	getDefaultPaymentTokenForNetwork,
	getPaymentTokensForNetwork
} from '$lib/config/tokens';
import { prepareBrowserRaindexSettings } from '$lib/clients/raindexSettings';
import {
	DotrainRegistry,
	RaindexClient,
	type NetworkCfg,
	type RaindexCfg
} from '@rainlanguage/raindex';
import { isMap, isScalar, parseDocument } from 'yaml';

export interface Network {
	id: number;
	chainId: number;
	name: string;
	raindexNetworkSlug: string;
	displayName: string;
	currencySymbol: string;
	blockExplorer: string;
	sftExplorer: string;
	blockExplorerIcon: string;
	rpcUrl: string;
	fallbackRpcUrls: string[];
	icon: string;
	subgraph_url: string;
	metadata_subgraph_url: string;
	orderbook_subgraph_url: string;
	orderbook_subgraph_urls_inactive: string[];
	subgraph_urls_legacy: string[];
	paymentTokens: Token[];
	defaultPaymentToken: Token;
	trustedOrderbooks: string[];
}

export const networks: Network[] = [];

function stringValue(value: unknown): string | undefined {
	if (isScalar(value)) return String(value.value).trim() || undefined;
	if (typeof value === 'string') return value.trim() || undefined;
	return undefined;
}

function titleFromSlug(slug: string): string {
	return slug
		.split(/[-_]/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function networkLabel(tokens: readonly CategorizedToken[], chainId: number, slug: string): string {
	for (const token of tokens) {
		if (token.chainId !== chainId) continue;
		const label = token.network?.label;
		if (typeof label === 'string' && label.trim()) return label.trim();
	}
	return titleFromSlug(slug);
}

function urlMap(document: ReturnType<typeof parseDocument>, key: string): Map<string, string> {
	const source = document.get(key, true);
	const result = new Map<string, string>();
	if (!isMap(source)) return result;
	for (const pair of source.items) {
		const name = stringValue(pair.key);
		const url = stringValue(pair.value);
		if (name && url) result.set(name, url);
	}
	return result;
}

function paymentTokensForChain(
	tokens: readonly CategorizedToken[],
	chainId: number
): CategorizedToken[] {
	return tokens.filter((token) => token.chainId === chainId && token.category === 'CRYPTO');
}

async function buildNetworkCatalogFromClient(
	settingsYaml: string,
	tokens: readonly CategorizedToken[],
	client: RaindexClient
): Promise<Network[]> {
	const document = parseDocument(settingsYaml, { schema: 'failsafe' });
	if (document.errors.length > 0) {
		throw new Error(`Registry settings YAML is invalid: ${document.errors[0].message}`);
	}

	const subgraphs = urlMap(document, 'subgraphs');
	const metaboards = urlMap(document, 'metaboards');
	const networkResult = client.getAllNetworks();
	if (networkResult.error) throw new Error(networkResult.error.readableMsg);
	const raindexResult = client.getAllRaindexes();
	if (raindexResult.error) throw new Error(raindexResult.error.readableMsg);
	const configuredNetworks = networkResult.value as Map<string, NetworkCfg>;
	const configuredRaindexes = raindexResult.value as Map<string, RaindexCfg>;
	const result: Network[] = [];

	for (const [slug, sdkNetwork] of configuredNetworks) {
		const chainId = sdkNetwork.chainId;
		if (!Number.isSafeInteger(chainId) || chainId <= 0) {
			throw new Error(`Registry network ${slug} has an invalid chain-id`);
		}

		const rpcs = sdkNetwork.rpcs.filter((url) => typeof url === 'string' && url.length > 0);
		if (rpcs.length === 0) {
			throw new Error(`Registry network ${slug} does not contain RPC URLs`);
		}

		const paymentTokens = paymentTokensForChain(tokens, chainId);
		const defaultPaymentToken =
			paymentTokens.find((token) => token.paymentToken) ??
			paymentTokens.find((token) => token.symbol.toUpperCase() === 'USDC') ??
			paymentTokens[0];
		if (!defaultPaymentToken) {
			throw new Error(`REST token catalog has no payment token for chain ${chainId}`);
		}

		const trustedOrderbooks: string[] = [];
		let orderbookSubgraph = '';
		for (const raindex of configuredRaindexes.values()) {
			if (raindex.network.chainId !== chainId) continue;
			trustedOrderbooks.push(raindex.address);
			if (!orderbookSubgraph) orderbookSubgraph = raindex.subgraph.url;
		}

		result.push({
			id: chainId,
			chainId,
			name: slug,
			raindexNetworkSlug: slug,
			displayName: sdkNetwork.label ?? networkLabel(tokens, chainId, slug),
			currencySymbol: sdkNetwork.currency ?? 'ETH',
			blockExplorer: 'https://blockscan.com',
			sftExplorer: 'https://blockscan.com',
			blockExplorerIcon: 'etherscan',
			rpcUrl: rpcs[0],
			fallbackRpcUrls: rpcs.slice(1),
			icon: 'ethereum',
			subgraph_url: subgraphs.get(`sft-${slug}`) ?? '',
			metadata_subgraph_url: metaboards.get(slug) ?? '',
			orderbook_subgraph_url: orderbookSubgraph,
			orderbook_subgraph_urls_inactive: [],
			subgraph_urls_legacy: [],
			paymentTokens,
			defaultPaymentToken,
			trustedOrderbooks
		});
	}

	if (result.length === 0) throw new Error('Registry settings contain no usable networks');
	return result.sort((left, right) => left.chainId - right.chainId);
}

/** Build a catalog from an already fetched settings document (primarily tests/tooling). */
export async function buildNetworkCatalog(
	settingsYaml: string,
	tokens: readonly CategorizedToken[]
): Promise<Network[]> {
	const clientResult = await RaindexClient.new([prepareBrowserRaindexSettings(settingsYaml)]);
	if (clientResult.error) {
		throw new Error(`Raindex SDK rejected registry settings: ${clientResult.error.readableMsg}`);
	}
	return buildNetworkCatalogFromClient(settingsYaml, tokens, clientResult.value);
}

/**
 * Build the live catalog through DotrainRegistry, the canonical SDK entry point.
 * It resolves the registry manifest, shared settings YAML, remote token sources,
 * networks, and raindexes as one immutable registry view.
 */
export async function buildNetworkCatalogFromRegistry(
	registryUrl: string,
	tokens: readonly CategorizedToken[]
): Promise<Network[]> {
	const registryResult = await DotrainRegistry.new(registryUrl);
	if (registryResult.error) {
		throw new Error(`Dotrain registry load failed: ${registryResult.error.readableMsg}`);
	}
	const registry = registryResult.value;
	// The public settings include local DB synchronization for the REST service.
	// Browsers/serverless requests do not provide that database implementation,
	// so pass the SDK-resolved settings through the established browser-safe view.
	const clientResult = await RaindexClient.new([prepareBrowserRaindexSettings(registry.settings)]);
	if (clientResult.error) {
		throw new Error(`Dotrain registry settings failed: ${clientResult.error.readableMsg}`);
	}
	return buildNetworkCatalogFromClient(registry.settings, tokens, clientResult.value);
}

export function replaceNetworkCatalog(nextNetworks: readonly Network[]): void {
	networks.splice(0, networks.length, ...nextNetworks);
}

export function getNetworkById(id: number): Network | undefined {
	return networks.find((network) => network.id === id);
}

export function getNetworkByChainId(chainId: number): Network | undefined {
	return networks.find((network) => network.chainId === chainId);
}

export function getNetworkByName(name: string): Network | undefined {
	return networks.find((network) => network.name === name);
}

export {
	DEFAULT_PAYMENT_TOKENS,
	getDefaultPaymentTokenForNetwork,
	getPaymentTokensForNetwork,
	PAYMENT_TOKENS_BY_NETWORK
};
