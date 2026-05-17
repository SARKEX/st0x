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

// Selector for the deployed Rain Orderbook's deposit function. Verified by
// decoding a known-good live deposit tx (0x1e78b0abe70db96cbcfb05833a1dc0f84c387494aa0cb18fd80b92a043c35f76).
// The deployed contract at 0xe522cB...a4fd7C9D has a unique selector that
// does NOT match the canonical V4 (deposit2 = 0x91337c0a) or V5
// (deposit3 = 0x7921a962) signatures — likely an intermediate / customised
// build. Calldata layout (164 bytes total after selector):
//   word[0]: address token (32-byte left-padded)
//   word[1]: bytes32 vaultId
//   word[2]: bytes32 amount (Rain Float — 4-byte signed exp + 28-byte mantissa)
//   word[3]: 0x80 (dynamic-array offset)
//   word[4]: 0   (TaskV2[] length = 0, empty post tasks)
const ORDERBOOK_DEPOSIT_SELECTOR = '0x2fbc4ba0' as const;

/**
 * Encode a raw token amount as a Rain Decimal Float (bytes32).
 *   Float = mantissa × 10^exp
 *   exp = -decimals (signed int32, big-endian, occupies bytes 0..3)
 *   mantissa = amount × 10^decimals = raw uint256 amount (right-aligned, 28 bytes)
 *
 * For e.g. 0.5 tNVDA (decimals=18): amount = 5e17, decimals = 18 →
 *   prefix = 0xffffffee (signed -18)
 *   mantissa28 = 28-byte big-endian of 5e17
 */
export function toFloat(amount: bigint, decimals: number): `0x${string}` {
	const expI32 = ((-decimals) & 0xffffffff) >>> 0;
	const expHex = expI32.toString(16).padStart(8, '0');
	const mantHex = amount.toString(16).padStart(56, '0');
	if (mantHex.length > 56) {
		throw new Error(`mantissa overflow: ${amount} does not fit in 28 bytes`);
	}
	return `0x${expHex}${mantHex}`;
}

/**
 * Pre-fund a specific Rain Orderbook order's vault by impersonating the
 * vault owner, transferring tokens to them, approving the orderbook, and
 * calling deposit2().
 *
 * Why this is needed: at FORK_BLOCK 45_990_727 the active wtNVDA ask/bid
 * orders appear on the subgraph but their on-chain output vaults are empty.
 * The SDK preflight rejects with "No liquidity available right now" before
 * any UI transaction can fire. Pre-funding the output vaults of the orders
 * the SDK is expected to take from restores fillability for the E2E specs.
 *
 * Caller must provide the token-funding mechanism:
 *   - `slot`: fund via setStorageAt (USDC slot 9 etc.)
 *   - `donor`: impersonate a known holder and transfer (for ST0x wrappers
 *     where slot derivation is unreliable — orderbook itself is the
 *     universal donor for active assets).
 */
export async function fundOrderbookVault(args: {
	client: AnvilTestClient;
	orderbook: `0x${string}`;
	owner: `0x${string}`;
	token: `0x${string}`;
	tokenDecimals: number;
	vaultId: `0x${string}`;
	amount: bigint;
	funding: { method: 'slot'; slot: number } | { method: 'donor'; donor: `0x${string}` };
}): Promise<void> {
	// Step 1 — give the owner enough of `token` to deposit. Done BEFORE
	// impersonating the owner so nested-impersonation never overlaps with
	// the deposit call.
	if (args.funding.method === 'slot') {
		await fundErc20({
			client: args.client,
			token: args.token,
			holder: args.owner,
			amount: args.amount,
			balanceSlot: args.funding.slot
		});
	} else {
		await fundErc20ViaImpersonation({
			client: args.client,
			token: args.token,
			donor: args.funding.donor,
			holder: args.owner,
			amount: args.amount
		});
	}

	// Step 2 — impersonate the owner, approve, deposit.
	await args.client.impersonateAccount({ address: args.owner });
	try {
		await args.client.setBalance({ address: args.owner, value: parseEther('1') });
		const approveData = encodeFunctionData({
			abi: erc20Abi,
			functionName: 'approve',
			args: [args.orderbook, args.amount]
		});
		await sendImpersonatedTx(args.client, {
			from: args.owner,
			to: args.token,
			data: approveData
		});
		// Build raw calldata for the orderbook deposit. Layout per the live-tx
		// decode above: selector + token(32) + vaultId(32) + amountFloat(32) +
		// offset(0x80) + emptyArrayLength(0).
		const amountFloat = toFloat(args.amount, args.tokenDecimals);
		const tokenWord = pad(args.token, { size: 32 }).slice(2);
		const vaultIdWord = pad(args.vaultId, { size: 32 }).slice(2);
		const amountWord = amountFloat.slice(2);
		const offsetWord = pad(toHex(0x80n), { size: 32 }).slice(2);
		const lenWord = pad(toHex(0n), { size: 32 }).slice(2);
		const depositData =
			`${ORDERBOOK_DEPOSIT_SELECTOR}${tokenWord}${vaultIdWord}${amountWord}${offsetWord}${lenWord}` as `0x${string}`;
		await sendImpersonatedTx(args.client, {
			from: args.owner,
			to: args.orderbook,
			data: depositData
		});
	} finally {
		await args.client.stopImpersonatingAccount({ address: args.owner });
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
