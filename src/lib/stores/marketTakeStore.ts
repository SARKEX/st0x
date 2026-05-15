/**
 * Market-take state machine — extracted from transaction.ts (TRADE-02 PR-2).
 *
 * Owns the 5 orchestration methods that submit take-orders against the
 * Rain orderbook: preloadAggregatedTakeOrdersCalldata,
 * handleAggregatedTakeOrdersCalldata, handleTakeOrders, handleOracleOrders,
 * pollAndFinalizeTakeOrders.
 *
 * This module is consumed by:
 *   - src/lib/services/marketOrderExecution.ts (the only caller of the 3
 *     "preload" / "handleAggregatedTakeOrdersCalldata" / "handleOracleOrders"
 *     methods today — this is what severs the cycle).
 *   - src/lib/stores/transaction.ts (re-exports for UI back-compat).
 *
 * This module MUST NOT import from $lib/services/marketOrderExecution.
 * Circular-import absence is enforced by the phase-exit grep gate.
 */

import { get } from 'svelte/store';
import { decodeFunctionData, erc20Abi, formatUnits, type Hash, type Hex } from 'viem';
import { wagmiConfig } from 'svelte-wagmi';
import {
	type SgOrder,
	type RaindexOrder,
	type TakeOrdersConfigV5,
	type TakeOrdersMode,
	type TakeOrdersRequest
} from '@rainlanguage/orderbook';
import { Float } from '@rainlanguage/float';
import {
	sendTransaction as walletServiceSendTransaction,
	waitForTransaction as walletServiceWaitForTransaction,
	APPROVAL_TX_CONFIRMATIONS
} from '$lib/services/walletService';
import { isStaleWalletSessionError, handleStaleWalletSession } from '$lib/utils/walletUtils';
import { detectPartialFill } from './partialFillDetection';
import { ensureAllowance } from './approvalStore';
import { parseFloatHex, getRaindexOrderUrl } from '$lib/utils/tokenMath';
import { createRaindexClient } from '$lib/clients/raindex';
import { invalidateDashboardBalances } from '$lib/queries/balances';
import { walletAddress, authMethod } from '$lib/stores/authStore';
import { currentNetwork } from '$lib/stores';
import { getTrades } from '$lib/api/subgraph';
import { TransactionErrorMessage } from '$lib/types/errors';
import type { TakeOrdersParams } from '$lib/types/transactions';
import type { Network } from '$lib/config/network';
import { getMakerInputIOIndex, getMakerOutputIOIndex } from '$lib/types/orderPerspective';
import {
	TransactionStatus,
	transactionStoreInternal,
	validateOrderbookAddress,
	extractTransactionError,
	type TransactionMetadata,
	type RaindexLink
} from './transactionShared';

/** Retry cadence for SDK/oracle readiness checks. */
const TAKE_ORDER_PREPARE_RETRY_MS = 100;
/** Retry cadence for transient post-confirmation oracle/preflight failures on later legs. */
const TAKE_ORDER_TRANSIENT_RETRY_MS = 150;
/** Confirmations required before submitting the next market-take leg. */
const TAKE_TX_CONFIRMATIONS = 1;
/** TTL for cached aggregated calldata preparation results. */
const AGGREGATED_TAKE_CACHE_TTL_MS = 10_000;
/** Max retries for aggregated calldata readiness checks. */
const AGGREGATED_PREPARE_MAX_RETRIES = 1;
/** Retry delay for aggregated calldata readiness checks. */
const AGGREGATED_PREPARE_RETRY_MS = 100;

// Unified send/wait transaction (works with both Dynamic and wagmi wallets).
// Per-leg take-order tx submission and SDK-driven approvalInfo.calldata flows
// still use these directly; allowance reads + ERC20 approve tx submission have
// been lifted into ./approvalStore (TRADE-02 PR-4).
const sendTransaction = walletServiceSendTransaction;
const waitForTransaction = walletServiceWaitForTransaction;

// Destructure the leaf-owned store API and status-helper surface so the
// lifted method bodies below can keep calling `awaitWalletConfirmation(...)`
// etc. unchanged. This mirrors the destructure seam in transaction.ts.
const { update, awaitWalletConfirmation, awaitApprovalTx, transactionError, transactionSuccess } =
	transactionStoreInternal;

/**
 * Decide if a failing maker leg can be skipped and routed to the next leg.
 * We only skip execution/simulation-style maker failures, and never skip
 * user/session/network/funds/allowance class errors.
 */
function isSkippableMakerLegError(message: string | undefined): boolean {
	if (!message) return false;
	const normalized = message.toLowerCase();

	// Never skip user/session/wallet/rpc/accounting failures.
	if (
		normalized.includes('user rejected') ||
		normalized.includes('user denied') ||
		normalized.includes('authentication') ||
		normalized.includes('log in') ||
		normalized.includes('allowance') ||
		normalized.includes('insufficient funds') ||
		normalized.includes('exceeds balance') ||
		normalized.includes('nonce') ||
		normalized.includes('network') ||
		normalized.includes('disconnected')
	) {
		return false;
	}

	// Skip leg-level simulation / revert style errors.
	return (
		normalized.includes('preflight check failed') ||
		normalized.includes('order failed simulation') ||
		normalized.includes('execution reverted') ||
		normalized.includes('reverted')
	);
}

function extractAvailableLiquidityAmount(
	message: string | undefined,
	decimals: number
): bigint | null {
	if (!message) return null;
	const match = message.match(/but only\s+([0-9]*\.?[0-9]+)\s+available/i);
	if (!match?.[1]) return null;
	const parsed = Float.parse(match[1]);
	if (parsed.error || !parsed.value) return null;
	const fixed = parsed.value.toFixedDecimalLossy(decimals);
	if (fixed.error || !fixed.value?.value) return null;
	try {
		return BigInt(fixed.value.value);
	} catch {
		return null;
	}
}

function buildExpectedPriceByOrderHash(
	simulation: TakeOrdersParams['simulation'] | undefined
): Map<string, number> {
	const result = new Map<string, number>();
	for (const fill of simulation?.fills ?? []) {
		const hash = fill.quote.orderHash?.toLowerCase();
		if (!hash) continue;
		if (!Number.isFinite(fill.price) || fill.price <= 0) continue;
		if (!result.has(hash)) {
			result.set(hash, fill.price);
		}
	}
	return result;
}

function formatPriceForReroute(value: number | undefined): string | null {
	if (value === undefined || !Number.isFinite(value) || value <= 0) return null;
	return value.toFixed(6);
}

function shortOrderHash(hash: string | undefined): string {
	if (!hash) return 'unknown order';
	return hash.length > 14 ? `${hash.slice(0, 10)}...${hash.slice(-4)}` : hash;
}

function buildLegRerouteMessage(args: {
	fromOrderHash?: string;
	toOrderHash?: string;
	fromPrice?: number;
	toPrice?: number;
}): string {
	const fromHash = shortOrderHash(args.fromOrderHash);
	const toHash = shortOrderHash(args.toOrderHash);
	const fromPrice = formatPriceForReroute(args.fromPrice);
	const toPrice = formatPriceForReroute(args.toPrice);
	if (fromPrice && toPrice) {
		return `Maker leg ${fromHash} is not executable now. Routing to ${toHash} at updated ratio (${fromPrice} -> ${toPrice}).`;
	}
	return `Maker leg ${fromHash} is not executable now. Routing remaining size to ${toHash}.`;
}

function sumBigints(values: bigint[] | undefined): bigint {
	if (!values?.length) return 0n;
	return values.reduce((acc, value) => acc + value, 0n);
}

function deriveTakeRequestAmountWei(mode: TakeOrdersMode, params: TakeOrdersParams): bigint {
	if (mode === 'buyExact' || mode === 'buyUpTo') {
		return params.requestedTakerWantsAmount;
	}
	if (mode === 'spendExact' || mode === 'spendUpTo') {
		return sumBigints(params.orderFillAmounts);
	}
	return 0n;
}

function buildTakeOrdersRequest(args: {
	mode: TakeOrdersMode;
	params: TakeOrdersParams;
	network: Network;
	priceCapStr: string;
	taker: string;
}): TakeOrdersRequest | null {
	const { mode, params, network, priceCapStr, taker } = args;
	const amountWei = deriveTakeRequestAmountWei(mode, params);
	if (amountWei <= 0n) return null;
	const amountDecimals =
		mode === 'buyExact' || mode === 'buyUpTo'
			? params.takerWantsToken.decimals
			: params.takerPaysToken.decimals;
	return {
		taker,
		chainId: network.id,
		sellToken: params.takerPaysToken.address,
		buyToken: params.takerWantsToken.address,
		mode,
		amount: formatUnits(amountWei, amountDecimals),
		priceCap: priceCapStr
	};
}

type AggregatedTakeCacheEntry = {
	expiresAt: number;
	value: Awaited<
		ReturnType<Awaited<ReturnType<typeof createRaindexClient>>['getTakeOrdersCalldata']>
	>;
};

const aggregatedTakeCalldataCache = new Map<string, AggregatedTakeCacheEntry>();

/**
 * Sweeps expired entries on every write. Without this, a user dragging the
 * slippage slider or rapidly editing the amount field generates many distinct
 * cache keys (cache key is JSON.stringify(takeRequest), so every distinct
 * (taker, sellToken, buyToken, mode, amount, priceCap, chainId) combo is a
 * new entry) that are otherwise never reclaimed — entries only got evicted
 * on read of the same key. The sweep is O(n) per write but n stays small
 * because expired entries get drained continuously.
 */
function pruneExpiredAggregatedTakeCache(now: number): void {
	for (const [k, v] of aggregatedTakeCalldataCache) {
		if (v.expiresAt <= now) aggregatedTakeCalldataCache.delete(k);
	}
}

function getAggregatedTakeCacheKey(takeRequest: TakeOrdersRequest): string {
	return JSON.stringify(takeRequest);
}

function shouldCacheAggregatedTakeResult(
	result: Awaited<
		ReturnType<Awaited<ReturnType<typeof createRaindexClient>>['getTakeOrdersCalldata']>
	>
): boolean {
	if (!result || typeof result !== 'object') return false;
	const maybeWrapped = result as { error?: unknown; value?: unknown };
	if (maybeWrapped.error || !maybeWrapped.value || typeof maybeWrapped.value !== 'object')
		return false;
	const value = maybeWrapped.value as { isReady?: unknown; isNeedsApproval?: unknown };
	return typeof value.isReady === 'boolean' || typeof value.isNeedsApproval === 'boolean';
}

// Helper function to create Raindex v5 link data (safe, no HTML)
function createRaindexLink(
	chainId: number,
	orderbookId: string,
	orderHashOrVaultId: string,
	linkText = 'Manage your order on Raindex'
): RaindexLink {
	const url = getRaindexOrderUrl(chainId, orderbookId, orderHashOrVaultId);
	return { url, text: linkText };
}

const fetchAggregatedTakeOrdersCalldata = async (
	takeRequest: TakeOrdersRequest,
	options: { preferCache: boolean }
) => {
	const cacheKey = getAggregatedTakeCacheKey(takeRequest);
	const now = Date.now();
	if (options.preferCache) {
		const cached = aggregatedTakeCalldataCache.get(cacheKey);
		if (cached && cached.expiresAt > now) {
			return cached.value;
		}
	}
	const client = await createRaindexClient();
	const result = await client.getTakeOrdersCalldata(takeRequest);
	if (shouldCacheAggregatedTakeResult(result)) {
		aggregatedTakeCalldataCache.set(cacheKey, {
			expiresAt: now + AGGREGATED_TAKE_CACHE_TTL_MS,
			value: result
		});
		pruneExpiredAggregatedTakeCache(now);
	}
	return result;
};

const ensureBulkPayerAllowanceIfNeeded = async (args: {
	requiredWei: bigint;
	payerToken: `0x${string}`;
	symbol: string;
	owner: `0x${string}`;
	probeApprovalCalldata: Hex;
	network: Network;
}) => {
	const { requiredWei, payerToken, symbol, owner, probeApprovalCalldata, network } = args;
	if (requiredWei <= 0n) return;

	const decoded = decodeFunctionData({ abi: erc20Abi, data: probeApprovalCalldata });
	if (decoded.functionName !== 'approve') return;
	const spender = decoded.args[0] as `0x${string}`;

	// Wallet-confirmation status preserved for the multi-leg pre-grant — the
	// `ensureAllowance` utility only handles CHECKING_ALLOWANCE / PENDING_APPROVAL
	// transitions, but this path needs a "Waiting for wallet to approve {symbol}"
	// message before the user signs.
	awaitWalletConfirmation(`Awaiting wallet confirmation to approve ${symbol}...`);
	await ensureAllowance({
		token: { address: payerToken },
		owner,
		spender,
		amount: requiredWei,
		network,
		setStatus: (s) => update((state) => ({ ...state, status: s }))
	});
};

/**
 * Sequential block — DO NOT split into parallel awaits. Vault-balance
 * invalidation MUST run before partial-fill detection consumes the result,
 * or the partial-fill banner will display stale balances.
 *
 * (See 02-RESEARCH.md §"Pitfall 6" for the regression class this comment
 *  protects against. Plan 05's partialFillDetection extraction must consume
 *  this result POST-completion, not interleaved.)
 *
 * Shared post-transaction logic for take orders: poll subgraph for trades,
 * build a MarketOrderSummary, and return a transactionSuccess result.
 */
export const pollAndFinalizeTakeOrders = async (
	allTransactionHashes: Hash[],
	primaryOrder: SgOrder,
	params: TakeOrdersParams,
	network: Network
) => {
	const hash = allTransactionHashes[allTransactionHashes.length - 1];

	const pollPendingTrades = async () => {
		const MAX_ATTEMPTS = 60;
		const totalBatches = allTransactionHashes.length;

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const now = Math.floor(Date.now() / 1000);
			const trades = await getTrades(now - 600, now, network);
			const allTrades = trades.filter((t) =>
				allTransactionHashes.some(
					(txHash) => t.tradeEvent?.transaction?.id.toLowerCase() === txHash.toLowerCase()
				)
			) as unknown as Array<{
				tradeEvent?: { transaction?: { id?: string } };
				order?: { orderHash?: string };
				inputVaultBalanceChange?: { amount?: Hex; oldVaultBalance?: Hex; newVaultBalance?: Hex };
				outputVaultBalanceChange?: { amount?: Hex; oldVaultBalance?: Hex; newVaultBalance?: Hex };
			}>;

			const validTrades = allTrades.filter(
				(t) => t.inputVaultBalanceChange?.amount && t.outputVaultBalanceChange?.amount
			);

			if (totalBatches > 1) {
				const indexedTxHashes = new Set(
					validTrades.map((t) => t.tradeEvent?.transaction?.id?.toLowerCase())
				);
				const allBatchesIndexed = allTransactionHashes.every((txHash) =>
					indexedTxHashes.has(txHash.toLowerCase())
				);
				if (allBatchesIndexed) return validTrades;
				if (attempt >= 6 && validTrades.length > 0) return validTrades;
			} else {
				if (validTrades.length > 0) return validTrades;
			}

			await new Promise((resolve) => setTimeout(resolve, 5_000));
		}
		return [];
	};

	const validTrades = await pollPendingTrades();

	if (validTrades.length === 0) {
		return transactionError(TransactionErrorMessage.GENERIC, hash);
	}

	const inputTokenDecimals = params.takerWantsToken.decimals;
	const inputTokenSymbol = params.takerWantsToken.symbol;
	const inputTokenAddress = params.takerWantsToken.address;
	const outputTokenDecimals = params.takerPaysToken.decimals;
	const outputTokenSymbol = params.takerPaysToken.symbol;
	const outputTokenAddress = params.takerPaysToken.address;

	let totalInputAmount = 0n;
	let totalOutputAmount = 0n;
	for (const trade of validTrades) {
		totalInputAmount += parseFloatHex(
			trade.outputVaultBalanceChange!.amount as Hex,
			inputTokenDecimals,
			true
		);
		totalOutputAmount += parseFloatHex(
			trade.inputVaultBalanceChange!.amount as Hex,
			outputTokenDecimals,
			true
		);
	}

	const actualIoRatio =
		totalOutputAmount > 0n
			? parseFloat(formatUnits(totalInputAmount, inputTokenDecimals)) /
				parseFloat(formatUnits(totalOutputAmount, outputTokenDecimals))
			: 0;

	const requestedInputAmount = params.requestedTakerWantsAmount;

	const raindexLink = createRaindexLink(
		network.id,
		primaryOrder.orderbook.id,
		primaryOrder.orderHash,
		'View order on Raindex'
	);

	// Sequential block — Pitfall 6 mitigation (02-RESEARCH §"Pitfall 6"):
	// vault-balance invalidation MUST run BEFORE partial-fill detection consumes
	// the trade totals. If detectPartialFill ran first, the partial-fill banner
	// could render with stale on-chain balance reads (the user just got tokens
	// the cache hasn't seen yet).
	invalidateDashboardBalances();

	// Partial-fill detection anchors on whichever side the user typed their amount.
	// For spend modes (Sell-by-asset, Buy-by-spend) the anchor is the pays side; for
	// `buyUpTo` it's the wants side. Comparing the wrong side conflates price
	// slippage with quantity shortfall (e.g. a Sell that fully sold the asset at a
	// worse price would get falsely flagged as partial quantity).
	const summary = detectPartialFill({
		totalTakerWantsAmount: totalInputAmount,
		totalTakerPaysAmount: totalOutputAmount,
		requestedTakerWantsAmount: requestedInputAmount,
		requestedTakerPaysAmount: params.requestedTakerPaysAmount,
		inputTokenSymbol,
		inputTokenAddress,
		inputTokenDecimals,
		outputTokenSymbol,
		outputTokenAddress,
		outputTokenDecimals,
		ioRatio: actualIoRatio,
		actualSlippage: 0n
	});

	return transactionSuccess(hash, undefined, { marketOrderSummary: summary, raindexLink });
};

export const preloadAggregatedTakeOrdersCalldata = async (takeRequest: TakeOrdersRequest) => {
	try {
		await fetchAggregatedTakeOrdersCalldata(takeRequest, { preferCache: false });
	} catch {
		// Preload is opportunistic only; execution path handles failures explicitly.
	}
};

/**
 * Single-tx market take via RaindexClient.getTakeOrdersCalldata(): subgraph discovery +
 * one takeOrders4 call that can aggregate multiple maker orders (solves thin top-of-book).
 *
 * @returns `true` if this path handled the flow (success or user-visible error).
 *          `false` if aggregated calldata is not available — caller should fall back to per-order execution.
 */
export const handleAggregatedTakeOrdersCalldata = async (
	takeRequest: TakeOrdersRequest,
	primaryOrder: SgOrder,
	params: TakeOrdersParams,
	approvalTokenSymbol: string
): Promise<boolean> => {
	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not found');
	const network = get(currentNetwork) as Network;

	try {
		validateOrderbookAddress(primaryOrder.orderbook.id, network);
	} catch (error) {
		transactionError((error as Error).message as TransactionErrorMessage);
		return true;
	}

	awaitWalletConfirmation(`Preparing order...`);
	const TX_LOG_PREFIX = '[marketTakeStore:handleAggregatedTakeOrdersCalldata]';

	let calldataWrapped = await fetchAggregatedTakeOrdersCalldata(takeRequest, { preferCache: true });
	if (calldataWrapped.error || !calldataWrapped.value) {
		const sdkMsg = calldataWrapped.error?.readableMsg;
		console.log(`${TX_LOG_PREFIX} SDK error`, { msg: sdkMsg, request: takeRequest });
		if (sdkMsg) {
			// Several aggregated-SDK error classes are false negatives that the
			// per-order fallback handles correctly:
			//   - "No liquidity available …": stale subgraph vault balances vs
			//     on-chain truth (original case; verified in production logs).
			//   - "Preflight check failed: All orders failed simulation …":
			//     aggregated batch picks multiple orders from subgraph discovery;
			//     a single bad-state order in the batch causes the whole
			//     simulation to revert (often with `panic: array out-of-bounds`
			//     or similar Rain-interpreter panics). The per-order path uses
			//     ONLY hydrated `walkResult.fills` (single best order from our
			//     own discovery), bypassing the broken sibling. This case is
			//     reproducible against a Base anvil fork during E2E and has been
			//     observed against live RPC under stale-subgraph race
			//     conditions.
			// User/session/wallet-class errors are surfaced unchanged — the
			// per-order path would just re-hit them with no benefit.
			const isFalseNegativeFromAggregator =
				sdkMsg.includes('No liquidity') ||
				sdkMsg.includes('Preflight check failed') ||
				sdkMsg.includes('All orders failed simulation');
			if (isFalseNegativeFromAggregator) {
				console.warn(
					`${TX_LOG_PREFIX} SDK aggregated path returned a recoverable error — allowing per-order fallback`,
					{ sdkMsg }
				);
				return false;
			}
			transactionError(sdkMsg as TransactionErrorMessage);
			return true;
		}
		return false;
	}

	let result = calldataWrapped.value;
	const maybeApprovalInfo = (result as { approvalInfo?: { token: string; calldata: string } })
		?.approvalInfo;
	if (result.isNeedsApproval && maybeApprovalInfo) {
		awaitWalletConfirmation(`Awaiting wallet confirmation to approve ${approvalTokenSymbol}...`);
		const approvalHash = await sendTransaction({
			to: maybeApprovalInfo.token as `0x${string}`,
			data: maybeApprovalInfo.calldata as Hex
		});
		awaitApprovalTx(approvalHash);
		await waitForTransaction(approvalHash, { confirmations: APPROVAL_TX_CONFIRMATIONS });
		calldataWrapped = await fetchAggregatedTakeOrdersCalldata(takeRequest, { preferCache: false });
		if (calldataWrapped.error || !calldataWrapped.value) {
			// Mirror the recoverable-error fallback from the pre-approval branch
			// above. Some aggregated-SDK errors are batch-discovery artifacts that
			// the per-order path bypasses; falling back here lets handleOracleOrders
			// re-try with the hydrated walkResult fills (now with allowance set).
			const postApprovalSdkMsg = calldataWrapped.error?.readableMsg;
			const isPostApprovalRecoverable =
				postApprovalSdkMsg &&
				(postApprovalSdkMsg.includes('No liquidity') ||
					postApprovalSdkMsg.includes('Preflight check failed') ||
					postApprovalSdkMsg.includes('All orders failed simulation'));
			if (isPostApprovalRecoverable) {
				console.warn(
					`${TX_LOG_PREFIX} SDK aggregated path returned a recoverable error after approval — allowing per-order fallback`,
					{ sdkMsg: postApprovalSdkMsg }
				);
				return false;
			}
			transactionError(
				(postApprovalSdkMsg || 'Failed to prepare order after approval') as TransactionErrorMessage
			);
			return true;
		}
		result = calldataWrapped.value;
	}

	if (!result.isReady || !result.takeOrdersInfo) {
		for (let retry = 0; retry < AGGREGATED_PREPARE_MAX_RETRIES; retry++) {
			await new Promise((resolve) => setTimeout(resolve, AGGREGATED_PREPARE_RETRY_MS));
			calldataWrapped = await fetchAggregatedTakeOrdersCalldata(takeRequest, {
				preferCache: false
			});
			if (
				!calldataWrapped.error &&
				calldataWrapped.value?.isReady &&
				calldataWrapped.value?.takeOrdersInfo
			) {
				result = calldataWrapped.value;
				break;
			}
		}
	}

	if (!result.isReady || !result.takeOrdersInfo) {
		console.log(`${TX_LOG_PREFIX} skipping fallback: aggregated calldata not ready`, {
			isReady: result.isReady
		});
		return false;
	}

	try {
		validateOrderbookAddress(result.takeOrdersInfo.orderbook as string, network);
	} catch (error) {
		transactionError((error as Error).message as TransactionErrorMessage);
		return true;
	}

	const { calldata, orderbook } = result.takeOrdersInfo;
	console.log(`${TX_LOG_PREFIX} sending aggregated takeOrders tx`, { orderbook });

	try {
		awaitWalletConfirmation(`Awaiting wallet confirmation...`);
		const hash = await sendTransaction({
			to: orderbook as `0x${string}`,
			data: calldata as Hex
		});
		awaitWalletConfirmation(`Awaiting transaction confirmation...`);
		await waitForTransaction(hash, { confirmations: TAKE_TX_CONFIRMATIONS });
		await pollAndFinalizeTakeOrders([hash], primaryOrder, params, network);
		return true;
	} catch (txError) {
		console.error(`${TX_LOG_PREFIX} failed`, txError);
		if (isStaleWalletSessionError(txError)) {
			const msg = await handleStaleWalletSession(config);
			transactionError(msg as TransactionErrorMessage);
			return true;
		}
		const errorMessage = extractTransactionError(txError);
		const errorStr = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : '';
		if (errorStr.includes('allowance') || errorStr.includes('insufficient')) {
			transactionError(
				'Insufficient token allowance. This is a known issue. Please retry the order.' as TransactionErrorMessage
			);
			return true;
		}
		if (errorStr.includes('authentication') || errorStr.includes('log in')) {
			transactionError(errorMessage);
			return true;
		}
		transactionError(errorMessage);
		return true;
	}
};

/**
 * Executes market orders for oracle-enabled orders using RaindexOrder.getTakeCalldata(),
 * which internally calls the oracle server to populate signedContext.
 */
interface OracleOrderInput {
	raindexOrder: RaindexOrder;
	inputIndex: number;
	outputIndex: number;
	amountStr: string;
	priceCapStr: string;
	taker: string;
}

export const handleOracleOrders = async (
	oracleInputs: OracleOrderInput[],
	mode: TakeOrdersMode,
	primaryOrder: SgOrder,
	approvalTokenSymbol: string,
	params: TakeOrdersParams
) => {
	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not found');
	const $signerAddress = get(walletAddress);
	if (!$signerAddress) throw new Error('Signer address not found');

	const network = get(currentNetwork) as Network;

	try {
		validateOrderbookAddress(primaryOrder.orderbook.id, network);
	} catch (error) {
		return transactionError((error as Error).message as TransactionErrorMessage);
	}

	// Send one transaction per oracle order; getTakeCalldata() calls oracle server internally
	awaitWalletConfirmation(`Preparing order...`);
	const oraclePriceCapStr = oracleInputs[0]?.priceCapStr ?? '1';
	const aggregatedTakeRequest = buildTakeOrdersRequest({
		mode,
		params,
		network,
		priceCapStr: oraclePriceCapStr,
		taker: $signerAddress
	});
	if (aggregatedTakeRequest) {
		const handled = await handleAggregatedTakeOrdersCalldata(
			aggregatedTakeRequest,
			primaryOrder,
			params,
			approvalTokenSymbol
		);
		if (handled) {
			return;
		}
	}

	const allTransactionHashes: Hash[] = [];
	const TX_LOG_PREFIX = '[marketTakeStore:handleOracleOrders]';
	const expectedPriceByOrderHash = buildExpectedPriceByOrderHash(params.simulation);
	const multiLegUseTotalAllowance =
		oracleInputs.length > 1 &&
		(params.requiredPayerAllowance ?? 0n) > 0n &&
		params.takerPaysToken.address;

	console.log(`${TX_LOG_PREFIX} starting`, {
		oracleInputCount: oracleInputs.length,
		mode
	});

	if (multiLegUseTotalAllowance && params.requiredPayerAllowance) {
		const o0 = oracleInputs[0];
		const probe = await o0.raindexOrder.getTakeCalldata(
			o0.inputIndex,
			o0.outputIndex,
			o0.taker,
			mode,
			o0.amountStr,
			o0.priceCapStr
		);
		const probePayload = (
			probe.value as { isNeedsApproval?: boolean; approvalInfo?: { calldata?: string } }
		)?.approvalInfo?.calldata;
		if ((probe.value as { isNeedsApproval?: boolean })?.isNeedsApproval && probePayload) {
			await ensureBulkPayerAllowanceIfNeeded({
				requiredWei: params.requiredPayerAllowance,
				payerToken: params.takerPaysToken.address as `0x${string}`,
				symbol: approvalTokenSymbol,
				owner: $signerAddress as `0x${string}`,
				probeApprovalCalldata: probePayload as Hex,
				network
			});
		}
	}

	const fillDecimals = params.orderFillDecimals ?? params.takerWantsToken.decimals;
	if (oracleInputs.length > 1) {
		awaitWalletConfirmation(
			`This order requires ${oracleInputs.length} separate transactions. You will be asked to sign ${oracleInputs.length} times.`,
			{ multiTxProgress: { currentBatch: 0, totalBatches: oracleInputs.length } }
		);
	}
	let carryForwardFillAmount = 0n;

	for (let i = 0; i < oracleInputs.length; i++) {
		const oracleInput = oracleInputs[i];
		const isLast = i === oracleInputs.length - 1;
		const batchLabel = oracleInputs.length > 1 ? ` (${i + 1}/${oracleInputs.length})` : '';
		const baseFillAmount = params.orderFillAmounts?.[i] ?? 0n;
		let effectiveFillAmount = baseFillAmount + carryForwardFillAmount;
		let amountStr = String(
			Float.fromFixedDecimalLossy(effectiveFillAmount, fillDecimals).float.format().value ?? '0'
		);

		if (i > 0) {
			awaitWalletConfirmation(`Preparing order ${i + 1} of ${oracleInputs.length}...`);
		}

		let calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
			oracleInput.inputIndex,
			oracleInput.outputIndex,
			oracleInput.taker,
			mode,
			amountStr,
			oracleInput.priceCapStr
		);

		const maybeApprovalInfo = (
			calldataResult.value as { approvalInfo?: { token: string; calldata: string } }
		)?.approvalInfo;
		if (
			(calldataResult.value as { isNeedsApproval?: boolean })?.isNeedsApproval &&
			maybeApprovalInfo
		) {
			if (multiLegUseTotalAllowance) {
				// Allowance already set for total spend; refresh calldata only.
				calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
					oracleInput.inputIndex,
					oracleInput.outputIndex,
					oracleInput.taker,
					mode,
					amountStr,
					oracleInput.priceCapStr
				);
				if (
					(calldataResult.value as { isNeedsApproval?: boolean })?.isNeedsApproval &&
					maybeApprovalInfo
				) {
					awaitWalletConfirmation(
						`Awaiting wallet confirmation to approve ${approvalTokenSymbol}...`
					);
					const approvalHash = await sendTransaction({
						to: maybeApprovalInfo.token as `0x${string}`,
						data: maybeApprovalInfo.calldata as Hex
					});
					awaitApprovalTx(approvalHash);
					await waitForTransaction(approvalHash, { confirmations: APPROVAL_TX_CONFIRMATIONS });
					calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
						oracleInput.inputIndex,
						oracleInput.outputIndex,
						oracleInput.taker,
						mode,
						amountStr,
						oracleInput.priceCapStr
					);
				}
			} else {
				awaitWalletConfirmation(
					`Awaiting wallet confirmation to approve ${approvalTokenSymbol}...`
				);
				const approvalHash = await sendTransaction({
					to: maybeApprovalInfo.token as `0x${string}`,
					data: maybeApprovalInfo.calldata as Hex
				});
				awaitApprovalTx(approvalHash);
				await waitForTransaction(approvalHash, { confirmations: APPROVAL_TX_CONFIRMATIONS });

				// Rebuild calldata after approval, as SDK expects fresh quote/context.
				calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
					oracleInput.inputIndex,
					oracleInput.outputIndex,
					oracleInput.taker,
					mode,
					amountStr,
					oracleInput.priceCapStr
				);
			}
		}

		// Oracle quote/signature readiness can be transient; retry briefly before failing.
		// Later legs need more attempts after the previous tx changed on-chain / oracle state.
		const notReadyRetries = i === 0 ? 2 : 4;
		if (
			!calldataResult.error &&
			(!calldataResult.value?.isReady || !calldataResult.value?.takeOrdersInfo)
		) {
			for (let retry = 0; retry < notReadyRetries; retry++) {
				await new Promise((resolve) => setTimeout(resolve, TAKE_ORDER_PREPARE_RETRY_MS));
				calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
					oracleInput.inputIndex,
					oracleInput.outputIndex,
					oracleInput.taker,
					mode,
					amountStr,
					oracleInput.priceCapStr
				);
				if (
					calldataResult.error ||
					(calldataResult.value?.isReady && calldataResult.value?.takeOrdersInfo)
				) {
					break;
				}
			}
		}
		// Second+ legs: transient SDK/oracle errors (common right after leg 1 confirms).
		if (calldataResult.error && i > 0) {
			for (let retry = 0; retry < 3; retry++) {
				await new Promise((resolve) => setTimeout(resolve, TAKE_ORDER_TRANSIENT_RETRY_MS));
				calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
					oracleInput.inputIndex,
					oracleInput.outputIndex,
					oracleInput.taker,
					mode,
					amountStr,
					oracleInput.priceCapStr
				);
				if (!calldataResult.error) break;
			}
		}
		if (calldataResult.error) {
			const availableFill = extractAvailableLiquidityAmount(
				calldataResult.error.readableMsg,
				fillDecimals
			);
			if (availableFill !== null && availableFill > 0n && availableFill < effectiveFillAmount) {
				const oldEffectiveFill = effectiveFillAmount;
				effectiveFillAmount = availableFill;
				carryForwardFillAmount = oldEffectiveFill - availableFill;
				amountStr = String(
					Float.fromFixedDecimalLossy(effectiveFillAmount, fillDecimals).float.format().value ?? '0'
				);
				calldataResult = await oracleInput.raindexOrder.getTakeCalldata(
					oracleInput.inputIndex,
					oracleInput.outputIndex,
					oracleInput.taker,
					mode,
					amountStr,
					oracleInput.priceCapStr
				);
			}
		}
		console.log(`${TX_LOG_PREFIX} getTakeCalldata result`, {
			index: i,
			orderHash: oracleInput.raindexOrder.orderHash,
			inputIndex: oracleInput.inputIndex,
			outputIndex: oracleInput.outputIndex,
			amountStr,
			priceCapStr: oracleInput.priceCapStr,
			isError: Boolean(calldataResult.error),
			isReady: Boolean(calldataResult.value?.isReady),
			hasTakeOrdersInfo: Boolean(calldataResult.value?.takeOrdersInfo),
			error: calldataResult.error?.readableMsg
		});

		if (calldataResult.error) {
			if (
				isSkippableMakerLegError(calldataResult.error.readableMsg) &&
				i < oracleInputs.length - 1
			) {
				carryForwardFillAmount = effectiveFillAmount;
				awaitWalletConfirmation(
					buildLegRerouteMessage({
						fromOrderHash: oracleInput.raindexOrder.orderHash,
						toOrderHash: oracleInputs[i + 1]?.raindexOrder.orderHash,
						fromPrice: expectedPriceByOrderHash.get(
							oracleInput.raindexOrder.orderHash.toLowerCase()
						),
						toPrice: expectedPriceByOrderHash.get(
							oracleInputs[i + 1]?.raindexOrder.orderHash?.toLowerCase() ?? ''
						)
					})
				);
				continue;
			}
			console.error(`${TX_LOG_PREFIX} getTakeCalldata error:`, calldataResult.error);
			return transactionError(
				`Order failed: ${calldataResult.error.readableMsg}` as TransactionErrorMessage
			);
		}

		const result = calldataResult.value;
		if (!result.isReady || !result.takeOrdersInfo) {
			console.warn(`${TX_LOG_PREFIX} Order ${i + 1} not ready`, {
				orderHash: oracleInput.raindexOrder.orderHash,
				isReady: result.isReady,
				hasTakeOrdersInfo: Boolean(result.takeOrdersInfo)
			});
			return transactionError(
				`Order not ready for execution yet. Please refresh quotes and retry.` as TransactionErrorMessage
			);
		}

		const { calldata, orderbook } = result.takeOrdersInfo;

		try {
			awaitWalletConfirmation(`Awaiting wallet confirmation to take order${batchLabel}...`);
			const hash = await sendTransaction({
				to: orderbook as `0x${string}`,
				data: calldata as Hex
			});

			awaitWalletConfirmation(`Awaiting transaction confirmation${batchLabel}...`);
			await waitForTransaction(hash, { confirmations: TAKE_TX_CONFIRMATIONS });
			allTransactionHashes.push(hash);
			carryForwardFillAmount = 0n;

			if (!isLast) {
				awaitWalletConfirmation(`Transaction ${i + 1} confirmed. Preparing next order...`);
			} else {
				awaitWalletConfirmation(`Transaction confirmed. Waiting for indexer...`);
			}
		} catch (txError) {
			console.error(`${TX_LOG_PREFIX} Transaction ${i + 1} failed:`, txError);
			if (isStaleWalletSessionError(txError)) {
				const msg = await handleStaleWalletSession(config);
				return transactionError(msg as TransactionErrorMessage);
			}
			const errorMessage = extractTransactionError(txError);
			const errorStr = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : '';
			if (isSkippableMakerLegError(errorMessage) && i < oracleInputs.length - 1) {
				carryForwardFillAmount = effectiveFillAmount;
				awaitWalletConfirmation(
					buildLegRerouteMessage({
						fromOrderHash: oracleInput.raindexOrder.orderHash,
						toOrderHash: oracleInputs[i + 1]?.raindexOrder.orderHash,
						fromPrice: expectedPriceByOrderHash.get(
							oracleInput.raindexOrder.orderHash.toLowerCase()
						),
						toPrice: expectedPriceByOrderHash.get(
							oracleInputs[i + 1]?.raindexOrder.orderHash?.toLowerCase() ?? ''
						)
					})
				);
				continue;
			}
			if (errorStr.includes('allowance') || errorStr.includes('insufficient')) {
				return transactionError(
					'Insufficient token allowance. This is a known issue. Please retry the order.' as TransactionErrorMessage
				);
			}
			if (errorStr.includes('authentication') || errorStr.includes('log in')) {
				return transactionError(errorMessage);
			}
			return transactionError(errorMessage);
		}
	}

	if (allTransactionHashes.length === 0) {
		return transactionError(
			'No orders could be executed. Please try again.' as TransactionErrorMessage
		);
	}

	return pollAndFinalizeTakeOrders(allTransactionHashes, primaryOrder, params, network);
};

/**
 * Executes a market order by taking existing orders from the orderbook.
 *
 * Perspective: TAKER (user executing against orderbook)
 * - takerWantsToken: What the taker wants to RECEIVE
 * - takerPaysToken: What the taker will GIVE AWAY
 * - requestedTakerWantsAmount: Amount taker wants to receive
 */
export const handleTakeOrders = async (
	args: TakeOrdersConfigV5,
	raindexOrder: SgOrder,
	requiredApprovalAmount: bigint,
	params: TakeOrdersParams,
	recalculateConfig?: () => Promise<TakeOrdersConfigV5 | null>,
	raindexOrders?: RaindexOrder[]
) => {
	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not found');
	const $signerAddress = get(walletAddress);
	if (!$signerAddress) throw new Error('Signer address not found');

	// Get network early - used for validation and later for subgraph queries
	const network = get(currentNetwork) as Network;

	// Security: Validate orderbook address BEFORE any approvals are granted
	// This prevents a compromised orderbook from receiving token approvals
	try {
		validateOrderbookAddress(raindexOrder.orderbook.id, network);
	} catch (error) {
		return transactionError((error as Error).message as TransactionErrorMessage);
	}

	const inputIndex = params.ioIndexes.input;
	const outputIndex = params.ioIndexes.output;

	// Validate IO indexes are within bounds
	if (!params.orderData.validInputs[inputIndex]) {
		return transactionError('No input token found in order' as TransactionErrorMessage);
	}
	if (!params.orderData.validOutputs[outputIndex]) {
		return transactionError('No output token found in order' as TransactionErrorMessage);
	}

	// Use takerPaysToken from params for approval - this is what the user gives away
	// Note: We don't use raindexOrder.inputs[inputIndex] because SgOrder.inputs from
	// the subgraph may have different ordering than OrderV4.validInputs
	const approvalTokenAddress = params.takerPaysToken.address;
	const approvalTokenSymbol = params.takerPaysToken.symbol;

	// If recalculateConfig is provided, refresh quotes and recalculate config
	// This handles SELL and BUY (spend mode) where prices may have moved during approval
	let finalConfig = args;
	if (recalculateConfig) {
		awaitWalletConfirmation(`Refreshing market prices...`);
		const updatedConfig = await recalculateConfig();
		if (updatedConfig) {
			finalConfig = updatedConfig;
		}
	}

	awaitWalletConfirmation(`Preparing order...`);
	const isDynamicWallet = get(authMethod) === 'dynamic';
	const fillDecimals = params.orderFillDecimals ?? params.takerWantsToken.decimals;
	const mode: TakeOrdersMode = finalConfig.IOIsInput ? 'buyUpTo' : 'spendUpTo';
	const priceCapFloat = Float.fromHex(finalConfig.maximumIORatio as `0x${string}`);
	const priceCapStr = String(priceCapFloat.value?.format().value ?? '1');
	const aggregatedTakeRequest = buildTakeOrdersRequest({
		mode,
		params,
		network,
		priceCapStr,
		taker: $signerAddress
	});
	if (aggregatedTakeRequest) {
		const handled = await handleAggregatedTakeOrdersCalldata(
			aggregatedTakeRequest,
			raindexOrder,
			params,
			approvalTokenSymbol
		);
		if (handled) {
			return;
		}
	}

	const ordersToExecute = raindexOrders ?? [];
	if (ordersToExecute.length === 0) {
		return transactionError('Failed to prepare order execution' as TransactionErrorMessage);
	}

	console.log('[marketTakeStore:handleTakeOrders] Preparing SDK calldata execution', {
		isDynamicWallet,
		totalOrders: finalConfig.orders.length,
		raindexOrders: ordersToExecute.length,
		hasOrderFillAmounts: !!params.orderFillAmounts,
		orderFillAmounts: params.orderFillAmounts?.map((a) => a.toString()),
		fillDecimals,
		mode,
		priceCapStr
	});

	if (ordersToExecute.length > 1) {
		await new Promise<void>((resolve) => {
			update((state) => ({
				...state,
				status: TransactionStatus.PENDING_MULTI_TX_ACKNOWLEDGMENT,
				message: `This order requires ${ordersToExecute.length} separate transactions. You will be asked to sign ${ordersToExecute.length} times.`,
				data: { multiTxProgress: { currentBatch: 0, totalBatches: ordersToExecute.length } },
				onMultiTxAcknowledge: () => {
					update((s) => ({ ...s, multiTxAcknowledged: true, onMultiTxAcknowledge: null }));
					resolve();
				}
			}));
		});
	}

	const allTransactionHashes: Hash[] = [];
	const TX_LOG_PREFIX = '[marketTakeStore:handleTakeOrders]';
	const expectedPriceByOrderHash = buildExpectedPriceByOrderHash(params.simulation);

	const multiLegUseTotalAllowance =
		ordersToExecute.length > 1 && requiredApprovalAmount > 0n && params.takerPaysToken.address;

	console.log(`${TX_LOG_PREFIX} Starting SDK per-order execution`, {
		totalOrders: ordersToExecute.length,
		mode,
		isDynamicWallet
	});
	let carryForwardFillAmount = 0n;

	if (multiLegUseTotalAllowance) {
		const order0 = ordersToExecute[0];
		const cfg0 = finalConfig.orders[0];
		if (cfg0) {
			const fill0 = params.orderFillAmounts?.[0] ?? 0n;
			const amountStr0 = String(
				Float.fromFixedDecimalLossy(fill0, fillDecimals).float.format().value ?? '0'
			);
			const probe = await order0.getTakeCalldata(
				Number(getMakerInputIOIndex(cfg0)),
				Number(getMakerOutputIOIndex(cfg0)),
				$signerAddress,
				mode,
				amountStr0,
				priceCapStr
			);
			const probePayload = (
				probe.value as { isNeedsApproval?: boolean; approvalInfo?: { calldata?: string } }
			)?.approvalInfo?.calldata;
			if ((probe.value as { isNeedsApproval?: boolean })?.isNeedsApproval && probePayload) {
				await ensureBulkPayerAllowanceIfNeeded({
					requiredWei: requiredApprovalAmount,
					payerToken: approvalTokenAddress as `0x${string}`,
					symbol: approvalTokenSymbol,
					owner: $signerAddress as `0x${string}`,
					probeApprovalCalldata: probePayload as Hex,
					network
				});
			}
		}
	}

	for (let orderIndex = 0; orderIndex < ordersToExecute.length; orderIndex++) {
		const orderToExecute = ordersToExecute[orderIndex];
		const orderConfig = finalConfig.orders[orderIndex];
		if (!orderConfig) {
			return transactionError('Order config mismatch' as TransactionErrorMessage);
		}
		if (orderIndex > 0) {
			awaitWalletConfirmation(`Preparing order ${orderIndex + 1} of ${ordersToExecute.length}...`);
		}
		const isMultiBatch = ordersToExecute.length > 1;
		const batchLabel = isMultiBatch ? ` (${orderIndex + 1}/${ordersToExecute.length})` : '';
		const baseFillAmount = params.orderFillAmounts?.[orderIndex] ?? 0n;
		let fillAmount = baseFillAmount + carryForwardFillAmount;
		let amountStr = String(
			Float.fromFixedDecimalLossy(fillAmount, fillDecimals).float.format().value ?? '0'
		);

		let hash: Hash;
		try {
			const progressData: TransactionMetadata = isMultiBatch
				? {
						multiTxProgress: { currentBatch: orderIndex + 1, totalBatches: ordersToExecute.length }
					}
				: {};
			const calldataResult = await orderToExecute.getTakeCalldata(
				Number(getMakerInputIOIndex(orderConfig)),
				Number(getMakerOutputIOIndex(orderConfig)),
				$signerAddress,
				mode,
				amountStr,
				priceCapStr
			);

			const maybeApprovalInfo = (
				calldataResult.value as { approvalInfo?: { token: string; calldata: string } }
			)?.approvalInfo;
			let readyCalldataResult = calldataResult;
			if (
				(calldataResult.value as { isNeedsApproval?: boolean })?.isNeedsApproval &&
				maybeApprovalInfo
			) {
				if (multiLegUseTotalAllowance) {
					readyCalldataResult = await orderToExecute.getTakeCalldata(
						Number(getMakerInputIOIndex(orderConfig)),
						Number(getMakerOutputIOIndex(orderConfig)),
						$signerAddress,
						mode,
						amountStr,
						priceCapStr
					);
					if (
						(readyCalldataResult.value as { isNeedsApproval?: boolean })?.isNeedsApproval &&
						maybeApprovalInfo
					) {
						awaitWalletConfirmation(
							`Awaiting wallet confirmation to approve ${approvalTokenSymbol}${batchLabel}...`,
							progressData
						);
						const approvalHash = await sendTransaction({
							to: maybeApprovalInfo.token as `0x${string}`,
							data: maybeApprovalInfo.calldata as Hex
						});
						awaitApprovalTx(approvalHash);
						await waitForTransaction(approvalHash, { confirmations: APPROVAL_TX_CONFIRMATIONS });
						readyCalldataResult = await orderToExecute.getTakeCalldata(
							Number(getMakerInputIOIndex(orderConfig)),
							Number(getMakerOutputIOIndex(orderConfig)),
							$signerAddress,
							mode,
							amountStr,
							priceCapStr
						);
					}
				} else {
					awaitWalletConfirmation(
						`Awaiting wallet confirmation to approve ${approvalTokenSymbol}${batchLabel}...`,
						progressData
					);
					const approvalHash = await sendTransaction({
						to: maybeApprovalInfo.token as `0x${string}`,
						data: maybeApprovalInfo.calldata as Hex
					});
					awaitApprovalTx(approvalHash);
					await waitForTransaction(approvalHash, { confirmations: APPROVAL_TX_CONFIRMATIONS });
					readyCalldataResult = await orderToExecute.getTakeCalldata(
						Number(getMakerInputIOIndex(orderConfig)),
						Number(getMakerOutputIOIndex(orderConfig)),
						$signerAddress,
						mode,
						amountStr,
						priceCapStr
					);
				}
			}
			if (readyCalldataResult.error || !readyCalldataResult.value?.takeOrdersInfo) {
				if (orderIndex > 0) {
					for (let retry = 0; retry < 3; retry++) {
						await new Promise((resolve) => setTimeout(resolve, TAKE_ORDER_TRANSIENT_RETRY_MS));
						readyCalldataResult = await orderToExecute.getTakeCalldata(
							Number(getMakerInputIOIndex(orderConfig)),
							Number(getMakerOutputIOIndex(orderConfig)),
							$signerAddress,
							mode,
							amountStr,
							priceCapStr
						);
						if (!readyCalldataResult.error && readyCalldataResult.value?.takeOrdersInfo) {
							break;
						}
					}
				}
				const availableFill = extractAvailableLiquidityAmount(
					readyCalldataResult.error?.readableMsg,
					fillDecimals
				);
				if (availableFill !== null && availableFill > 0n && availableFill < fillAmount) {
					const oldFillAmount = fillAmount;
					fillAmount = availableFill;
					carryForwardFillAmount = oldFillAmount - availableFill;
					amountStr = String(
						Float.fromFixedDecimalLossy(fillAmount, fillDecimals).float.format().value ?? '0'
					);
					readyCalldataResult = await orderToExecute.getTakeCalldata(
						Number(getMakerInputIOIndex(orderConfig)),
						Number(getMakerOutputIOIndex(orderConfig)),
						$signerAddress,
						mode,
						amountStr,
						priceCapStr
					);
				}
				if (readyCalldataResult.error || !readyCalldataResult.value?.takeOrdersInfo) {
					if (
						isSkippableMakerLegError(readyCalldataResult.error?.readableMsg) &&
						orderIndex < ordersToExecute.length - 1
					) {
						carryForwardFillAmount = fillAmount;
						awaitWalletConfirmation(
							buildLegRerouteMessage({
								fromOrderHash: orderToExecute.orderHash,
								toOrderHash: ordersToExecute[orderIndex + 1]?.orderHash,
								fromPrice: expectedPriceByOrderHash.get(orderToExecute.orderHash.toLowerCase()),
								toPrice: expectedPriceByOrderHash.get(
									ordersToExecute[orderIndex + 1]?.orderHash?.toLowerCase() ?? ''
								)
							}),
							progressData
						);
						continue;
					}
					return transactionError(
						(readyCalldataResult.error?.readableMsg ||
							'Failed to generate transaction calldata') as TransactionErrorMessage
					);
				}
			}

			awaitWalletConfirmation(
				`Awaiting wallet confirmation to take order${batchLabel}...`,
				progressData
			);

			hash = await sendTransaction({
				to: readyCalldataResult.value.takeOrdersInfo.orderbook as `0x${string}`,
				data: readyCalldataResult.value.takeOrdersInfo.calldata as Hex
			});

			console.log(`${TX_LOG_PREFIX} Order ${orderIndex + 1} transaction submitted`, {
				hash,
				orderHash: orderToExecute.orderHash
			});

			awaitWalletConfirmation(`Awaiting transaction confirmation${batchLabel}...`, progressData);
			await waitForTransaction(hash, { confirmations: TAKE_TX_CONFIRMATIONS });

			console.log(`${TX_LOG_PREFIX} Order ${orderIndex + 1} transaction confirmed`, { hash });

			allTransactionHashes.push(hash);
			carryForwardFillAmount = 0n;

			if (orderIndex < ordersToExecute.length - 1) {
				awaitWalletConfirmation(
					`Transaction ${orderIndex + 1} confirmed. Preparing next batch...`,
					progressData
				);
			} else {
				awaitWalletConfirmation(`Transaction confirmed. Waiting for indexer...`);
			}
		} catch (error) {
			console.error(`${TX_LOG_PREFIX} Order ${orderIndex + 1} failed`, {
				orderIndex,
				totalOrders: ordersToExecute.length,
				mode,
				fillAmount: fillAmount.toString(),
				error
			});

			if (isStaleWalletSessionError(error)) {
				const msg = await handleStaleWalletSession(config);
				return transactionError(msg as TransactionErrorMessage);
			}

			const errorMessage = extractTransactionError(error);

			console.error('[marketTakeStore:handleTakeOrders] Transaction error:', error);
			if (isSkippableMakerLegError(errorMessage) && orderIndex < ordersToExecute.length - 1) {
				carryForwardFillAmount = fillAmount;
				awaitWalletConfirmation(
					buildLegRerouteMessage({
						fromOrderHash: orderToExecute.orderHash,
						toOrderHash: ordersToExecute[orderIndex + 1]?.orderHash,
						fromPrice: expectedPriceByOrderHash.get(orderToExecute.orderHash.toLowerCase()),
						toPrice: expectedPriceByOrderHash.get(
							ordersToExecute[orderIndex + 1]?.orderHash?.toLowerCase() ?? ''
						)
					})
				);
				continue;
			}

			// Check for insufficient allowance error and provide helpful message
			const errorStr = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : '';
			if (errorStr.includes('allowance') || errorStr.includes('insufficient')) {
				return transactionError(
					'Insufficient token allowance. This is a known issue. Please retry the order.' as TransactionErrorMessage
				);
			}

			// Check for authentication errors
			if (errorStr.includes('authentication') || errorStr.includes('log in')) {
				return transactionError(errorMessage);
			}

			return transactionError(errorMessage);
		}
	}

	return pollAndFinalizeTakeOrders(allTransactionHashes, raindexOrder, params, network);
};
