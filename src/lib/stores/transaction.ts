/**
 * Re-export façade for transaction store (TRADE-02).
 *
 * Preserves UI bindings during the migration. New code should import from
 * the focused module directly:
 *   - transactionShared (types + leaf store + status helpers)
 *   - deployTransactionStore (deploy / wrap / withdraw / remove-order methods)
 *   - marketTakeStore (5 take-order orchestration methods)
 *   - approvalStore (ensureAllowance utility)
 *   - partialFillDetection (detectPartialFill helper)
 *
 * The 15+ existing UI consumers use the default export below for both
 * reactive subscriptions (`$transactionStore.status`, `$transactionStore.data`)
 * and method invocations (`transactionStore.handleDcaDeploy(...)`).
 * marketOrderExecution.ts is the only service-side consumer; it imports
 * from $lib/stores/marketTakeStore directly to sever the circular edge.
 */

import { transactionStoreInternal } from './transactionShared';
import * as deploy from './deployTransactionStore';
import * as marketTake from './marketTakeStore';

// prettier-ignore
export { TransactionStatus, classifyError, validateOrderbookAddress, isOrderbookTrusted, extractTransactionError } from './transactionShared';
// prettier-ignore
export type { TransactionMetadata, MarketOrderSummary, RaindexLink, MultiTxProgress, AssetTokenInfo } from './transactionShared';

export default {
	...transactionStoreInternal,
	...deploy,
	...marketTake
};
