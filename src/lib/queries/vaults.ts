import {
	createQuery,
	createInfiniteQuery,
	type QueryClient,
	type InfiniteData
} from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import type { Network } from '$lib/config/network';
import {
	apiGetTokenDetails,
	apiGetTokenDetailsByAddress,
	type ApiTokenDetails,
	type ApiTokenDetailsActivityRow,
	type ApiTokenDetailsSummary
} from '$lib/api/st0xApi';
import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
import { queryClient } from '$lib/clients/queryClient';
import { createRaindexClient } from '$lib/clients/raindex';
import type { RaindexVault, SgVault } from '@rainlanguage/orderbook';

// =============================================================================
// SFT/Token Queries (OffchainAssetReceiptVault - the tokenized assets)
// =============================================================================

function toReceiptActivity(row: ApiTokenDetailsActivityRow) {
	return {
		id: row.id,
		transaction: { id: row.txHash },
		emitter: { address: row.caller },
		receipt: {
			id: row.receiptId,
			receiptId: row.receiptId,
			receiptInformations: []
		},
		amount: row.amount,
		caller: { address: row.caller },
		timestamp: String(row.timestamp)
	};
}

function tokenDetailsSummaryToVault(
	summary: ApiTokenDetailsSummary,
	detail?: ApiTokenDetails,
	chainId?: number
): OffchainAssetReceiptVault {
	return {
		id: summary.address,
		totalShares: summary.totalSupply,
		holderCount: summary.holderCount,
		transferCount: summary.transferCount,
		bridgedSupply: summary.bridgedSupply,
		depositVolume: summary.depositVolume,
		withdrawVolume: summary.withdrawVolume,
		activityVolume: summary.activityVolume,
		sftVaultAddress: detail?.sftVaultAddress,
		address: summary.address as `0x${string}`,
		deployer: detail?.deployer ?? '',
		admin: detail?.admin ?? '',
		name: summary.name,
		symbol: summary.symbol,
		deployTimestamp: detail ? String(detail.deployTimestamp) : '',
		receiptContractAddress: summary.receiptContractAddress ?? '',
		tokenHolders: [],
		receiptVaultInformations: [],
		withdraws: detail?.activity.withdraws.map(toReceiptActivity) ?? [],
		deposits: detail?.activity.deposits.map(toReceiptActivity) ?? [],
		shareTransfers: [],
		chainId
	};
}

export function createSftsQuery(network: Network | null) {
	return createQuery<OffchainAssetReceiptVault[]>({
		queryKey: ['sfts', network?.id],
		enabled: Boolean(browser && network),
		staleTime: Infinity,
		refetchInterval: false,
		queryFn: async () => {
			const response = await apiGetTokenDetails();
			if (response.errors.length) {
				console.warn('Some token details failed to load', response.errors);
			}
			return response.data.map((summary) =>
				tokenDetailsSummaryToVault(summary, undefined, network?.chainId)
			);
		}
	});
}

/**
 * Query for a single SFT/token by ID.
 * Checks the global SFTs cache first - if found, uses that data.
 */
export function createSingleSftQuery(
	tokenId: string | null,
	network: Network | null,
	qc?: QueryClient
) {
	const getCachedToken = (): OffchainAssetReceiptVault | undefined => {
		const client = qc ?? queryClient;
		if (!tokenId || !network) return undefined;
		const allSfts = client.getQueryData<OffchainAssetReceiptVault[]>(['sfts', network.id]);
		const normalized = tokenId.toLowerCase();
		// Match by id, address, or wrappedTokenContractAddress since the new subgraph
		// uses the unwrapped address as the entity id
		return allSfts?.find(
			(v) =>
				v.id.toLowerCase() === normalized ||
				v.address?.toLowerCase() === normalized ||
				(
					v as { wrappedTokenContractAddress?: string }
				).wrappedTokenContractAddress?.toLowerCase() === normalized
		);
	};

	const getCachedTimestamp = (): number | undefined => {
		const client = qc ?? queryClient;
		if (!network) return undefined;
		return client.getQueryState(['sfts', network.id])?.dataUpdatedAt;
	};

	return createQuery<OffchainAssetReceiptVault | null>({
		queryKey: ['sft', network?.id, tokenId],
		enabled: Boolean(browser && network && tokenId),
		staleTime: 30_000,
		refetchInterval: false,
		refetchOnWindowFocus: true, // Only refetch on focus if stale
		initialData: getCachedToken() ?? undefined,
		initialDataUpdatedAt: getCachedTimestamp(),
		queryFn: async () => {
			if (!network || !tokenId) return null;
			const detail = await apiGetTokenDetailsByAddress(tokenId, { activityLimit: 5 });
			return tokenDetailsSummaryToVault(detail, detail, network.chainId);
		}
	});
}

// =============================================================================
// User Deposit Vault Queries (RaindexVault - user's token holdings in orderbook)
// =============================================================================

export type UserVaultData = {
	vault: SgVault;
	raindexVault: RaindexVault;
	subgraphName: string;
};

export type UserVaultsPage = {
	vaults: UserVaultData[];
	hasMore: boolean;
};

/**
 * Creates the global user deposit vaults query.
 * This is the single source of truth for all user vault positions.
 *
 * @param network - Current network
 * @param signerAddress - User's wallet address
 */
export function createUserVaultsQuery(network: Network | null, signerAddress: string | null) {
	return createInfiniteQuery<
		UserVaultsPage,
		Error,
		InfiniteData<UserVaultsPage, number>,
		unknown[],
		number
	>({
		queryKey: ['userVaults', network?.id, signerAddress],
		initialPageParam: 0,
		staleTime: Infinity, // Only invalidated manually after order deployment
		refetchOnMount: true,
		refetchInterval: false,
		refetchOnWindowFocus: false,
		refetchIntervalInBackground: false,
		queryFn: async ({ pageParam }) => {
			if (!network || !signerAddress) {
				return { vaults: [], hasMore: false };
			}
			return fetchUserVaultsPage(network.id, signerAddress, pageParam, network.raindexNetworkSlug);
		},
		getNextPageParam: (lastPage: UserVaultsPage, _allPages, lastPageParam: number) => {
			return lastPage.hasMore ? lastPageParam + 1 : undefined;
		},
		enabled: Boolean(network && signerAddress)
	});
}

/**
 * Get user vaults filtered by token address from the global cache.
 */
export function getUserVaultsForToken(
	networkId: number,
	signerAddress: string,
	tokenAddress: string
): UserVaultData[] {
	const globalCache = queryClient.getQueryData<{ pages: UserVaultsPage[] }>([
		'userVaults',
		networkId,
		signerAddress
	]);

	if (!globalCache?.pages) return [];

	const normalizedToken = tokenAddress.toLowerCase();
	const allVaults = globalCache.pages.flatMap((p) => p.vaults);

	return allVaults.filter((v) => v.vault.token.address?.toLowerCase() === normalizedToken);
}

/**
 * Invalidate user vault queries.
 * @param networkId - Network ID
 * @param signerAddress - User address
 * @param tokenAddress - Optional token address. If provided, triggers a targeted refetch.
 *                       If omitted, resets the entire cache.
 */
export function invalidateUserVaultQueries(
	networkId?: number,
	signerAddress?: string,
	tokenAddress?: string
) {
	if (tokenAddress) {
		// For token-specific, we still need to refetch since vaults are paginated
		// and we can't easily merge. Just invalidate the whole cache.
		queryClient.invalidateQueries({ queryKey: ['userVaults', networkId, signerAddress] });
	} else {
		queryClient.resetQueries({ queryKey: ['userVaults'] });
	}
}

/**
 * Prefetch global user vaults cache in the background.
 */
export async function prefetchUserVaults(networkId: number, signerAddress: string) {
	const existing = queryClient.getQueryData<{ pages: UserVaultsPage[] }>([
		'userVaults',
		networkId,
		signerAddress
	]);

	if (existing?.pages?.length) {
		return;
	}

	// Get network for subgraph name
	const { networks } = await import('$lib/config/network');
	const network = networks.find((n) => n.id === networkId);
	if (!network) return;

	await queryClient.prefetchInfiniteQuery({
		queryKey: ['userVaults', networkId, signerAddress],
		initialPageParam: 0,
		queryFn: async ({ pageParam }: { pageParam: number }) => {
			return fetchUserVaultsPage(networkId, signerAddress, pageParam, network.raindexNetworkSlug);
		},
		staleTime: Infinity
	});
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Transform RaindexVault to UserVaultData.
 * Shared by query and prefetch functions.
 */
export function transformVault(vault: RaindexVault, subgraphName: string): UserVaultData {
	const vaultBalanceFloat = vault.balance.toFixedDecimalLossy(Number(vault.token.decimals));
	if (vaultBalanceFloat.error) throw new Error(vaultBalanceFloat.error.readableMsg);

	const sgVault: SgVault = {
		id: vault.id as `0x${string}`,
		owner: vault.owner,
		vaultId: `0x${vault.vaultId.toString(16).padStart(64, '0')}`,
		balance: vaultBalanceFloat.value!.value.toString(),
		token: {
			id: vault.token.id as `0x${string}`,
			address: (vault.token.address ?? vault.token.id) as `0x${string}`,
			name: vault.token.name,
			symbol: vault.token.symbol,
			decimals: vault.token.decimals.toString() as `0x${string}`
		},
		orderbook: {
			id: vault.orderbook
		},
		ordersAsOutput: vault.ordersAsOutput,
		ordersAsInput: vault.ordersAsInput,
		balanceChanges: []
	};

	return {
		vault: sgVault,
		raindexVault: vault,
		subgraphName
	};
}

/**
 * Fetch a page of user vaults from the API.
 * Shared by query and prefetch functions.
 */
export async function fetchUserVaultsPage(
	networkId: number,
	signerAddress: string,
	pageParam: number,
	subgraphName: string
): Promise<UserVaultsPage> {
	const client = await createRaindexClient();
	const vaultsResult = await client.getVaults(
		[networkId],
		{
			owners: [signerAddress.toLowerCase() as `0x${string}`],
			hideZeroBalance: false
		},
		pageParam + 1
	);

	if (vaultsResult.error) {
		throw new Error(vaultsResult.error.readableMsg);
	}

	const vaultsArray: RaindexVault[] = vaultsResult.value.items || [];
	const vaults = vaultsArray.map((v) => transformVault(v, subgraphName));

	return {
		vaults,
		hasMore: vaults.length === 1000
	};
}
