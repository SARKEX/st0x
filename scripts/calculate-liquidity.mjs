#!/usr/bin/env node

/**
 * Calculate total liquidity deployed in the orderbook smart contract
 * by a specific address, broken down by order type.
 *
 * Queries the orderbook subgraph for all vaults and orders owned by
 * the target address. Classifies each order as "limit" (hardcoded swap),
 * "dca", "dynamic-spread", or "custom" by inspecting the on-chain meta
 * for rainlang patterns. Vault balances are then grouped into:
 *
 *   - LIMIT (hardcoded swap) — vaults used exclusively by limit orders
 *   - ALGORITHMIC           — vaults used by at least one non-limit order
 *   - UNASSOCIATED          — vaults not referenced by any active order
 *
 * Usage: node scripts/calculate-liquidity.mjs [address]
 *
 * Default address: 0x71b94911fd1ce621fc40970450004c544e5287a8
 */

const TARGET_ADDRESS = (process.argv[2] || '0x71b94911fd1ce621fc40970450004c544e5287a8').toLowerCase();

// Orderbook subgraph endpoints (active + inactive for full coverage)
const ORDERBOOK_SUBGRAPH_URLS = [
	'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2026-02-05-c4ef/gn',
	'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2025-10-11-a62b/gn'
];

// Pyth Hermes API for price feeds
const HERMES_BASE_URL = 'https://hermes.pyth.network/v2/updates/price';

// Known tokens on Base with their Pyth price feed IDs
const KNOWN_TOKENS = {
	'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': {
		symbol: 'USDC', decimals: 6, priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'
	},
	// Wrapped ST0x tokens
	'0xfb5b41acdba20a3230f84be995173cfb98b8d6e7': {
		symbol: 'wtNVDA', decimals: 18, priceFeedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593'
	},
	'0x997bae3ec193a249596d3708c3fab7c501bb8a53': {
		symbol: 'wtAMZN', decimals: 18, priceFeedId: '0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a'
	},
	'0x219a8d384a10bf19b9f24cb5cc53f79dd0e5a03d': {
		symbol: 'wtTSLA', decimals: 18, priceFeedId: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1'
	},
	'0xff05e1bd696900dc6a52ca35ca61bb1024eda8e2': {
		symbol: 'wtMSTR', decimals: 18, priceFeedId: '0xe1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09'
	},
	'0x1e46d7efef64a833afb1cd49299a7ad5b439f4d8': {
		symbol: 'wtIAU', decimals: 18, priceFeedId: '0xf703fbded84f7da4bd9ff4661b5d1ffefa8a9c90b7fa12f247edc8251efac914'
	},
	'0x5cda0e1ca4ce2af96315f7f8963c85399c172204': {
		symbol: 'wtCOIN', decimals: 18, priceFeedId: '0xfee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245'
	},
	'0x31c2c14134e6e3b7ef9478297f199331133fc2d8': {
		symbol: 'wtSPYM', decimals: 18, priceFeedId: '0x4dfbf28d72ab41a878afcd4c6d5e9593dca7cf65a0da739cbad9b7414004f82d'
	},
	'0xeb7f3e4093c9d68253b6104fbbff561f3ec0442f': {
		symbol: 'wtSIVR', decimals: 18, priceFeedId: '0x0a5ee42b0f7287a777926d08bc185a6a60f42f40a9b63d78d85d4a03ee2e3737'
	},
	'0x8afba81dec38de0a18e2df5e1967a7493651eebf': {
		symbol: 'wtCRCL', decimals: 18, priceFeedId: '0x92b8527aabe59ea2b12230f7b532769b133ffb118dfbd48ff676f14b273f1365'
	},
	'0x2512ec661f0ba089c275ea105e31bad6fcfcf319': {
		symbol: 'wtBMNR', decimals: 18, priceFeedId: '0x54e2e127c93950de5a710100fd1cd387aba1ec8920850efdb05da5fee57d2e32'
	},
	'0x82f5baee1076334357a34a19e04f7c282d51ce47': {
		symbol: 'wtPPLT', decimals: 18, priceFeedId: '0x782410278b6c8aa2d437812281526012808404aa14c243f73fb9939eeb88d430'
	},
	// Unwrapped (legacy) tTokens
	'0x7271a3c91bb6070ed09333b84a815949d4f16d14': {
		symbol: 'tNVDA', decimals: 18, priceFeedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593'
	},
	'0x466cb2e46fa1afc0ab5e22274b34d0391db18efd': {
		symbol: 'tAMZN', decimals: 18, priceFeedId: '0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a'
	},
	'0x4e169cd2ab4f82640a8c65c68fed55863866fdb0': {
		symbol: 'tTSLA', decimals: 18, priceFeedId: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1'
	},
	'0x013b782f402d61aa1004cca95b9f5bb402c9d5fe': {
		symbol: 'tMSTR', decimals: 18, priceFeedId: '0xe1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09'
	},
	'0x9a507314ea2a6c5686c0d07bfecb764dcf324dff': {
		symbol: 'tIAU', decimals: 18, priceFeedId: '0xf703fbded84f7da4bd9ff4661b5d1ffefa8a9c90b7fa12f247edc8251efac914'
	},
	'0x626757e6f50675d17fcad312e82f989ae7a23d38': {
		symbol: 'tCOIN', decimals: 18, priceFeedId: '0xfee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245'
	},
	'0x8fdf41116f755771bfe0747d5f8c3711d5debfbb': {
		symbol: 'tSPYM', decimals: 18, priceFeedId: '0x4dfbf28d72ab41a878afcd4c6d5e9593dca7cf65a0da739cbad9b7414004f82d'
	},
	'0x58ce5024b89b4f73c27814c0f0abbea331c99be8': {
		symbol: 'tSIVR', decimals: 18, priceFeedId: '0x0a5ee42b0f7287a777926d08bc185a6a60f42f40a9b63d78d85d4a03ee2e3737'
	},
	'0x38eb797892ed71da69bdc27a456a7c83ff813b52': {
		symbol: 'tCRCL', decimals: 18, priceFeedId: '0x92b8527aabe59ea2b12230f7b532769b133ffb118dfbd48ff676f14b273f1365'
	},
	'0xfbde45df60249203b12148452fc77c3b5f811eb2': {
		symbol: 'tBMNR', decimals: 18, priceFeedId: '0x54e2e127c93950de5a710100fd1cd387aba1ec8920850efdb05da5fee57d2e32'
	},
	'0x1f17523b147ccc2a2328c0f014f6d49c479ea063': {
		symbol: 'tPPLT', decimals: 18, priceFeedId: '0x782410278b6c8aa2d437812281526012808404aa14c243f73fb9939eeb88d430'
	},
	// Legacy addresses
	'0x69fca9f7fad46a7eef3acef5beac9df5b7eca73b': {
		symbol: 'tNVDA(legacy)', decimals: 18, priceFeedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593'
	},
	'0x8d8c315db61f60dcc3c66cdb48ca87fc643e35ea': {
		symbol: 'tAMZN(legacy)', decimals: 18, priceFeedId: '0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a'
	},
	'0x470b06815a2e286df8c38c9c73280e0760088623': {
		symbol: 'tTSLA(legacy)', decimals: 18, priceFeedId: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1'
	},
	'0xff647ad8c4b065bd746911bb9ea1a33c38c63604': {
		symbol: 'tMSTR(legacy)', decimals: 18, priceFeedId: '0xe1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09'
	},
	'0xd0a90b7c9ae5facbe09ca4c576a3795eda53b397': {
		symbol: 'tIAU(legacy)', decimals: 18, priceFeedId: '0xf703fbded84f7da4bd9ff4661b5d1ffefa8a9c90b7fa12f247edc8251efac914'
	},
	'0xb616f8b391d1adc118fd7e4063526d5530d49b10': {
		symbol: 'tCOIN(legacy)', decimals: 18, priceFeedId: '0xfee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245'
	},
	'0x2289249984f1fa2ce86c4e8867e7eb819ea7df95': {
		symbol: 'tSPLG(legacy)', decimals: 18, priceFeedId: '0x4dfbf28d72ab41a878afcd4c6d5e9593dca7cf65a0da739cbad9b7414004f82d'
	},
	'0x826a85de1f7b70f4c7450c0f882a6db06000ed80': {
		symbol: 'tSIVR(legacy)', decimals: 18, priceFeedId: '0x0a5ee42b0f7287a777926d08bc185a6a60f42f40a9b63d78d85d4a03ee2e3737'
	},
	'0x43422a9d11a6640ef0d5f65292ef8adf87cf8522': {
		symbol: 'tCRCL(legacy)', decimals: 18, priceFeedId: '0x92b8527aabe59ea2b12230f7b532769b133ffb118dfbd48ff676f14b273f1365'
	},
	'0xf8fdfd6a686346d34b3143fc23072aa45c9e8386': {
		symbol: 'tBMNR(legacy)', decimals: 18, priceFeedId: '0x54e2e127c93950de5a710100fd1cd387aba1ec8920850efdb05da5fee57d2e32'
	},
	'0x6192539a2036c786aba3ca6a2222ff7a0f9c287e': {
		symbol: 'tPPLT(legacy)', decimals: 18, priceFeedId: '0x782410278b6c8aa2d437812281526012808404aa14c243f73fb9939eeb88d430'
	}
};

// ============================================================================
// Subgraph queries
// ============================================================================

const VAULTS_BY_OWNER_QUERY = `
query VaultsByOwner($owner: String!, $skip: Int!, $first: Int!) {
  vaults(
    where: { owner: $owner }
    skip: $skip
    first: $first
    orderBy: id
    orderDirection: asc
  ) {
    id
    vaultId
    owner
    balance
    token {
      id
      address
      name
      symbol
      decimals
    }
    orderbook {
      id
    }
  }
}`;

// Query orders with their IO vault references and meta for classification.
// The order entity in the Rain v4 subgraph exposes inputs/outputs as
// derived IO entities that each carry a vaultId and token reference.
const ORDERS_BY_OWNER_QUERY = `
query OrdersByOwner($owner: String!, $skip: Int!, $first: Int!) {
  orders(
    where: { owner: $owner }
    skip: $skip
    first: $first
    orderBy: id
    orderDirection: asc
  ) {
    id
    orderHash
    active
    meta
    inputs {
      token { id address }
      vaultId
    }
    outputs {
      token { id address }
      vaultId
    }
  }
}`;

// ============================================================================
// Subgraph fetching
// ============================================================================

/**
 * Execute a paginated GraphQL query against a single subgraph endpoint.
 */
async function fetchPaginated(endpoint, query, variables, entityKey) {
	const all = [];
	let skip = 0;
	const first = 1000;
	let hasMore = true;

	while (hasMore) {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query,
				variables: { ...variables, skip, first }
			})
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const json = await response.json();
		if (json.errors?.length) {
			throw new Error(`GraphQL: ${json.errors.map(e => e.message).join('; ')}`);
		}

		const items = json.data?.[entityKey] ?? [];
		all.push(...items);
		hasMore = items.length >= first;
		skip += first;
	}

	return all;
}

/**
 * Fetch entities from all subgraph endpoints, deduplicate by entity id.
 */
async function fetchFromAllEndpoints(query, variables, entityKey) {
	const results = await Promise.allSettled(
		ORDERBOOK_SUBGRAPH_URLS.map(url =>
			fetchPaginated(url, query, variables, entityKey).catch(err => {
				console.error(`  Warning: failed to query ${entityKey} from ${url}: ${err.message}`);
				return [];
			})
		)
	);

	const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

	// Deduplicate by id, preferring the first occurrence (from active subgraph)
	const seen = new Set();
	return all.filter(item => {
		if (seen.has(item.id)) return false;
		seen.add(item.id);
		return true;
	});
}

// ============================================================================
// Order classification from meta bytes
// ============================================================================

/**
 * Convert an ASCII string to its hex representation for pattern matching
 * inside CBOR-encoded meta bytes.
 */
function textToHex(str) {
	return Array.from(str).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

// Pre-compute hex patterns for order classification
const PATTERNS = {
	dynamicSpread: textToHex('other-vwaio'),
	dcaMinAmount:  textToHex('min-amount:'),
	dcaLinear:     textToHex('linear-growth'),
	dcaEpochs:    textToHex('amount-epochs'),
	dcaHalflife:  textToHex('halflife'),
	handleIo:     textToHex('handle-io'),
	colonSemi:    textToHex(':;'),
};

/**
 * Classify an order based on its on-chain meta bytes.
 *
 * The meta field is CBOR-encoded Rain metadata that embeds the rainlang
 * source as a UTF-8 text item. Since CBOR preserves raw UTF-8 bytes
 * contiguously, we can search for known text patterns directly in the
 * hex-encoded meta without a full CBOR decoder.
 *
 * Classification matches src/lib/utils/orderbook.ts:classifyOrderType():
 *   - 'dynamic-spread': rainlang contains "other-vwaio"
 *   - 'dca': contains "min-amount:", "linear-growth", "amount-epochs", or "halflife"
 *   - 'limit': handle-io section exists but is empty (just ":;")
 *   - 'custom': everything else with code in handle-io
 *   - 'unknown': no meta available
 */
function classifyOrderFromMeta(metaHex) {
	if (!metaHex || metaHex === '0x' || metaHex.length < 20) return 'unknown';

	const hex = (metaHex.startsWith('0x') ? metaHex.slice(2) : metaHex).toLowerCase();

	// Dynamic spread: contains "other-vwaio"
	if (hex.includes(PATTERNS.dynamicSpread)) return 'dynamic-spread';

	// DCA: contains DCA-specific patterns
	if (hex.includes(PATTERNS.dcaMinAmount) ||
		hex.includes(PATTERNS.dcaLinear) ||
		hex.includes(PATTERNS.dcaEpochs) ||
		hex.includes(PATTERNS.dcaHalflife)) return 'dca';

	// Check for handle-io section
	const hiIdx = hex.indexOf(PATTERNS.handleIo);
	if (hiIdx !== -1) {
		// Look for ":;" within ~500 bytes (1000 hex chars) after "handle-io"
		const searchEnd = Math.min(hiIdx + PATTERNS.handleIo.length + 1000, hex.length);
		const searchRegion = hex.substring(hiIdx + PATTERNS.handleIo.length, searchEnd);
		const csIdx = searchRegion.indexOf(PATTERNS.colonSemi);

		if (csIdx !== -1 && csIdx < 200) {
			// Extract the text between "handle-io" closing comment and ":;"
			// and check if it's just whitespace / comment markers
			const between = searchRegion.substring(0, csIdx);
			let betweenText = '';
			for (let i = 0; i < between.length; i += 2) {
				if (i + 1 < between.length) {
					const code = parseInt(between.substring(i, i + 2), 16);
					if (code >= 32 && code <= 126) betweenText += String.fromCharCode(code);
				}
			}
			// Remove comment syntax and whitespace — if nothing remains, it's limit
			const stripped = betweenText.replace(/[\s*/]/g, '');
			if (stripped.length === 0) return 'limit';
		}

		// handle-io exists and has non-trivial content
		return 'custom';
	}

	// No handle-io found — might be an older format or no rainlang embedded
	return 'unknown';
}

// ============================================================================
// Vault ↔ Order mapping
// ============================================================================

/**
 * Normalize a subgraph vaultId for consistent matching.
 * The subgraph may store vault IDs as hex strings or decimal BigInt strings.
 */
function normalizeVaultId(vaultId) {
	if (!vaultId) return '';
	const str = String(vaultId);
	// If it's hex, convert to decimal BigInt string for consistent comparison
	if (str.startsWith('0x') || str.startsWith('0X')) {
		try { return BigInt(str).toString(); } catch { return str.toLowerCase(); }
	}
	return str;
}

/**
 * Build a composite key for matching a vault to order IOs.
 * Uses vaultId + tokenAddress since the same vaultId can hold different tokens.
 */
function vaultKey(vaultId, tokenAddress) {
	return `${normalizeVaultId(vaultId)}:${(tokenAddress || '').toLowerCase()}`;
}

/**
 * Given orders with classified types, build a map from vaultKey → Set<orderType>.
 * This tells us which order types reference each vault.
 */
function buildVaultOrderTypeMap(orders) {
	// Map: vaultKey → Set<orderType>
	const map = new Map();

	for (const order of orders) {
		if (!order.active) continue;

		const orderType = order._classifiedType || 'unknown';

		const ios = [...(order.inputs || []), ...(order.outputs || [])];
		for (const io of ios) {
			const tokenAddr = (io.token?.address || io.token?.id || '').toLowerCase();
			const key = vaultKey(io.vaultId, tokenAddr);
			if (!map.has(key)) map.set(key, new Set());
			map.get(key).add(orderType);
		}
	}

	return map;
}

/**
 * Determine the category for a vault based on its associated order types.
 *   - 'limit'        — ALL active orders referencing this vault are limit orders
 *   - 'algorithmic'  — at least one non-limit order references this vault
 *   - 'unassociated' — no active orders reference this vault
 */
function categorizeVault(vaultId, tokenAddress, vaultOrderTypeMap) {
	const key = vaultKey(vaultId, tokenAddress);
	const types = vaultOrderTypeMap.get(key);

	if (!types || types.size === 0) return 'unassociated';

	// If every order type for this vault is 'limit', it's a limit-only vault
	const nonLimit = [...types].filter(t => t !== 'limit');
	if (nonLimit.length === 0) return 'limit';

	return 'algorithmic';
}

// ============================================================================
// Price fetching from Pyth Hermes
// ============================================================================

function normaliseFeedId(feedId) {
	return feedId.replace(/^0x/, '').toLowerCase();
}

/**
 * Fetch latest prices from Pyth Hermes for a set of feed IDs.
 * Returns a map of normalized feed ID -> USD price.
 */
async function fetchPythPrices(feedIds) {
	const normalized = [...new Set(feedIds.map(normaliseFeedId))];
	if (!normalized.length) return new Map();

	const idsParams = normalized.map(id => `ids[]=${id}`).join('&');
	const url = `${HERMES_BASE_URL}/latest?${idsParams}`;

	const prices = new Map();
	try {
		const response = await fetch(url);
		if (!response.ok) {
			console.error(`  Warning: Pyth API returned ${response.status}`);
			return prices;
		}

		const data = await response.json();
		data.parsed?.forEach(entry => {
			const id = normaliseFeedId(entry.id);
			if (entry.price) {
				const price = Number(entry.price.price);
				const expo = Number(entry.price.expo);
				if (Number.isFinite(price) && Number.isFinite(expo)) {
					prices.set(id, price * Math.pow(10, expo));
				}
			}
		});
	} catch (err) {
		console.error(`  Warning: Failed to fetch Pyth prices: ${err.message}`);
	}

	return prices;
}

// ============================================================================
// Balance calculation
// ============================================================================

/**
 * Convert a raw balance string to a human-readable number given decimals.
 */
function formatBalance(rawBalance, decimals) {
	if (!rawBalance || rawBalance === '0') return 0;

	const raw = BigInt(rawBalance);
	if (raw === 0n) return 0;

	const dec = Number(decimals) || 18;
	const divisor = 10n ** BigInt(dec);
	const integerPart = raw / divisor;
	const fractionalPart = raw % divisor;

	// Build decimal string with leading zeros
	const fracStr = fractionalPart.toString().padStart(dec, '0');
	const numStr = `${integerPart}.${fracStr}`;
	return parseFloat(numStr);
}

/**
 * Calculate USD value for a given balance.
 */
function getUsdValue(balance, symbol, tokenAddr, pythPrices) {
	if (symbol === 'USDC') return balance;

	const known = KNOWN_TOKENS[tokenAddr];
	if (known?.priceFeedId) {
		const feedId = normaliseFeedId(known.priceFeedId);
		const price = pythPrices.get(feedId);
		if (price != null) return balance * price;
	}
	return null;
}

// ============================================================================
// Display helpers
// ============================================================================

function formatUsd(value) {
	if (value == null) return '(no price)';
	return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function printTokenRows(rows) {
	// Sort by USD value descending (unknowns last)
	rows.sort((a, b) => {
		if (a.usdValue == null && b.usdValue == null) return 0;
		if (a.usdValue == null) return 1;
		if (b.usdValue == null) return -1;
		return b.usdValue - a.usdValue;
	});

	for (const row of rows) {
		const balStr = row.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
		console.log(`    ${row.symbol.padEnd(18)} ${balStr.padStart(20)} tokens   ${formatUsd(row.usdValue).padStart(16)}   (${row.vaultCount} vault(s))`);
	}
}

// ============================================================================
// Main
// ============================================================================

async function main() {
	console.log('='.repeat(70));
	console.log('Orderbook Liquidity Calculator (by Order Type)');
	console.log('='.repeat(70));
	console.log(`Target address: ${TARGET_ADDRESS}`);
	console.log(`Querying ${ORDERBOOK_SUBGRAPH_URLS.length} subgraph endpoint(s)...\n`);

	// Step 1: Fetch all vaults for the owner
	const vaults = await fetchFromAllEndpoints(
		VAULTS_BY_OWNER_QUERY, { owner: TARGET_ADDRESS }, 'vaults'
	);
	console.log(`Found ${vaults.length} vault(s)`);

	if (vaults.length === 0) {
		console.log('No vaults found for this address.');
		return;
	}

	// Step 2: Fetch all orders for the owner and classify them
	let orders = [];
	let orderClassificationFailed = false;
	try {
		orders = await fetchFromAllEndpoints(
			ORDERS_BY_OWNER_QUERY, { owner: TARGET_ADDRESS }, 'orders'
		);
		console.log(`Found ${orders.length} order(s)`);

		// Classify each order from its meta
		const typeCounts = { limit: 0, dca: 0, 'dynamic-spread': 0, custom: 0, unknown: 0 };
		for (const order of orders) {
			order._classifiedType = classifyOrderFromMeta(order.meta);
			if (order.active) typeCounts[order._classifiedType] = (typeCounts[order._classifiedType] || 0) + 1;
		}

		const activeCount = orders.filter(o => o.active).length;
		console.log(`Active orders: ${activeCount} — ` +
			Object.entries(typeCounts).filter(([,v]) => v > 0).map(([k,v]) => `${v} ${k}`).join(', '));
	} catch (err) {
		console.error(`\n  Warning: Could not fetch orders for classification: ${err.message}`);
		console.error(`  Falling back to totals only (no per-order-type breakdown).\n`);
		orderClassificationFailed = true;
	}

	// Step 3: Build vault → order type mapping
	const vaultOrderTypeMap = orderClassificationFailed ? new Map() : buildVaultOrderTypeMap(orders);

	// Step 4: Fetch prices from Pyth
	const feedIdsToFetch = new Set();
	for (const vault of vaults) {
		const addr = (vault.token.address || vault.token.id).toLowerCase();
		const known = KNOWN_TOKENS[addr];
		if (known?.priceFeedId) feedIdsToFetch.add(known.priceFeedId);
	}

	console.log(`\nFetching prices for ${feedIdsToFetch.size} token(s) from Pyth oracle...\n`);
	const pythPrices = await fetchPythPrices([...feedIdsToFetch]);

	// Step 5: Categorize each vault and accumulate balances per category
	// categories: 'limit', 'algorithmic', 'unassociated'
	// Each category has a Map<tokenAddr, { symbol, decimals, totalRaw, vaultCount }>
	const categories = {
		limit:        { label: 'LIMIT ORDERS (Hardcoded Swap)', balances: new Map(), totalUsd: 0 },
		algorithmic:  { label: 'ALGORITHMIC ORDERS (DCA / Dynamic Spread / Custom)', balances: new Map(), totalUsd: 0 },
		unassociated: { label: 'UNASSOCIATED VAULTS (No Active Orders)', balances: new Map(), totalUsd: 0 },
	};

	let grandTotalUsd = 0;

	for (const vault of vaults) {
		const tokenAddr = (vault.token.address || vault.token.id).toLowerCase();
		const decimals = Number(vault.token.decimals) || 18;
		const symbol = vault.token.symbol || 'UNKNOWN';
		const rawBalance = vault.balance || '0';
		const rawBigInt = BigInt(rawBalance);

		if (rawBigInt === 0n) continue;

		const category = orderClassificationFailed
			? 'unassociated'
			: categorizeVault(vault.vaultId, tokenAddr, vaultOrderTypeMap);
		const cat = categories[category];

		if (!cat.balances.has(tokenAddr)) {
			cat.balances.set(tokenAddr, { symbol, decimals, totalRaw: 0n, vaultCount: 0 });
		}

		const entry = cat.balances.get(tokenAddr);
		entry.totalRaw += rawBigInt;
		entry.vaultCount++;
	}

	// Step 6: Display results
	for (const [catKey, cat] of Object.entries(categories)) {
		if (cat.balances.size === 0) continue;

		console.log('-'.repeat(70));
		console.log(`  ${cat.label}`);
		console.log('-'.repeat(70));

		const rows = [];
		let catUsd = 0;

		for (const [addr, entry] of cat.balances) {
			const balance = formatBalance(entry.totalRaw.toString(), entry.decimals);
			const known = KNOWN_TOKENS[addr];
			const symbol = known?.symbol || entry.symbol;
			const usdValue = getUsdValue(balance, symbol, addr, pythPrices);

			if (usdValue != null) catUsd += usdValue;
			rows.push({ symbol, balance, usdValue, vaultCount: entry.vaultCount });
		}

		printTokenRows(rows);
		cat.totalUsd = catUsd;
		grandTotalUsd += catUsd;

		console.log(`    ${''.padEnd(18)} ${''.padStart(20)}          ${('Subtotal: ' + formatUsd(catUsd)).padStart(16)}`);
		console.log('');
	}

	// Summary
	console.log('='.repeat(70));
	console.log('SUMMARY');
	console.log('='.repeat(70));

	for (const [, cat] of Object.entries(categories)) {
		if (cat.balances.size === 0) continue;
		console.log(`  ${cat.label.padEnd(55)} ${formatUsd(cat.totalUsd)}`);
	}

	console.log('-'.repeat(70));
	console.log(`  ${'TOTAL LIQUIDITY'.padEnd(55)} ${formatUsd(grandTotalUsd)}`);
	console.log('');
	console.log(`  Total vaults with balance: ${vaults.filter(v => BigInt(v.balance || '0') > 0n).length}`);
	console.log(`  Total active orders:       ${orders.filter(o => o.active).length}`);
	console.log('='.repeat(70));
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
