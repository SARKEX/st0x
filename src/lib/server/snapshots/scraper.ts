// Scraper for fetching SFT transfers from the subgraph
// Modeled after albion.rewards/src/processor.ts

import { networks } from '$lib/config/networks';
import { TOKENS, getAllTokenAddressesFlat } from '$lib/config/tokens';
import type {
	Transfer,
	SubgraphTransfer,
	SubgraphDeposit,
	SubgraphWithdrawal,
	SubgraphWrappedTokenTransfer
} from './types';

const BATCH_SIZE = 1000;

// Get SFT subgraph URLs from network config (current + legacy)
const SFT_SUBGRAPH_URL = networks[0].subgraph_url;
const SFT_SUBGRAPH_URLS_LEGACY = networks[0].subgraph_urls_legacy ?? [];

// Get all token addresses from config (lowercase)
export const TOKEN_ADDRESSES = TOKENS.map((t) => t.address.toLowerCase());

// All token addresses including unwrapped and legacy (for expanded snapshots)
export const ALL_TOKEN_ADDRESSES = getAllTokenAddressesFlat();

/**
 * Fetch transfers from a specific SFT subgraph up to a specific block
 */
async function fetchTransfers(
	subgraphUrl: string,
	skip: number,
	untilBlock: number,
	tokenAddresses: string[]
): Promise<SubgraphTransfer[]> {
	const query = `
		query getTransfers(
			$skip: Int!
			$first: Int!
			$untilBlock: BigInt!
			$vaultAddresses: [String!]!
		) {
			sharesTransfers(
				skip: $skip
				first: $first
				orderBy: transaction__blockNumber
				orderDirection: asc
				where: {
					offchainAssetReceiptVault_in: $vaultAddresses,
					transaction_: {blockNumber_lte: $untilBlock}
				}
			) {
				id
				timestamp
				transaction {
					id
					blockNumber
					timestamp
				}
				from {
					address
				}
				to {
					address
				}
				value
				valueExact
				offchainAssetReceiptVault {
					id
				}
			}
		}
	`;

	const response = await fetch(subgraphUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query,
			variables: {
				skip,
				first: BATCH_SIZE,
				untilBlock: untilBlock.toString(),
				vaultAddresses: tokenAddresses
			}
		})
	});

	if (!response.ok) {
		throw new Error(`Subgraph request failed: ${response.status}`);
	}

	const data = await response.json();
	if (data.errors) {
		throw new Error(`GraphQL error: ${data.errors[0]?.message}`);
	}

	return data.data?.sharesTransfers || [];
}

/**
 * Fetch deposits (mints) from a specific SFT subgraph up to a specific block
 */
async function fetchDeposits(
	subgraphUrl: string,
	skip: number,
	untilBlock: number,
	tokenAddresses: string[]
): Promise<SubgraphDeposit[]> {
	const query = `
		query getDeposits($skip: Int!, $first: Int!, $untilBlock: Int!, $vaultAddresses: [String!]!) {
			depositWithReceipts(
				skip: $skip
				first: $first
				orderBy: transaction__blockNumber
				orderDirection: asc
				where: {
					offchainAssetReceiptVault_in: $vaultAddresses,
					transaction_: {blockNumber_lte: $untilBlock}
				}
			) {
				id
				emitter {
					address
				}
				amount
				offchainAssetReceiptVault {
					id
				}
				transaction {
					id
					timestamp
					blockNumber
				}
			}
		}
	`;

	const response = await fetch(subgraphUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query,
			variables: {
				skip,
				first: BATCH_SIZE,
				untilBlock,
				vaultAddresses: tokenAddresses
			}
		})
	});

	if (!response.ok) {
		throw new Error(`Subgraph request failed: ${response.status}`);
	}

	const data = await response.json();
	if (data.errors) {
		throw new Error(`GraphQL error: ${data.errors[0]?.message}`);
	}

	return data.data?.depositWithReceipts || [];
}

/**
 * Fetch withdrawals (burns) from a specific SFT subgraph up to a specific block
 */
async function fetchWithdrawals(
	subgraphUrl: string,
	skip: number,
	untilBlock: number,
	tokenAddresses: string[]
): Promise<SubgraphWithdrawal[]> {
	const query = `
		query getWithdrawals($skip: Int!, $first: Int!, $untilBlock: Int!, $vaultAddresses: [String!]!) {
			withdrawWithReceipts(
				skip: $skip
				first: $first
				orderBy: transaction__blockNumber
				orderDirection: asc
				where: {
					offchainAssetReceiptVault_in: $vaultAddresses,
					transaction_: {blockNumber_lte: $untilBlock}
				}
			) {
				id
				owner {
					address
				}
				amount
				offchainAssetReceiptVault {
					id
				}
				transaction {
					id
					timestamp
					blockNumber
				}
			}
		}
	`;

	const response = await fetch(subgraphUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query,
			variables: {
				skip,
				first: BATCH_SIZE,
				untilBlock,
				vaultAddresses: tokenAddresses
			}
		})
	});

	if (!response.ok) {
		throw new Error(`Subgraph request failed: ${response.status}`);
	}

	const data = await response.json();
	if (data.errors) {
		throw new Error(`GraphQL error: ${data.errors[0]?.message}`);
	}

	return data.data?.withdrawWithReceipts || [];
}

/**
 * Fetch wrapped token (ERC20) transfers from a specific SFT subgraph up to a specific block.
 * These track movements of wrapped tokens (e.g. wtNVDA) which are invisible to sharesTransfers.
 * Note: from/to are plain address strings, not nested objects like in sharesTransfers.
 */
async function fetchWrappedTokenTransfers(
	subgraphUrl: string,
	skip: number,
	untilBlock: number,
	tokenAddresses: string[]
): Promise<SubgraphWrappedTokenTransfer[]> {
	const query = `
		query getWrappedTokenTransfers(
			$skip: Int!
			$first: Int!
			$untilBlock: BigInt!
			$vaultAddresses: [String!]!
		) {
			wrappedTokenTransfers(
				skip: $skip
				first: $first
				orderBy: transaction__blockNumber
				orderDirection: asc
				where: {
					offchainAssetReceiptVault_in: $vaultAddresses,
					transaction_: {blockNumber_lte: $untilBlock}
				}
			) {
				id
				from
				to
				value
				transaction {
					id
					blockNumber
					timestamp
				}
				offchainAssetReceiptVault {
					id
					wrappedTokenContractAddress
				}
			}
		}
	`;

	const response = await fetch(subgraphUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query,
			variables: {
				skip,
				first: BATCH_SIZE,
				untilBlock: untilBlock.toString(),
				vaultAddresses: tokenAddresses
			}
		})
	});

	if (!response.ok) {
		throw new Error(`Subgraph request failed: ${response.status}`);
	}

	const data = await response.json();
	if (data.errors) {
		throw new Error(`GraphQL error: ${data.errors[0]?.message}`);
	}

	return data.data?.wrappedTokenTransfers || [];
}

/**
 * Fetch all transfers, deposits, withdrawals, and wrapped token transfers from a single subgraph URL
 */
async function fetchFromSubgraph(
	subgraphUrl: string,
	untilBlock: number,
	tokenAddresses: string[]
): Promise<Transfer[]> {
	let transfersSkip = 0;
	let depositsSkip = 0;
	let withdrawalsSkip = 0;
	let wrappedSkip = 0;
	let transfersHasMore = true;
	let depositsHasMore = true;
	let withdrawalsHasMore = true;
	let wrappedHasMore = true;
	const allTransfers: Transfer[] = [];

	while (transfersHasMore || depositsHasMore || withdrawalsHasMore || wrappedHasMore) {
		const [transfersBatch, depositsBatch, withdrawalsBatch, wrappedBatch]: [
			SubgraphTransfer[],
			SubgraphDeposit[],
			SubgraphWithdrawal[],
			SubgraphWrappedTokenTransfer[]
		] = await Promise.all([
			transfersHasMore
				? fetchTransfers(subgraphUrl, transfersSkip, untilBlock, tokenAddresses)
				: Promise.resolve([]),
			depositsHasMore
				? fetchDeposits(subgraphUrl, depositsSkip, untilBlock, tokenAddresses)
				: Promise.resolve([]),
			withdrawalsHasMore
				? fetchWithdrawals(subgraphUrl, withdrawalsSkip, untilBlock, tokenAddresses)
				: Promise.resolve([]),
			wrappedHasMore
				? fetchWrappedTokenTransfers(subgraphUrl, wrappedSkip, untilBlock, tokenAddresses).catch(
						(err) => {
							const message = err instanceof Error ? err.message : String(err);
							const isMissingEntity =
								/Cannot query field\s+"wrappedTokenTransfers"/i.test(message) ||
								/Unknown field.*wrappedTokenTransfers/i.test(message);

							if (isMissingEntity) {
								// Legacy subgraphs (v1.0.5) may not have wrappedTokenTransfers entity
								console.warn(`[Scraper] wrappedTokenTransfers not available: ${message}`);
								wrappedHasMore = false;
								return [] as SubgraphWrappedTokenTransfer[];
							}

							throw err;
						}
					)
				: Promise.resolve([])
		]);

		// Process transfers
		const processedTransfers: Transfer[] = transfersBatch.map((t: SubgraphTransfer) => ({
			tokenAddress: t.offchainAssetReceiptVault.id.toLowerCase(),
			from: t.from.address.toLowerCase(),
			to: t.to.address.toLowerCase(),
			value: t.valueExact,
			blockNumber: parseInt(t.transaction.blockNumber),
			timestamp: parseInt(t.transaction.timestamp)
		}));

		// Process deposits as mints (from address = 0x0)
		const processedDeposits: Transfer[] = depositsBatch.map((d: SubgraphDeposit) => ({
			tokenAddress: d.offchainAssetReceiptVault.id.toLowerCase(),
			from: '0x0000000000000000000000000000000000000000',
			to: d.emitter.address.toLowerCase(),
			value: d.amount,
			blockNumber: parseInt(d.transaction.blockNumber),
			timestamp: parseInt(d.transaction.timestamp)
		}));

		// Process withdrawals as burns (to address = 0x0)
		const processedWithdrawals: Transfer[] = withdrawalsBatch.map(
			(w: SubgraphWithdrawal) => ({
				tokenAddress: w.offchainAssetReceiptVault.id.toLowerCase(),
				from: w.owner.address.toLowerCase(),
				to: '0x0000000000000000000000000000000000000000',
				value: w.amount,
				blockNumber: parseInt(w.transaction.blockNumber),
				timestamp: parseInt(w.transaction.timestamp)
			})
		);

		// Process wrapped token transfers (ERC20 transfers of wrapped tokens like wtNVDA)
		// tokenAddress = wrappedTokenContractAddress (the ERC20 wrapper, not the vault)
		const processedWrapped: Transfer[] = wrappedBatch
			.filter((w) => !!w.offchainAssetReceiptVault.wrappedTokenContractAddress)
			.map((w: SubgraphWrappedTokenTransfer) => ({
			tokenAddress: w.offchainAssetReceiptVault.wrappedTokenContractAddress.toLowerCase(),
			from: w.from.toLowerCase(),
			to: w.to.toLowerCase(),
			value: w.value,
			blockNumber: parseInt(w.transaction.blockNumber),
			timestamp: parseInt(w.transaction.timestamp)
		}));

		allTransfers.push(
			...processedTransfers,
			...processedDeposits,
			...processedWithdrawals,
			...processedWrapped
		);

		console.log(
			`[Scraper] Batch: ${transfersBatch.length} transfers, ${depositsBatch.length} deposits, ${withdrawalsBatch.length} withdrawals, ${wrappedBatch.length} wrapped`
		);

		// Update pagination
		transfersHasMore = transfersBatch.length === BATCH_SIZE;
		depositsHasMore = depositsBatch.length === BATCH_SIZE;
		withdrawalsHasMore = withdrawalsBatch.length === BATCH_SIZE;
		if (wrappedHasMore) wrappedHasMore = wrappedBatch.length === BATCH_SIZE;

		if (transfersHasMore) transfersSkip += transfersBatch.length;
		if (depositsHasMore) depositsSkip += depositsBatch.length;
		if (withdrawalsHasMore) withdrawalsSkip += withdrawalsBatch.length;
		if (wrappedHasMore) wrappedSkip += wrappedBatch.length;
	}

	return allTransfers;
}

/**
 * Fetch all transfers, deposits, withdrawals, and wrapped token transfers up to a specific block number.
 * Queries both current and legacy SFT subgraphs, merges and deduplicates results.
 */
export async function fetchAllTransfers(
	untilBlock: number,
	tokenAddresses: string[] = ALL_TOKEN_ADDRESSES
): Promise<Transfer[]> {
	const subgraphUrls = [SFT_SUBGRAPH_URL, ...SFT_SUBGRAPH_URLS_LEGACY];

	console.log(
		`[Scraper] Fetching transfers up to block ${untilBlock} for ${tokenAddresses.length} tokens from ${subgraphUrls.length} subgraph(s)`
	);

	// Query all subgraphs in parallel
	const results = await Promise.all(
		subgraphUrls.map(async (url, i) => {
			try {
				const transfers = await fetchFromSubgraph(url, untilBlock, tokenAddresses);
				console.log(
					`[Scraper] Subgraph ${i + 1}/${subgraphUrls.length}: ${transfers.length} transfers`
				);
				return transfers;
			} catch (error) {
				// Legacy subgraphs may fail — log and continue
				console.warn(`[Scraper] Subgraph ${i + 1} failed (${url}):`, error);
				return [];
			}
		})
	);

	// Merge all transfers
	const allTransfers = results.flat();

	// Sort by block number, then timestamp
	allTransfers.sort((a, b) => {
		if (a.blockNumber !== b.blockNumber) {
			return a.blockNumber - b.blockNumber;
		}
		return a.timestamp - b.timestamp;
	});

	console.log(`[Scraper] Total transfers fetched: ${allTransfers.length}`);
	return allTransfers;
}
