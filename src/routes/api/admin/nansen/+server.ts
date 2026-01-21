// API endpoint to get Nansen referral wallet purchase data
// Tracks lifetime USDC value of tStock purchases (buys only, not sells)
// Optimized with incremental caching - only fetches new trades after first load
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifySessionToken } from '$lib/server/auth';
import { listAccessCodes, getWalletsByCode } from '$lib/server/accessCodes';
import { networks } from '$lib/config/networks';
import { TOKENS } from '$lib/config/tokens';
import { toDecimal } from '$lib/utils/tokenMath';
import { getWalletTiers, type NansenTier } from '$lib/server/nansenTiers';
import { cacheGet, cacheSet, CACHE_TTL } from '$lib/server/cache';

function isAuthenticated(cookies: { get: (name: string) => string | undefined }): boolean {
	const sessionToken = cookies.get('auth-session');
	const timestamp = cookies.get('auth-timestamp');
	if (!sessionToken || !timestamp) return false;
	return verifySessionToken(sessionToken, parseInt(timestamp, 10));
}

const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'.toLowerCase();
const validTokenAddresses = new Set(TOKENS.map((t) => t.address.toLowerCase()));

interface Trade {
	id: string;
	timestamp: string;
	tradeEvent: {
		sender: string;
		transaction: { id: string; from: string };
	};
	inputVaultBalanceChange: {
		amount: string;
		vault: {
			token: { address: string; symbol: string; decimals: number };
			owner: string;
		};
	};
	outputVaultBalanceChange: {
		amount: string;
		vault: {
			token: { address: string; symbol: string; decimals: number };
			owner: string;
		};
	};
}

interface NansenWalletData {
	address: string;
	code: string;
	lifetimePurchaseUsdc: number;
	purchaseCount: number;
	nansenTier: NansenTier | null;
	nansenPoints: number | null;
	nansenRank: number | null;
}

interface NansenCodeData {
	code: string;
	label: string | null;
	wallets: NansenWalletData[];
	totalLifetimePurchaseUsdc: number;
	walletCount: number;
}

// Cached purchase data - stored per wallet
interface CachedPurchaseData {
	walletPurchases: Record<string, { usdcAmount: number; count: number; txIds: string[] }>;
	lastTimestamp: number; // Last trade timestamp we've processed
	updatedAt: number;
}

const CACHE_KEY = 'cache:admin:nansen-purchases-v2';

// Fetch trades since a given timestamp (uses proven pattern from codebase)
async function fetchTradesSince(sinceTimestamp: number): Promise<Trade[]> {
	const network = networks[0];
	if (!network) throw new Error('Network not configured');

	const query = `query GetTrades($skip: Int!, $first: Int!, $timestampGt: BigInt!) {
		trades(
			skip: $skip
			first: $first
			orderBy: timestamp
			orderDirection: asc
			where: { timestamp_gt: $timestampGt }
		) {
			id
			timestamp
			tradeEvent {
				sender
				transaction { id from }
			}
			outputVaultBalanceChange {
				amount
				vault {
					owner
					token { address symbol decimals }
				}
			}
			inputVaultBalanceChange {
				amount
				vault {
					owner
					token { address symbol decimals }
				}
			}
		}
	}`;

	const allTrades: Trade[] = [];
	let skip = 0;
	const first = 1000;
	let hasMore = true;

	while (hasMore) {
		const response = await fetch(network.orderbook_subgraph_url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query,
				variables: { skip, first, timestampGt: sinceTimestamp.toString() }
			})
		});

		if (!response.ok) throw new Error('Failed to fetch trades');
		const data = await response.json();
		if (data.errors) throw new Error(data.errors[0]?.message || 'GraphQL error');

		const trades = data.data?.trades || [];
		allTrades.push(...trades);

		if (trades.length < first) hasMore = false;
		skip += first;

		// Safety limit
		if (skip > 50000) {
			console.warn('[Nansen API] Hit safety limit');
			hasMore = false;
		}
	}

	// Filter to valid USDC/asset trades
	return allTrades.filter((trade) => {
		const inputAddr = trade.inputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
		const outputAddr = trade.outputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
		if (!inputAddr || !outputAddr) return false;

		const inputIsUsdc = inputAddr === USDC_ADDRESS;
		const outputIsUsdc = outputAddr === USDC_ADDRESS;
		const inputIsAsset = validTokenAddresses.has(inputAddr);
		const outputIsAsset = validTokenAddresses.has(outputAddr);

		return (inputIsUsdc && outputIsAsset) || (outputIsUsdc && inputIsAsset);
	});
}

// Process trades and extract purchases for specific wallets
function processTrades(
	trades: Trade[],
	walletSet: Set<string>,
	existing: CachedPurchaseData['walletPurchases']
): CachedPurchaseData['walletPurchases'] {
	const result = { ...existing };

	for (const trade of trades) {
		const input = trade.inputVaultBalanceChange;
		const output = trade.outputVaultBalanceChange;
		if (!input?.vault?.token || !output?.vault?.token) continue;

		const vaultOwner = (output.vault.owner || input.vault.owner || '').toLowerCase();
		const sender = (trade.tradeEvent?.sender || '').toLowerCase();
		const txId = trade.tradeEvent?.transaction?.id?.toLowerCase() || trade.id;

		// Determine if this is a BUY (user is receiving asset, giving USDC)
		const ownerIsBuying = output.vault.token.address.toLowerCase() === USDC_ADDRESS;

		// Calculate USDC amount
		let usdcAmount = 0;
		if (input.vault.token.address.toLowerCase() === USDC_ADDRESS) {
			usdcAmount = toDecimal(input.amount, input.vault.token.decimals, { absolute: true }) ?? 0;
		} else if (output.vault.token.address.toLowerCase() === USDC_ADDRESS) {
			usdcAmount = toDecimal(output.amount, output.vault.token.decimals, { absolute: true }) ?? 0;
		}

		// Check vault owner buying
		if (walletSet.has(vaultOwner) && ownerIsBuying) {
			if (!result[vaultOwner]) result[vaultOwner] = { usdcAmount: 0, count: 0, txIds: [] };
			if (!result[vaultOwner].txIds.includes(txId)) {
				result[vaultOwner].txIds.push(txId);
				result[vaultOwner].usdcAmount += usdcAmount;
				result[vaultOwner].count += 1;
			}
		}

		// Check sender buying (when they're taking from a selling vault owner)
		if (sender !== vaultOwner && walletSet.has(sender) && !ownerIsBuying) {
			if (!result[sender]) result[sender] = { usdcAmount: 0, count: 0, txIds: [] };
			if (!result[sender].txIds.includes(txId)) {
				result[sender].txIds.push(txId);
				result[sender].usdcAmount += usdcAmount;
				result[sender].count += 1;
			}
		}
	}

	return result;
}

export const GET: RequestHandler = async ({ cookies }) => {
	if (!isAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// STEP 1: Get Nansen wallets FIRST (fast KV lookup)
		const codes = await listAccessCodes();
		const nansenCodes = codes.filter(
			(c) => c.code.startsWith('ST0X-') && c.code.endsWith('-NANSEN')
		);

		if (nansenCodes.length === 0) {
			return json({ success: true, codes: [], totalLifetimePurchaseUsdc: 0, totalWallets: 0 });
		}

		const codeWalletsMap = new Map<string, string[]>();
		const allWallets = new Set<string>();

		for (const code of nansenCodes) {
			const wallets = await getWalletsByCode(code.code);
			codeWalletsMap.set(code.code, wallets);
			wallets.forEach((w) => allWallets.add(w.toLowerCase()));
		}

		console.log(`[Nansen] Found ${allWallets.size} wallets across ${nansenCodes.length} codes`);

		if (allWallets.size === 0) {
			return json({
				success: true,
				codes: nansenCodes.map((c) => ({
					code: c.code, label: c.label, wallets: [], totalLifetimePurchaseUsdc: 0, walletCount: 0
				})),
				totalLifetimePurchaseUsdc: 0,
				totalWallets: 0
			});
		}

		// STEP 2: Get cached data (if any)
		let cached = await cacheGet<CachedPurchaseData>(CACHE_KEY);
		const now = Date.now();

		// STEP 3: Fetch trades (incremental if we have cache)
		let trades: Trade[];
		let existingPurchases: CachedPurchaseData['walletPurchases'] = {};
		let lastTimestamp = 0;

		if (cached) {
			// Incremental: only fetch trades since last update
			console.log(`[Nansen] Cache hit from ${new Date(cached.updatedAt).toISOString()}`);
			existingPurchases = cached.walletPurchases;
			lastTimestamp = cached.lastTimestamp;
			trades = await fetchTradesSince(lastTimestamp);
			console.log(`[Nansen] Fetched ${trades.length} new trades since timestamp ${lastTimestamp}`);
		} else {
			// Full fetch (first time only)
			console.log(`[Nansen] No cache, doing full fetch...`);
			trades = await fetchTradesSince(0);
			console.log(`[Nansen] Fetched ${trades.length} total trades`);
		}

		// STEP 4: Process trades for our wallets only
		const walletPurchases = processTrades(trades, allWallets, existingPurchases);

		// Update last timestamp
		const newLastTimestamp = trades.length > 0
			? Math.max(...trades.map((t) => parseInt(t.timestamp, 10)))
			: lastTimestamp;

		// STEP 5: Save to cache
		const newCache: CachedPurchaseData = {
			walletPurchases,
			lastTimestamp: newLastTimestamp,
			updatedAt: now
		};
		await cacheSet(CACHE_KEY, newCache, CACHE_TTL.VERY_LONG);

		// STEP 6: Get Nansen tier data (has its own 1hr cache)
		const nansenTiers = await getWalletTiers(Array.from(allWallets));

		// STEP 7: Build response
		let totalUsdc = 0;
		const codeData: NansenCodeData[] = [];

		for (const code of nansenCodes) {
			const walletAddrs = codeWalletsMap.get(code.code) || [];
			const walletData: NansenWalletData[] = [];
			let codeUsdc = 0;

			for (const addr of walletAddrs) {
				const normalized = addr.toLowerCase();
				const purchases = walletPurchases[normalized] || { usdcAmount: 0, count: 0 };
				const tier = nansenTiers[normalized] || null;

				walletData.push({
					address: addr,
					code: code.code,
					lifetimePurchaseUsdc: purchases.usdcAmount,
					purchaseCount: purchases.count,
					nansenTier: tier?.tier ?? null,
					nansenPoints: tier?.points ?? null,
					nansenRank: tier?.rank ?? null
				});
				codeUsdc += purchases.usdcAmount;
			}

			walletData.sort((a, b) => b.lifetimePurchaseUsdc - a.lifetimePurchaseUsdc);
			codeData.push({
				code: code.code,
				label: code.label,
				wallets: walletData,
				totalLifetimePurchaseUsdc: codeUsdc,
				walletCount: walletAddrs.length
			});
			totalUsdc += codeUsdc;
		}

		codeData.sort((a, b) => b.totalLifetimePurchaseUsdc - a.totalLifetimePurchaseUsdc);

		return json({
			success: true,
			codes: codeData,
			totalLifetimePurchaseUsdc: totalUsdc,
			totalWallets: allWallets.size
		});
	} catch (error) {
		console.error('[Nansen API] Error:', error);
		return json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
	}
};
