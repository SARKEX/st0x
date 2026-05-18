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
	encodeFunctionData,
	erc20Abi,
	http,
	keccak256,
	pad,
	parseEther,
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
export async function withSnapshot<T>(client: AnvilTestClient, fn: () => Promise<T>): Promise<T> {
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
 * Fund an ERC20 balance by impersonating a known holder and calling transfer().
 * Use this for tokens whose balance storage doesn't live at a predictable slot
 * (proxy contracts with custom layouts, ERC4626 wrappers, etc.) — slot-derivation
 * via `fundErc20()` is unreliable for those.
 *
 * The donor must have >= amount of `token` at the current chain head. The Rain
 * Orderbook (0xe522cB...) is a good universal donor for any tokenized security
 * traded on st0x since it custodies user vault balances.
 *
 * Caveat: `transfer` emits a Transfer event from `donor` to `holder`. Tests that
 * scan logs for OrderAdded / take events should bound their fromBlock so they
 * don't accidentally pick up this funding transfer.
 */
/**
 * Send a transaction from an anvil-impersonated account via the raw
 * eth_sendTransaction RPC. Anvil signs server-side for unlocked accounts.
 * Waits for receipt AND verifies status === 'success' so silent reverts
 * surface as exceptions (a previous lacuna here made a tAMZN funding revert
 * cascade into spurious downstream test failures).
 *
 * Caller MUST have already called impersonateAccount + setBalance on `from`.
 */
export async function sendImpersonatedTx(
	client: AnvilTestClient,
	params: { from: `0x${string}`; to: `0x${string}`; data: `0x${string}` }
): Promise<`0x${string}`> {
	const resp = await fetch('http://127.0.0.1:8545', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'eth_sendTransaction',
			params: [params]
		})
	});
	const json = (await resp.json()) as { result?: `0x${string}`; error?: { message: string } };
	if (json.error || !json.result) {
		throw new Error(`sendImpersonatedTx failed: ${json.error?.message ?? 'no tx hash'}`);
	}
	const receipt = await client.waitForTransactionReceipt({ hash: json.result });
	if (receipt.status !== 'success') {
		throw new Error(
			`sendImpersonatedTx tx reverted: hash=${json.result} from=${params.from} to=${params.to}`
		);
	}
	return json.result;
}

export async function fundErc20ViaImpersonation(args: {
	client: AnvilTestClient;
	token: `0x${string}`;
	donor: `0x${string}`;
	holder: `0x${string}`;
	amount: bigint;
}): Promise<void> {
	await args.client.impersonateAccount({ address: args.donor });
	try {
		// Donor needs ETH for gas. setBalance is idempotent.
		await args.client.setBalance({ address: args.donor, value: parseEther('1') });
		const data = encodeFunctionData({
			abi: erc20Abi,
			functionName: 'transfer',
			args: [args.holder, args.amount]
		});
		await sendImpersonatedTx(args.client, { from: args.donor, to: args.token, data });
	} finally {
		// Always release impersonation so subsequent tests see a clean anvil.
		await args.client.stopImpersonatingAccount({ address: args.donor });
	}
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
