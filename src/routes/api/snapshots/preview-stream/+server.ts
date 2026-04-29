// Streaming preview endpoint with Server-Sent Events for progress updates.
// Per-wallet points calculation removed in Phase 1 (DEPR-02 D-03); the streamed
// preview now aggregates wallet holdings + USD value across token snapshots.
import type { RequestHandler } from './$types';
import {
	getCurrentBlockNumber,
	getBlockTimestamp,
	generateAllTokenSnapshots
} from '$lib/server/snapshots/generator';
import { kvGet, KV_KEYS } from '$lib/server/kv';

export const GET: RequestHandler = async ({ url }) => {
	const blockParam = url.searchParams.get('block');

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			const sendEvent = (event: string, data: unknown) => {
				controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			};

			try {
				const overallStart = Date.now();

				// Step 1: Get block number
				sendEvent('progress', { step: 1, total: 5, message: 'Getting block number...' });
				const targetBlock = blockParam ? parseInt(blockParam) : await getCurrentBlockNumber();

				if (isNaN(targetBlock) || targetBlock <= 0) {
					sendEvent('error', { message: 'Invalid block number' });
					controller.close();
					return;
				}

				sendEvent('progress', {
					step: 1,
					total: 5,
					message: `Block ${targetBlock}`,
					done: true
				});

				// Step 2: Generate snapshots
				sendEvent('progress', {
					step: 2,
					total: 5,
					message: 'Fetching transfers, prices, and vault holdings...'
				});
				const snapshots = await generateAllTokenSnapshots(targetBlock);
				sendEvent('progress', {
					step: 2,
					total: 5,
					message: `${snapshots.length} tokens loaded`,
					done: true
				});

				// Step 3: Get timestamp
				sendEvent('progress', { step: 3, total: 5, message: 'Getting block timestamp...' });
				const timestamp = await getBlockTimestamp(targetBlock);
				const blockDate = new Date(timestamp * 1000).toISOString();
				sendEvent('progress', {
					step: 3,
					total: 5,
					message: blockDate,
					done: true
				});

				// Step 4: Load excluded wallets
				sendEvent('progress', { step: 4, total: 5, message: 'Loading excluded wallets...' });
				const excludedWallets = (await kvGet<string[]>(KV_KEYS.excludedWallets())) || [];
				const excludedSet = new Set(excludedWallets.map((w) => w.toLowerCase()));
				sendEvent('progress', {
					step: 4,
					total: 5,
					message: `${excludedWallets.length} excluded`,
					done: true
				});

				// Step 5: Aggregate wallets and format response
				sendEvent('progress', { step: 5, total: 5, message: 'Aggregating wallet holdings...' });

				const tokenSummary = snapshots.map((s) => ({
					token: s.tokenSymbol,
					tokenAddress: s.tokenAddress,
					holders: Object.keys(s.balances).length,
					totalSupply: s.totalSupply,
					price: s.price?.price ?? null,
					priceConfidence: s.price?.confidence ?? null
				}));

				const tokenSymbolMap = new Map<string, string>();
				const tokenPriceMap = new Map<string, number>();
				for (const s of snapshots) {
					tokenSymbolMap.set(s.tokenAddress.toLowerCase(), s.tokenSymbol);
					tokenPriceMap.set(s.tokenAddress.toLowerCase(), s.price?.price ?? 0);
				}

				type PreviewWallet = {
					address: string;
					totalValue: number;
					tokens: {
						symbol: string;
						address: string;
						balance: string;
						value: number;
					}[];
					isExcluded: boolean;
				};

				const walletAggregates = new Map<
					string,
					{
						tokens: PreviewWallet['tokens'];
						totalValue: number;
					}
				>();

				// Replaces the deleted points pipeline. We still emit per-token progress
				// events so the streaming UI keeps its progress bar.
				for (let i = 0; i < snapshots.length; i++) {
					const snapshot = snapshots[i];
					const tokenAddressLower = snapshot.tokenAddress.toLowerCase();
					const symbol = tokenSymbolMap.get(tokenAddressLower) ?? 'UNKNOWN';
					const price = tokenPriceMap.get(tokenAddressLower) ?? 0;
					const holdersCount = Object.keys(snapshot.balances).length;

					sendEvent('token-progress', {
						tokenIndex: i,
						totalTokens: snapshots.length,
						tokenSymbol: snapshot.tokenSymbol,
						holdersCount
					});

					for (const [walletAddress, balanceStr] of Object.entries(snapshot.balances)) {
						const address = walletAddress.toLowerCase();
						const balance = BigInt(balanceStr);
						if (balance <= 0n) continue;

						const balanceFloat = Number(balance) / 1e18;
						const value = balanceFloat * price;

						if (!walletAggregates.has(address)) {
							walletAggregates.set(address, { tokens: [], totalValue: 0 });
						}
						const agg = walletAggregates.get(address)!;
						agg.tokens.push({
							symbol,
							address: tokenAddressLower,
							balance: balance.toString(),
							value
						});
						agg.totalValue += value;
					}
				}

				const wallets: PreviewWallet[] = Array.from(walletAggregates.entries())
					.map(([address, data]) => ({
						address,
						totalValue: data.totalValue,
						tokens: data.tokens,
						isExcluded: excludedSet.has(address)
					}))
					.sort((a, b) => b.totalValue - a.totalValue);

				sendEvent('progress', {
					step: 5,
					total: 5,
					message: 'Complete',
					done: true
				});

				const totalTime = ((Date.now() - overallStart) / 1000).toFixed(1);

				// Send final result
				sendEvent('complete', {
					success: true,
					blockNumber: targetBlock,
					timestamp,
					blockDate,
					tokensProcessed: snapshots.length,
					walletCount: wallets.length,
					excludedCount: wallets.filter((w) => w.isExcluded).length,
					totalTimeSeconds: parseFloat(totalTime),
					wallets,
					tokenSummary,
					snapshots
				});
			} catch (error) {
				sendEvent('error', {
					message: error instanceof Error ? error.message : 'Unknown error'
				});
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
