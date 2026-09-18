/**
 * Approval utility — extracted from transaction.ts (TRADE-02 PR-4).
 *
 * Callable utility (NOT a Svelte store) that owns the canonical
 * "balance / allowance read + ERC20 approve tx submission" sequence.
 * Consumed by both `deployTransactionStore` and `marketTakeStore` so the
 * approval state machine lives in exactly one place.
 *
 * Contract:
 *   - The utility never mutates `transactionStoreInternal` directly.
 *     The caller controls UI state via the `setStatus` callback.
 *   - All wagmi/viem RPC calls inside ensureAllowance are wrapped with
 *     `withRetry` per CONVENTIONS.md "Rule: any new wagmi/viem call that
 *     hits a load-balanced RPC should be wrapped with `withRetry`".
 *   - APPROVAL_TX_CONFIRMATIONS = 2 per CONVENTIONS.md "Confirmations &
 *     Transaction Hygiene". DO NOT lower — confirmations=1 races with
 *     short-tail re-orgs on supported EVM networks.
 *
 * Pitfall-aware design (per 02-PATTERNS.md "Variation flag"):
 *   The existing inline approval code in transaction.ts interleaved
 *   approval RPC calls with `setState(TransactionStatus.PENDING_APPROVAL)`
 *   updates. Lifting that interleaving into the utility would force the
 *   utility to import `transactionStoreInternal`, which couples it to a
 *   specific consumer. Instead the caller passes a `setStatus` callback;
 *   the utility stays pure on RPC.
 */

import { get } from 'svelte/store';
import { wagmiConfig } from 'svelte-wagmi';
import {
	readContract as wagmiReadContract,
	sendTransaction as wagmiSendTransaction,
	waitForTransactionReceipt
} from '@wagmi/core';
import type { Address, Hex } from 'viem';
import { encodeFunctionData, erc20Abi } from 'viem';
import { withRetry } from '$lib/utils/retry';
import type { Network } from '$lib/config/network';
import { TransactionStatus } from './transactionShared';

/**
 * Confirmations required before treating an approval tx as final.
 *
 * Mirrors the `APPROVAL_TX_CONFIRMATIONS` exported from
 * `$lib/services/walletService` (which existing inline approval blocks in
 * deployTransactionStore.ts and marketTakeStore.ts already consume). Defined
 * here too so callers that consume `ensureAllowance` get the constant from
 * a single source of truth.
 */
export const APPROVAL_TX_CONFIRMATIONS = 2;

export interface EnsureAllowanceParams {
	token: { address: Address };
	owner: Address;
	spender: Address;
	amount: bigint;
	network: Network;
	setStatus: (s: TransactionStatus) => void;
}

/**
 * Reads the current ERC20 allowance for (owner -> spender). If the allowance
 * is already >= amount, returns immediately without any UI status transition
 * other than the initial CHECKING_ALLOWANCE marker. Otherwise sends an
 * `approve(spender, amount)` tx and waits for APPROVAL_TX_CONFIRMATIONS.
 *
 * The function does NOT throw on user rejection or RPC failure — exceptions
 * propagate to the caller, which already owns the surrounding error-handling
 * cascade (stale wallet session detection, error classification, UI status
 * rollback). Keeping the utility throw-on-failure preserves the existing
 * control-flow shape in deployTransactionStore + marketTakeStore.
 */
export const ensureAllowance = async ({
	token,
	owner,
	spender,
	amount,
	network,
	setStatus
}: EnsureAllowanceParams): Promise<void> => {
	setStatus(TransactionStatus.CHECKING_ALLOWANCE);

	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not found');

	const currentAllowance = (await withRetry(() =>
		wagmiReadContract(config, {
			address: token.address,
			abi: erc20Abi,
			functionName: 'allowance',
			args: [owner, spender],
			chainId: network.chainId
		})
	)) as bigint;

	if (currentAllowance >= amount) return;

	setStatus(TransactionStatus.PENDING_APPROVAL);

	const approveData = encodeFunctionData({
		abi: erc20Abi,
		functionName: 'approve',
		args: [spender, amount]
	});

	const approvalHash = (await withRetry(() =>
		wagmiSendTransaction(config, {
			to: token.address,
			data: approveData,
			chainId: network.chainId
		})
	)) as Hex;

	console.log(`[approvalStore] Approval tx submitted: ${approvalHash}`);

	await waitForTransactionReceipt(config, {
		hash: approvalHash,
		confirmations: APPROVAL_TX_CONFIRMATIONS,
		chainId: network.chainId
	});

	console.log(
		`[approvalStore] Approval tx confirmed (${APPROVAL_TX_CONFIRMATIONS} confirmations).`
	);
};
