// viem TestClient wrappers for anvil control plane: snapshot/revert, ERC20 funding via
// setStorageAt slot derivation, and timestamp advancement for stale-oracle / market-hours
// forcing. Bound to http://127.0.0.1:8545 — the anvil instance spawned by globalSetup.
//
// References:
// - viem TestClient: https://viem.sh/docs/clients/test
// - Slot derivation: keccak256(abi.encode(holder, balanceSlot)) — covered in
//   01-RUNBOOK.md §"ERC20 balance slot table".
// - Pitfall 6 (timestamp advance): evm_setNextBlockTimestamp does not affect eth_call
//   reads until a block lands at the new timestamp; advanceTime() forces evm_mine.
import {
	createTestClient,
	encodeAbiParameters,
	http,
	keccak256,
	pad,
	publicActions,
	toHex
} from 'viem';
import { base } from 'viem/chains';

export type AnvilTestClient = ReturnType<typeof createAnvilTestClient>;

export function createAnvilTestClient() {
	return createTestClient({
		chain: base,
		mode: 'anvil',
		transport: http('http://127.0.0.1:8545')
	}).extend(publicActions);
}

/**
 * Run `fn` inside an anvil snapshot. Reverts on completion (success or throw) so
 * downstream tests see the pre-snapshot state.
 *
 * IMPORTANT (per 01-RUNBOOK §"Snapshot/revert"): take the snapshot BEFORE any
 * setStorageAt funding calls. Reverting rolls back funding writes too.
 */
export async function withSnapshot<T>(
	client: AnvilTestClient,
	fn: () => Promise<T>
): Promise<T> {
	const id = await client.snapshot();
	try {
		return await fn();
	} finally {
		await client.revert({ id });
	}
}

/**
 * Fund an ERC20 balance directly via anvil_setStorageAt. Avoids whale impersonation +
 * Transfer event side effects.
 *
 * The storage layout is keccak256(holder || balanceSlot) for OpenZeppelin-style
 * mappings. balanceSlot is per-token; see 01-RUNBOOK.md §"ERC20 balance slot table".
 */
export async function fundErc20(args: {
	client: AnvilTestClient;
	token: `0x${string}`;
	holder: `0x${string}`;
	amount: bigint;
	balanceSlot: number;
}): Promise<void> {
	const slot = keccak256(
		encodeAbiParameters(
			[{ type: 'address' }, { type: 'uint256' }],
			[args.holder, BigInt(args.balanceSlot)]
		)
	);
	await args.client.setStorageAt({
		address: args.token,
		index: slot,
		value: pad(toHex(args.amount), { size: 32 })
	});
}

/**
 * Advance the chain clock by `seconds` and mine a block so on-chain reads observe
 * the new timestamp (Pitfall 6).
 */
export async function advanceTime(client: AnvilTestClient, seconds: number): Promise<void> {
	const block = await client.getBlock();
	await client.setNextBlockTimestamp({ timestamp: block.timestamp + BigInt(seconds) });
	await client.mine({ blocks: 1 });
}
