// API endpoint to preview/generate snapshots without saving
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchAllTransfers, TOKEN_ADDRESSES } from '$lib/server/snapshots/scraper';
import { generateAllTokenSnapshots } from '$lib/server/snapshots/processor';
import { fetchPythPricesAtTimestamp } from '$lib/server/snapshots/pyth';
import { fetchAllVaultHoldings } from '$lib/server/snapshots/vaults';
import { kv, KV_KEYS } from '$lib/server/kv';
import { networks } from '$lib/config/networks';

// Get current block number from RPC
async function getCurrentBlockNumber(): Promise<number> {
	const network = networks[0];
	const rpcUrls = [network.rpcUrl, ...network.fallbackRpcUrls];

	for (const rpcUrl of rpcUrls) {
		try {
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_blockNumber',
					params: [],
					id: 1
				})
			});

			if (!response.ok) continue;

			const data = await response.json();
			if (data.result) {
				return parseInt(data.result, 16);
			}
		} catch {
			continue;
		}
	}

	throw new Error('Failed to get current block number from any RPC');
}

// Get block timestamp from RPC
async function getBlockTimestamp(blockNumber: number): Promise<number> {
	const network = networks[0];
	const rpcUrls = [network.rpcUrl, ...network.fallbackRpcUrls];

	for (const rpcUrl of rpcUrls) {
		try {
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_getBlockByNumber',
					params: [`0x${blockNumber.toString(16)}`, false],
					id: 1
				})
			});

			if (!response.ok) continue;

			const data = await response.json();
			if (data.result?.timestamp) {
				return parseInt(data.result.timestamp, 16);
			}
		} catch {
			continue;
		}
	}

	throw new Error('Failed to get block timestamp from any RPC');
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const blockParam = url.searchParams.get('block');
		const targetBlock = blockParam ? parseInt(blockParam) : await getCurrentBlockNumber();

		if (isNaN(targetBlock) || targetBlock <= 0) {
			return json({ error: 'Invalid block number' }, { status: 400 });
		}

		console.log(`[Preview] Generating preview for block ${targetBlock}`);

		// Get block timestamp
		const timestamp = await getBlockTimestamp(targetBlock);
		const blockDate = new Date(timestamp * 1000).toISOString();

		// Fetch all transfers up to target block
		const transfers = await fetchAllTransfers(targetBlock, TOKEN_ADDRESSES);

		console.log(`[Preview] Fetched ${transfers.length} transfers`);

		// Fetch Pyth prices at block timestamp
		console.log(`[Preview] Fetching Pyth prices at timestamp ${timestamp}`);
		const prices = await fetchPythPricesAtTimestamp(timestamp, TOKEN_ADDRESSES);

		// Fetch vault holdings (to attribute orderbook holdings to vault owners)
		const vaultHoldings = await fetchAllVaultHoldings(TOKEN_ADDRESSES);

		console.log(`[Preview] Fetched ${vaultHoldings.length} vault holdings`);

		// Fetch excluded wallets from KV
		const excludedWallets = kv ? (await kv.get<string[]>(KV_KEYS.excludedWallets())) || [] : [];

		console.log(`[Preview] Fetched ${excludedWallets.length} excluded wallets`);

		// Generate snapshots for all tokens with prices and vault attribution
		const snapshots = generateAllTokenSnapshots(
			transfers,
			targetBlock,
			timestamp,
			TOKEN_ADDRESSES,
			prices,
			vaultHoldings,
			excludedWallets
		);

		// Calculate summary stats
		const summary = snapshots.map((s) => ({
			token: s.tokenSymbol,
			tokenAddress: s.tokenAddress,
			holders: Object.keys(s.balances).length,
			totalSupply: s.totalSupply,
			price: s.price?.price ?? null,
			priceConfidence: s.price?.confidence ?? null
		}));

		return json({
			success: true,
			blockNumber: targetBlock,
			timestamp,
			blockDate,
			transfersProcessed: transfers.length,
			tokensProcessed: snapshots.length,
			summary,
			snapshots
		});
	} catch (error) {
		console.error('[Preview] Error generating preview:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
