// Streaming preview endpoint with Server-Sent Events for progress updates
import type { RequestHandler } from './$types';
import {
	getCurrentBlockNumber,
	getBlockTimestamp,
	generateAllTokenSnapshots_v2
} from '$lib/server/snapshots/generator';
import { kvGet, KV_KEYS } from '$lib/server/kv';
import { calculateWalletPointsFromSnapshotsWithProgress } from '$lib/server/snapshots/points';

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
				sendEvent('progress', { step: 1, total: 6, message: 'Getting block number...' });
				const targetBlock = blockParam ? parseInt(blockParam) : await getCurrentBlockNumber();

				if (isNaN(targetBlock) || targetBlock <= 0) {
					sendEvent('error', { message: 'Invalid block number' });
					controller.close();
					return;
				}

				sendEvent('progress', {
					step: 1,
					total: 6,
					message: `Block ${targetBlock}`,
					done: true
				});

				// Step 2: Generate snapshots
				sendEvent('progress', {
					step: 2,
					total: 6,
					message: 'Fetching transfers, prices, and vault holdings...'
				});
				const snapshots = await generateAllTokenSnapshots_v2(targetBlock);
				sendEvent('progress', {
					step: 2,
					total: 6,
					message: `${snapshots.length} tokens loaded`,
					done: true
				});

				// Step 3: Get timestamp
				sendEvent('progress', { step: 3, total: 6, message: 'Getting block timestamp...' });
				const timestamp = await getBlockTimestamp(targetBlock);
				const blockDate = new Date(timestamp * 1000).toISOString();
				sendEvent('progress', {
					step: 3,
					total: 6,
					message: blockDate,
					done: true
				});

				// Step 4: Load excluded wallets
				sendEvent('progress', { step: 4, total: 6, message: 'Loading excluded wallets...' });
				const excludedWallets = (await kvGet<string[]>(KV_KEYS.excludedWallets())) || [];
				const excludedSet = new Set(excludedWallets.map((w) => w.toLowerCase()));
				sendEvent('progress', {
					step: 4,
					total: 6,
					message: `${excludedWallets.length} excluded`,
					done: true
				});

				// Step 5: Calculate wallet points with LP attribution (with progress callback)
				sendEvent('progress', {
					step: 5,
					total: 6,
					message: 'Calculating points with LP attribution...'
				});

				const walletPointsMap = await calculateWalletPointsFromSnapshotsWithProgress(
					snapshots,
					targetBlock,
					(tokenIndex, tokenSymbol, holdersCount, poolsFound) => {
						sendEvent('lp-progress', {
							tokenIndex,
							totalTokens: snapshots.length,
							tokenSymbol,
							holdersCount,
							poolsFound
						});
					}
				);

				sendEvent('progress', {
					step: 5,
					total: 6,
					message: `${walletPointsMap.size} wallets processed`,
					done: true
				});

				// Step 6: Format response
				sendEvent('progress', { step: 6, total: 6, message: 'Formatting response...' });

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

				const wallets = Array.from(walletPointsMap.entries())
					.map(([address, data]) => {
						const tokens = Array.from(data.tokens.entries()).map(([tokenAddress, tokenData]) => {
							const price = tokenPriceMap.get(tokenAddress) ?? 0;
							const balanceFloat = Number(tokenData.balance) / 1e18;
							const value = balanceFloat * price;

							return {
								symbol: tokenSymbolMap.get(tokenAddress) ?? 'UNKNOWN',
								address: tokenAddress,
								balance: tokenData.balance.toString(),
								value,
								points: tokenData.points
							};
						});

						const totalValue = tokens.reduce((sum, t) => sum + t.value, 0);

						return {
							address,
							totalValue,
							totalPoints: data.totalPoints,
							tokens,
							isExcluded: excludedSet.has(address)
						};
					})
					.sort((a, b) => b.totalValue - a.totalValue);

				sendEvent('progress', {
					step: 6,
					total: 6,
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
