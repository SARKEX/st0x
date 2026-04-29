import {
	transactionStoreInternal,
	TransactionStatus,
	classifyError,
	validateOrderbookAddress,
	isOrderbookTrusted,
	extractTransactionError
} from './transactionShared';

// classifyError, isOrderbookTrusted, validateOrderbookAddress, and
// extractTransactionError were lifted into ./transactionShared (TRADE-02 PR-1).
// They are imported above alongside TransactionStatus + the shared interfaces.

// The market-take helpers (isSkippableMakerLegError, extractAvailableLiquidityAmount,
// buildExpectedPriceByOrderHash, formatPriceForReroute, shortOrderHash, buildLegRerouteMessage,
// sumBigints, deriveTakeRequestAmountWei, buildTakeOrdersRequest) and the aggregated-take
// calldata cache (AggregatedTakeCacheEntry, aggregatedTakeCalldataCache,
// getAggregatedTakeCacheKey, shouldCacheAggregatedTakeResult) were lifted into
// ./marketTakeStore (TRADE-02 PR-2). They are private to that module — used only by
// the 5 take-order methods which now also live there.

// The deploy / wrap / withdraw / remove-order orchestration methods were lifted
// into ./deployTransactionStore (TRADE-02 PR-3). They are imported below + spread
// into the export-default object so the 15+ existing UI consumers keep working.
// findVaultByIdAndToken and createRaindexLink (helpers used exclusively by those
// orchestration methods) moved with them — no longer in this file.

// Re-export market-take methods from marketTakeStore (TRADE-02 PR-2).
// Existing UI consumers continue to call transactionStore.handleOracleOrders(...)
// etc. via the default export, but marketOrderExecution.ts (the only service-side
// consumer) now imports them directly from $lib/stores/marketTakeStore — that's
// what severs the circular-import edge.
import {
	preloadAggregatedTakeOrdersCalldata,
	handleAggregatedTakeOrdersCalldata,
	handleTakeOrders,
	handleOracleOrders,
	pollAndFinalizeTakeOrders
} from './marketTakeStore';

// Re-export deploy/wrap/withdraw/remove-order methods from deployTransactionStore
// (TRADE-02 PR-3). Existing UI consumers (deploy buttons, vault management UI,
// WrapUnwrapModal, OrderActionsModal, etc.) continue to call e.g.
// transactionStore.handleDcaDeploy(...) via the default export.
import {
	handleStrategyDeployment,
	showRainlangConfirmation,
	handleDsfDeploy,
	handleDcaDeploy,
	handleLimitDeploy,
	handleFolioDeploy,
	handleWithdraw,
	handleRemoveOrder,
	handleWithdrawFromOrder,
	handleWrapUnwrap
} from './deployTransactionStore';

// pollAndFinalizeTakeOrders is imported above so it can be re-exposed on the
// default export below alongside the other market-take methods. Reference here
// to silence unused-import linting if no other site uses it directly.
void pollAndFinalizeTakeOrders;
void handleStrategyDeployment;
void showRainlangConfirmation;

const transactionStore = () => {
	// Destructure the leaf-owned store API so the existing UI bindings can keep
	// reading state via `$transactionStore.X` reactive subscriptions and calling
	// `transactionStore.X(...)` methods through the export-default below.
	const {
		subscribe,
		set,
		reset,
		checkingWalletAllowance,
		awaitWalletConfirmation,
		awaitApprovalTx,
		transactionSuccess,
		transactionError,
		acknowledgeMultiTx
	} = transactionStoreInternal;
	// `set` is currently unused in this file but is part of the store API surface
	// preserved by the façade default-export below.
	void set;

	return {
		subscribe,
		reset,
		checkingWalletAllowance,
		awaitWalletConfirmation,
		awaitApprovalTx,
		transactionSuccess,
		transactionError,
		acknowledgeMultiTx,
		handleDcaDeploy,
		handleLimitDeploy,
		handleDsfDeploy,
		handleFolioDeploy,
		handleOracleOrders,
		preloadAggregatedTakeOrdersCalldata,
		handleAggregatedTakeOrdersCalldata,
		handleTakeOrders,
		handleWithdraw,
		handleWrapUnwrap,
		handleRemoveOrder,
		handleWithdrawFromOrder
	};
};

export default transactionStore();

// ---------------------------------------------------------------------------
// Re-export façade for back-compat (TRADE-02 PR-1).
//
// New code should import from the focused module directly (transactionShared
// today; deployTransactionStore + marketTakeStore land in Plans 03/04).
//
// PRESERVED until at least the end of Phase 2 to avoid breaking the 15+
// existing UI binding sites that do
//   `import transactionStore, { TransactionStatus } from '$lib/stores/transaction'`.
// ---------------------------------------------------------------------------
// prettier-ignore
export { TransactionStatus, classifyError, validateOrderbookAddress, isOrderbookTrusted, extractTransactionError };
// prettier-ignore
export type { TransactionMetadata, MarketOrderSummary, RaindexLink, MultiTxProgress, AssetTokenInfo } from './transactionShared';
