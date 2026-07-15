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
	decodeEventLog,
	encodeAbiParameters,
	http,
	parseAbi,
	parseAbiParameters,
	formatUnits
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { DotrainRegistry, type OrderV4 } from '@rainlanguage/orderbook';
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

// AddOrder event ABIs. Try V3 first (current Rain Orderbook), fall back to V2
// for older deployments. Both indexed signatures emit (address sender,
// bytes32 orderHash, OrderV4 order) — sender + orderHash are indexed topics,
// the OrderV4 is the non-indexed data payload.
//
// We use event-log parsing instead of decoding the bare addOrder calldata
// because the deployed orderbook at 0xe522cB... uses a custom function
// selector that diverges from any canonical addOrder3/4 signature we tried
// (computed selector 0x709fb8a5 doesn't match any plausible signature). The
// event ABI is much more stable + canonical than the function selectors.
const ADD_ORDER_EVENTS = parseAbi([
	// All params non-indexed (matches the actual on-chain event — the
	// signature hash matched 0x87491344... but viem rejected indexed=true
	// because the emitted log had no extra topics beyond the signature).
	'event AddOrderV3(address sender, bytes32 orderHash, (address owner, (address interpreter, address store, bytes bytecode) evaluable, (address token, bytes32 vaultId)[] validInputs, (address token, bytes32 vaultId)[] validOutputs, bytes32 nonce) order)',
	'event AddOrderV2(address sender, bytes32 orderHash, (address owner, (address interpreter, address store, bytes bytecode) evaluable, (address token, bytes32 vaultId)[] validInputs, (address token, bytes32 vaultId)[] validOutputs, bytes32 nonce) order)'
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
	chainId: number;
	orderbookAddress: `0x${string}`;
	inputToken: { address: `0x${string}`; symbol: string; decimals: number };
	outputToken: { address: `0x${string}`; symbol: string; decimals: number };
	/** Hex-padded 32-byte vault IDs (whatever the SDK chose). */
	inputVaultId: `0x${string}`;
	outputVaultId: `0x${string}`;
	/** 'ask' = maker selling asset (Sell side); 'bid' = maker buying asset (Buy side). */
	side: 'ask' | 'bid';
	/**
	 * On-chain ratio as a decimal string (input-per-output). For a fixed-limit
	 * order this equals the value passed to `gui.setFieldValue('fixed-io', …)`:
	 *   ask (sell): payment per asset (= user's `pricePaymentPerAsset`)
	 *   bid (buy):  asset per payment (= 1 / `pricePaymentPerAsset`)
	 * This is the same decimal string the production ST0x REST API returns in
	 * `ApiOrderSummary.ioRatio`; `convertApiOrderToProcessedQuote` runs
	 * `Float.parse(ioRatio)` on it.
	 */
	ioRatio: string;
	/** Output-vault balance as a decimal string in OUTPUT-token decimals. Equals the maker's deposit. */
	outputVaultBalance: string;
	/** Max output the order will produce per fill as a decimal string. For fixed-limit this is the full deposit. */
	maxOutput: string;
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
	// Sell (ask) → base (DIA direct); buy (bid) → base-inv (DIA inverted).
	const deploymentKey = orderType === 'ask' ? 'base' : 'base-inv';
	const guiResult = await registry.getGui('fixed-limit', deploymentKey);
	if (guiResult.error || !guiResult.value) {
		throw new Error(
			`registry.getGui(fixed-limit, ${deploymentKey}) failed: ${guiResult.error?.readableMsg ?? 'no value'}`
		);
	}
	const gui = guiResult.value;

	await gui.setSelectToken('input', sdkInputToken.address);
	await gui.setSelectToken('output', sdkOutputToken.address);

	// Strip wt/t prefix → DiaWords feed id (e.g. wtCOIN → "COIN").
	const diaFeed = params.assetToken.symbol.replace(/^(wt|t)/i, '').toUpperCase();
	gui.setFieldValue('dia-id', `"${diaFeed}"`);
	gui.setFieldValue('baseline-multiplier', '1.001');
	gui.setFieldValue('oracle-price-timeout', '300');
	gui.setFieldValue('fixed-io', sdkRatio);
	gui.setDeposit(
		'output',
		formatUnits(params.depositAmount, sdkOutputToken.decimals)
	);

	// Deployment calldata: multicall(approvals + deposit + addOrder). Approvals are
	// listed separately for the UX flow; we execute them one by one then submit the
	// deployment.
	//
	// Retry on metaboard 500/429: the SDK's `getDeploymentTransactionArgs` does a
	// node-side fetch of the strategy's metaboard subject from Goldsky which is
	// NOT routed through Playwright's page.route cache. Free-tier Goldsky 429s
	// (or returns an empty body, which decodes as "Either data or errors must be
	// present in a GraphQL response") under burst — common when running the
	// suite back-to-back. A short-back-off retry recovers reliably.
	let args: Awaited<ReturnType<typeof gui.getDeploymentTransactionArgs>>['value'];
	let lastErr: string | undefined;
	for (let attempt = 0; attempt < 4; attempt++) {
		const argsRes = await gui.getDeploymentTransactionArgs(account.address);
		if (!argsRes.error && argsRes.value) {
			args = argsRes.value;
			break;
		}
		lastErr = argsRes.error?.readableMsg ?? 'no value';
		const transient =
			lastErr.includes('metaboard') ||
			lastErr.includes('Either data or errors') ||
			lastErr.includes('429') ||
			lastErr.includes('Request Error');
		if (!transient || attempt === 3) {
			throw new Error(`getDeploymentTransactionArgs failed: ${lastErr}`);
		}
		const wait = 1500 * (attempt + 1);
		console.log(
			`[makerOrders] getDeploymentTransactionArgs transient failure (attempt ${attempt + 1}): ${lastErr}; retrying in ${wait}ms`
		);
		await new Promise((r) => setTimeout(r, wait));
	}
	if (!args) {
		throw new Error(`getDeploymentTransactionArgs failed after retries: ${lastErr ?? 'unknown'}`);
	}

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

	// Extract orderHash + OrderV4 from the AddOrderV3 (or V2) event emitted by
	// the orderbook contract. Strictly more robust than decoding the bare
	// addOrder calldata since (a) the orderbook uses a custom function
	// selector and (b) the event payload is the source of truth for what was
	// actually added on-chain.
	const orderbookAddrLower = args.orderbookAddress.toLowerCase();
	const ADD_ORDER_V3_TOPIC =
		'0x87491344dfbcf91f6cbbc610cbbeedc85313d37a02df0c93527f7ea5f8db717f';
	let orderHash: `0x${string}` | null = null;
	let orderV4: OrderV4 | null = null;
	let decodeErr: string | null = null;
	for (const log of receipt.logs) {
		if (log.address.toLowerCase() !== orderbookAddrLower) continue;
		if (log.topics[0]?.toLowerCase() !== ADD_ORDER_V3_TOPIC) continue;
		try {
			const decoded = decodeEventLog({
				abi: ADD_ORDER_EVENTS,
				topics: log.topics,
				data: log.data
			});
			if (decoded.eventName === 'AddOrderV3' || decoded.eventName === 'AddOrderV2') {
				orderHash = decoded.args.orderHash as `0x${string}`;
				orderV4 = decoded.args.order as unknown as OrderV4;
				break;
			}
		} catch (e) {
			decodeErr = (e as Error).message;
		}
	}
	if (!orderHash || !orderV4) {
		throw new Error(
			`maker deploy tx ${txHash}: AddOrderV3 log found from ${args.orderbookAddress} but decode failed. ` +
				`decodeErr=${decodeErr ?? 'none'}`
		);
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const orderBytes = encodeAbiParameters(ORDER_V4_ABI_PARAMS, [orderV4 as any]) as `0x${string}`;

	// ioRatio = input-per-output, the on-chain value the orderbook's quote()
	// would return at any block where the fixed-limit interpreter is invoked.
	// We pass `sdkRatio` to `gui.setFieldValue('fixed-io', …)` above, which
	// embeds it in the Rainlang bytecode literally, so the on-chain ratio
	// equals sdkRatio. Using this value (instead of calling quote()) avoids
	// adding a custom orderbook quote ABI here AND avoids the bootstrap
	// problem where the SDK's `getQuotes` reads the order through Goldsky
	// (anvil-only orders aren't there). Production-equivalent for fixed-limit;
	// would need a different approach for DCA/dynamic-spread orders.
	const ioRatio = sdkRatio;
	// For fixed-limit, every fill can drain up to the deposit amount in one
	// shot (the rainlang's `max-output` is unbounded; the interpreter caps to
	// vault balance). REST stub reports the deposit as both maxOutput and
	// outputVaultBalance — same decimal string in OUTPUT-token decimals.
	const outputVaultBalance = formatUnits(params.depositAmount, sdkOutputToken.decimals);
	const maxOutput = outputVaultBalance;

	const inputVaultId = (orderV4.validInputs[0]?.vaultId ?? '0x0') as `0x${string}`;
	const outputVaultId = (orderV4.validOutputs[0]?.vaultId ?? '0x0') as `0x${string}`;

	return {
		orderHash,
		orderBytes,
		owner: account.address,
		chainId: base.id,
		orderbookAddress: args.orderbookAddress,
		inputToken: sdkInputToken,
		outputToken: sdkOutputToken,
		inputVaultId,
		outputVaultId,
		side: orderType,
		ioRatio,
		outputVaultBalance,
		maxOutput,
		txHash,
		timestampAdded: Number(block.timestamp)
	};
}
