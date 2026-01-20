// API endpoint to get Nansen referral wallet purchase data
// Tracks lifetime USDC value of tStock purchases (buys only, not sells)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifySessionToken } from '$lib/server/auth';
import { listAccessCodes, getWalletsByCode } from '$lib/server/accessCodes';
import { networks } from '$lib/config/networks';
import { TOKENS } from '$lib/config/tokens';
import { toDecimal } from '$lib/utils/tokenMath';

// Helper to check admin auth from cookies
function isAuthenticated(cookies: { get: (name: string) => string | undefined }): boolean {
	const sessionToken = cookies.get('auth-session');
	const timestamp = cookies.get('auth-timestamp');

	if (!sessionToken || !timestamp) {
		return false;
	}

	return verifySessionToken(sessionToken, parseInt(timestamp, 10));
}

const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'.toLowerCase();

// Build set of valid token addresses from the token list
const validTokenAddresses = new Set(TOKENS.map((t) => t.address.toLowerCase()));

interface Trade {
	id: string;
	timestamp: string;
	tradeEvent: {
		sender: string;
		transaction: {
			id: string;
			from: string;
		};
	};
	inputVaultBalanceChange: {
		amount: string;
		vault: {
			token: {
				address: string;
				symbol: string;
				decimals: number;
			};
			owner: string;
		};
	};
	outputVaultBalanceChange: {
		amount: string;
		vault: {
			token: {
				address: string;
				symbol: string;
				decimals: number;
			};
			owner: string;
		};
	};
}

interface NansenWalletData {
	address: string;
	code: string;
	lifetimePurchaseUsdc: number;
	purchaseCount: number;
}

interface NansenCodeData {
	code: string;
	label: string | null;
	wallets: NansenWalletData[];
	totalLifetimePurchaseUsdc: number;
	walletCount: number;
}

// Fetch all trades from subgraph (no time limit)
async function fetchAllTrades(): Promise<Trade[]> {
	const network = networks[0]; // Base mainnet
	if (!network) {
		throw new Error('Network not configured');
	}

	const query = `
		query GetAllTrades($skip: Int!, $first: Int!) {
			trades(
				skip: $skip,
				first: $first,
				orderBy: timestamp,
				orderDirection: desc
			){
				id
				timestamp
				tradeEvent{
					transaction{
						id
						from
					}
					sender
				}
				outputVaultBalanceChange {
					amount
					vault {
						owner
						token {
							address
							symbol
							decimals
						}
					}
				}
				inputVaultBalanceChange {
					amount
					vault {
						owner
						token {
							address
							symbol
							decimals
						}
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
				variables: { skip, first }
			})
		});

		if (!response.ok) throw new Error('Failed to fetch trades from subgraph');

		const data = await response.json();
		if (data.errors) throw new Error(data.errors[0]?.message || 'GraphQL error');

		const trades = data.data?.trades || [];
		allTrades.push(...trades);

		if (trades.length < first) {
			hasMore = false;
		}
		skip += first;

		// Safety limit to prevent infinite loops
		if (skip > 100000) {
			console.warn('[Nansen API] Reached safety limit of 100,000 trades');
			hasMore = false;
		}
	}

	// Filter to only trades involving our asset tokens paired with USDC
	return allTrades.filter((trade) => {
		const inputTokenAddr = trade.inputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
		const outputTokenAddr = trade.outputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
		if (!inputTokenAddr || !outputTokenAddr) return false;

		const inputIsUsdc = inputTokenAddr === USDC_ADDRESS;
		const outputIsUsdc = outputTokenAddr === USDC_ADDRESS;
		const inputIsAsset = validTokenAddresses.has(inputTokenAddr);
		const outputIsAsset = validTokenAddresses.has(outputTokenAddr);

		// Valid: USDC paired with one of our asset tokens
		return (inputIsUsdc && outputIsAsset) || (outputIsUsdc && inputIsAsset);
	});
}

// Calculate lifetime purchase USDC for a set of wallets
function calculateWalletPurchases(
	trades: Trade[],
	walletAddresses: Set<string>
): Map<string, { usdcAmount: number; count: number }> {
	const walletPurchases = new Map<string, { usdcAmount: number; count: number }>();

	// Initialize all wallets with zero
	for (const wallet of walletAddresses) {
		walletPurchases.set(wallet, { usdcAmount: 0, count: 0 });
	}

	// Track unique transactions per wallet to avoid double counting
	const seenTxPerWallet = new Map<string, Set<string>>();
	for (const wallet of walletAddresses) {
		seenTxPerWallet.set(wallet, new Set());
	}

	for (const trade of trades) {
		const input = trade.inputVaultBalanceChange;
		const output = trade.outputVaultBalanceChange;

		if (!input || !output) continue;

		const inputToken = input.vault?.token;
		const outputToken = output.vault?.token;

		if (!inputToken || !outputToken) continue;

		// Get both vault owner and sender
		const vaultOwner = (output.vault?.owner || input.vault?.owner || '').toLowerCase();
		const sender = trade.tradeEvent?.sender?.toLowerCase() || '';
		const txHash = trade.tradeEvent?.transaction?.id?.toLowerCase() || trade.id.toLowerCase();

		// Determine if this is a BUY from the perspective of sender or vault owner
		// ownerIsBuying: vault owner is receiving asset token (giving USDC)
		const ownerIsBuying = outputToken.address.toLowerCase() === USDC_ADDRESS;

		// For USDC amount
		const inputAmount =
			toDecimal(input.amount, inputToken.decimals, { absolute: true }) ?? 0;
		const outputAmount =
			toDecimal(output.amount, outputToken.decimals, { absolute: true }) ?? 0;

		let usdcAmount = 0;
		if (inputToken.address.toLowerCase() === USDC_ADDRESS) {
			usdcAmount = inputAmount;
		} else if (outputToken.address.toLowerCase() === USDC_ADDRESS) {
			usdcAmount = outputAmount;
		}

		// Check if vault owner is in our wallet set and is buying
		if (walletAddresses.has(vaultOwner) && ownerIsBuying) {
			const seenTx = seenTxPerWallet.get(vaultOwner)!;
			if (!seenTx.has(txHash)) {
				seenTx.add(txHash);
				const stats = walletPurchases.get(vaultOwner)!;
				stats.usdcAmount += usdcAmount;
				stats.count += 1;
			}
		}

		// Check if sender is in our wallet set and is buying (sender is taking from vault owner)
		// If sender != vault owner, sender is buying when vault owner is selling (NOT ownerIsBuying)
		if (sender !== vaultOwner && walletAddresses.has(sender) && !ownerIsBuying) {
			const seenTx = seenTxPerWallet.get(sender)!;
			if (!seenTx.has(txHash)) {
				seenTx.add(txHash);
				const stats = walletPurchases.get(sender)!;
				stats.usdcAmount += usdcAmount;
				stats.count += 1;
			}
		}
	}

	return walletPurchases;
}

export const GET: RequestHandler = async ({ cookies }) => {
	if (!isAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Get all access codes
		const codes = await listAccessCodes();

		// Filter to only Nansen codes (ST0X-****-NANSEN pattern)
		// Must start with ST0X- and end with -NANSEN
		const nansenCodes = codes.filter((code) =>
			code.code.startsWith('ST0X-') && code.code.endsWith('-NANSEN')
		);

		if (nansenCodes.length === 0) {
			return json({
				success: true,
				codes: [],
				totalLifetimePurchaseUsdc: 0,
				totalWallets: 0
			});
		}

		// Get all wallets for Nansen codes
		const codeWalletsMap = new Map<string, string[]>();
		const allNansenWallets = new Set<string>();

		for (const code of nansenCodes) {
			const wallets = await getWalletsByCode(code.code);
			codeWalletsMap.set(code.code, wallets);
			for (const wallet of wallets) {
				allNansenWallets.add(wallet.toLowerCase());
			}
		}

		// Fetch all trades from subgraph
		const trades = await fetchAllTrades();

		// Calculate purchases for all Nansen wallets
		const walletPurchases = calculateWalletPurchases(trades, allNansenWallets);

		// Build response data
		let totalLifetimePurchaseUsdc = 0;
		const codeData: NansenCodeData[] = [];

		for (const code of nansenCodes) {
			const walletAddresses = codeWalletsMap.get(code.code) || [];
			const walletData: NansenWalletData[] = [];
			let codeTotalUsdc = 0;

			for (const walletAddr of walletAddresses) {
				const normalizedAddr = walletAddr.toLowerCase();
				const purchases = walletPurchases.get(normalizedAddr) || { usdcAmount: 0, count: 0 };

				walletData.push({
					address: walletAddr,
					code: code.code,
					lifetimePurchaseUsdc: purchases.usdcAmount,
					purchaseCount: purchases.count
				});

				codeTotalUsdc += purchases.usdcAmount;
			}

			// Sort wallets by lifetime purchase USDC descending
			walletData.sort((a, b) => b.lifetimePurchaseUsdc - a.lifetimePurchaseUsdc);

			codeData.push({
				code: code.code,
				label: code.label,
				wallets: walletData,
				totalLifetimePurchaseUsdc: codeTotalUsdc,
				walletCount: walletAddresses.length
			});

			totalLifetimePurchaseUsdc += codeTotalUsdc;
		}

		// Sort codes by total lifetime purchase USDC descending
		codeData.sort((a, b) => b.totalLifetimePurchaseUsdc - a.totalLifetimePurchaseUsdc);

		return json({
			success: true,
			codes: codeData,
			totalLifetimePurchaseUsdc,
			totalWallets: allNansenWallets.size
		});
	} catch (error) {
		console.error('[Nansen API] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
