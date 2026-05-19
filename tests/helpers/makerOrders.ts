// Maker-order deployment helper.
//
// Deploys a fixed-limit order to the orderbook on anvil using the production Rain
// SDK (DotrainRegistry + DotrainOrderGui) — same path as the UI's
// `src/lib/services/orderDeployment.ts`. The only thing we do differently is
// (a) point the SDK's RPC at anvil instead of LIVE Base, and (b) submit
// transactions via a viem walletClient bound to a maker private key so the
// resulting orders are owned by an address distinct from the taker
// (FUNDED_ACCOUNT) — the orderbook contract reverts self-takes.
//
// The returned object is everything the Goldsky+REST stubs need to synthesize
// responses for this order (the subgraph never sees anvil tx; see
// .planning/phases/01-ui-driven-e2e-order-test-coverage/HANDOVER-2026-05-18.md
// §"Goldsky dependency" for context).
//
// orderHash extraction
// --------------------
// We compute orderHash off-chain via the SDK's `getOrderHash(OrderV4)` after
// decoding the bare addOrder calldata produced by `gui.generateAddOrderCalldata()`.
// This is the same hash the Rain orderbook would compute on-chain, and it avoids
// having to parse `AddOrderV*` event logs whose topic isn't documented in the
// SDK type surface.

import {
	createWalletClient,
	decodeFunctionData,
	encodeAbiParameters,
	erc20Abi,
	http,
	parseAbi,
	parseAbiParameters,
	formatUnits
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { DotrainRegistry, getOrderHash, type OrderV4 } from '@rainlanguage/orderbook';
import type { AnvilTestClient } from './anvilControl';

const ANVIL_RPC = 'http://127.0.0.1:8545';

// The deployed orderbook on Base mainnet — same address the fork inherits.
// Source: src/lib/clients/raindex.ts:SETTINGS_YAML / src/lib/config/networks.ts.
export const ORDERBOOK_ADDRESS =
	'0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D' as `0x${string}`;

// OrderV4 ABI from src/lib/utils/orderbook.ts:67-70. Mirrored verbatim — the
// shape must match what the orderbook contract expects and what the subgraph
// indexes as `orderBytes`.
const ORDER_V4_ABI_PARAMS = parseAbiParameters(
	'(address owner, (address interpreter, address store, bytes bytecode) evaluable, (address token, bytes32 vaultId)[] validInputs, (address token, bytes32 vaultId)[] validOutputs, bytes32 nonce)'
);

// addOrder3 selector + ABI used by the deployed orderbook for fixed-limit deploys.
// The bare addOrder calldata returned by `gui.generateAddOrderCalldata()` is
// `<selector(4)><abi-encoded args>`. We need to extract the OrderV4 argument
// to compute the hash. The function name + argument list comes from the Rain
// orderbook contract — `task` field omitted in v4.
const ADD_ORDER_ABI = parseAbi([
	'function addOrder3((address owner, (address interpreter, address store, bytes bytecode) evaluable, (address token, bytes32 vaultId)[] validInputs, (address token, bytes32 vaultId)[] validOutputs, bytes32 nonce) config, (address,bytes,bytes[])[] post) external'
]);

export type MakerSide = 'sell' | 'buy';

export interface DeployMakerOrderParams {
	testClient: AnvilTestClient;
	/** Maker's private key. MUST differ from FUNDED_ACCOUNT (taker) — orderbook blocks self-takes. */
	makerPrivateKey: `0x${string}`;
	/** Asset token (e.g. wtCOIN). */
	assetToken: { address: `0x${string}`; symbol: string; decimals: number };
	/** Payment token (e.g. USDC). */
	paymentToken: { address: `0x${string}`; symbol: string; decimals: number };
	/**
	 * `sell` = maker offers asset, takes payment (Ask side; taker BUYS from this order).
	 * `buy`  = maker offers payment, takes asset (Bid side; taker SELLS into this order).
	 */
	side: MakerSide;
	/**
	 * Human price = payment per asset. e.g. for wtCOIN/USDC at $300, set '300'.
	 * Identical semantics to the UI's "Limit Price" field.
	 */
	pricePaymentPerAsset: string;
	/**
	 * Deposit amount in the OUTPUT-token native decimals. The output token is the
	 * one the maker GIVES AWAY (asset for sell, payment for buy).
	 */
	depositAmount: bigint;
	/** Registry URL (defaults to local preview server). */
	registryUrl?: string;
}

export interface DeployedMakerOrder {
	orderHash: `0x${string}`;
	/** ABI-encoded OrderV4 — the same bytes the subgraph would index as `orderBytes`. */
	orderBytes: `0x${string}`;
	owner: `0x${string}`;
	orderbookAddress: `0x${string}`;
	inputToken: { address: `0x${string}`; symbol: string; decimals: number };
	outputToken: { address: `0x${string}`; symbol: string; decimals: number };
	/** Hex-padded 32-byte vault IDs (whatever the SDK chose). */
	inputVaultId: `0x${string}`;
	outputVaultId: `0x${string}`;
	/** 'ask' = maker selling asset (Sell side); 'bid' = maker buying asset (Buy side). */
	side: 'ask' | 'bid';
	/** The on-chain ratio (input per output, hex Float). Stored as-is from OrderV4 io. */
	ioRatio: string;
	/** Deposit transaction hash on anvil. */
	txHash: `0x${string}`;
	/** Block timestamp (seconds) at which the order was added. */
	timestampAdded: number;
}

// Per-worker singleton — `DotrainRegistry.new` fetches the registry manifest
// (slow). The registry is read-only.
let registryPromise: Promise<unknown> | null = null;
type RegistryInstance = {
	getGui: (orderKey: string, deploymentKey: string) => Promise<{
		error?: { readableMsg: string };
		value?: {
			setSelectToken: (key: string, address: string) => Promise<unknown>;
			setFieldValue: (key: string, value: string) => unknown;
			setDeposit: (key: string, value: string) => unknown;
			generateAddOrderCalldata: () => Promise<{
				error?: { readableMsg: string };
				value?: `0x${string}`;
			}>;
			getDeploymentTransactionArgs: (owner: string) => Promise<{
				error?: { readableMsg: string };
				value?: {
					approvals: { token: `0x${string}`; calldata: `0x${string}`; symbol: string }[];
					deploymentCalldata: `0x${string}`;
					orderbookAddress: `0x${string}`;
				};
			}>;
		};
	}>;
};
async function getRegistry(registryUrl: string): Promise<RegistryInstance> {
	if (!registryPromise) {
		registryPromise = (async () => {
			const r = await (DotrainRegistry as unknown as {
				new: (url: string) => Promise<{ error?: { readableMsg: string }; value?: RegistryInstance }>;
			}).new(registryUrl);
			if (r.error || !r.value) {
				throw new Error(`DotrainRegistry.new failed: ${r.error?.readableMsg ?? 'no value'}`);
			}
			return r.value;
		})();
	}
	return registryPromise as Promise<RegistryInstance>;
}

/**
 * Deploy a fixed-limit order. Returns everything needed to synthesize stub
 * responses (Goldsky SgOrder, REST ApiOrderSummary) so the UI sees this order.
 */
export async function deployMakerLimitOrder(
	params: DeployMakerOrderParams
): Promise<DeployedMakerOrder> {
	const account = privateKeyToAccount(params.makerPrivateKey);
	const wallet = createWalletClient({ account, chain: base, transport: http(ANVIL_RPC) });

	// Map user-facing side → on-chain order perspective (mirrors LimitOrder.svelte:268-300).
	// Sell (Ask): maker gives asset (OUTPUT), takes payment (INPUT). Ratio = payment/asset.
	// Buy  (Bid): maker gives payment (OUTPUT), takes asset (INPUT). UI's "price" is
	//             payment/asset, but the deployed ratio inverts to asset/payment = 1/price.
	const orderType: 'ask' | 'bid' = params.side === 'sell' ? 'ask' : 'bid';
	const sdkInputToken =
		orderType === 'ask' ? params.paymentToken : params.assetToken;
	const sdkOutputToken =
		orderType === 'ask' ? params.assetToken : params.paymentToken;
	const sdkRatio =
		orderType === 'ask'
			? params.pricePaymentPerAsset
			: String(1 / parseFloat(params.pricePaymentPerAsset));

	const registry = await getRegistry(
		params.registryUrl ?? 'http://127.0.0.1:4173/registry/manifest'
	);
	const guiResult = await registry.getGui('fixed-limit', 'base');
	if (guiResult.error || !guiResult.value) {
		throw new Error(
			`registry.getGui(fixed-limit) failed: ${guiResult.error?.readableMsg ?? 'no value'}`
		);
	}
	const gui = guiResult.value;

	await gui.setSelectToken('token1', sdkInputToken.address);
	await gui.setSelectToken('token2', sdkOutputToken.address);
	gui.setFieldValue('fixed-io', sdkRatio);
	gui.setDeposit(
		'token2',
		formatUnits(params.depositAmount, sdkOutputToken.decimals)
	);

	// Bare addOrder calldata → decode → OrderV4 → getOrderHash. The deploymentCalldata
	// returned below is multicall-wrapped (deposit + addOrder); decoding the bare
	// addOrder is simpler.
	const addOrderRes = await gui.generateAddOrderCalldata();
	if (addOrderRes.error || !addOrderRes.value) {
		throw new Error(
			`generateAddOrderCalldata failed: ${addOrderRes.error?.readableMsg ?? 'no value'}`
		);
	}
	const decoded = decodeFunctionData({
		abi: ADD_ORDER_ABI,
		data: addOrderRes.value
	});
	const orderV4 = decoded.args[0] as unknown as OrderV4;
	const hashRes = await (getOrderHash as unknown as (o: OrderV4) => Promise<{
		error?: { readableMsg: string };
		value?: string;
	}>)(orderV4);
	if (hashRes.error || !hashRes.value) {
		throw new Error(`getOrderHash failed: ${hashRes.error?.readableMsg ?? 'no value'}`);
	}
	const orderHash = hashRes.value as `0x${string}`;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const orderBytes = encodeAbiParameters(ORDER_V4_ABI_PARAMS, [orderV4 as any]) as `0x${string}`;

	// Deployment calldata: multicall(approvals + deposit + addOrder). Approvals are
	// listed separately for the UX flow; we execute them one by one then submit the
	// deployment.
	const argsRes = await gui.getDeploymentTransactionArgs(account.address);
	if (argsRes.error || !argsRes.value) {
		throw new Error(
			`getDeploymentTransactionArgs failed: ${argsRes.error?.readableMsg ?? 'no value'}`
		);
	}
	const args = argsRes.value;

	// Execute approvals via the maker wallet. Even though anvil unlocks accounts,
	// we use walletClient because that's the production-equivalent path (eth_sendRawTransaction).
	for (const approval of args.approvals) {
		const aHash = await wallet.sendTransaction({
			to: approval.token,
			data: approval.calldata
		});
		await params.testClient.waitForTransactionReceipt({ hash: aHash });
	}

	const txHash = await wallet.sendTransaction({
		to: args.orderbookAddress,
		data: args.deploymentCalldata
	});
	const receipt = await params.testClient.waitForTransactionReceipt({ hash: txHash });
	if (receipt.status !== 'success') {
		throw new Error(`maker deploy reverted: tx ${txHash}`);
	}
	const block = await params.testClient.getBlock({ blockNumber: receipt.blockNumber });

	// Pull io ratio from the OrderV4 we already decoded — io[0].vaultId IS the
	// IO ratio in the fixed-limit strategy's layout? Actually no — vaultId is
	// just a 32-byte identifier. Ratio lives inside `evaluable.bytecode`. For
	// the Goldsky stub we only need it as the hex-Float field; if downstream
	// consumers need it as a number, we serialize the OrderV4 and let the SDK
	// quote on-chain (which is what the production fork path does).
	// TODO: extract ratio for ApiOrderSummary.ioRatio — Phase 2.
	const ioRatio = '0x';

	const inputVaultId = (orderV4.validInputs[0]?.vaultId ?? '0x0') as `0x${string}`;
	const outputVaultId = (orderV4.validOutputs[0]?.vaultId ?? '0x0') as `0x${string}`;

	return {
		orderHash,
		orderBytes,
		owner: account.address,
		orderbookAddress: args.orderbookAddress,
		inputToken: sdkInputToken,
		outputToken: sdkOutputToken,
		inputVaultId,
		outputVaultId,
		side: orderType,
		ioRatio,
		txHash,
		timestampAdded: Number(block.timestamp)
	};
}
