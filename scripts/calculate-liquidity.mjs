#!/usr/bin/env node

/**
 * Calculate total liquidity deployed in the orderbook smart contract
 * by a specific address.
 *
 * Queries the orderbook subgraph for all vaults owned by the target address,
 * groups balances by token, and fetches USDC prices from Pyth oracle.
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

/**
 * Fetch all vaults for an owner from a single subgraph endpoint with pagination.
 */
async function fetchVaultsFromEndpoint(endpoint, owner) {
	const allVaults = [];
	let skip = 0;
	const first = 1000;
	let hasMore = true;

	while (hasMore) {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: VAULTS_BY_OWNER_QUERY,
				variables: { owner, skip, first }
			})
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const json = await response.json();
		if (json.errors?.length) {
			throw new Error(`GraphQL: ${json.errors.map(e => e.message).join('; ')}`);
		}

		const vaults = json.data?.vaults ?? [];
		allVaults.push(...vaults);
		hasMore = vaults.length >= first;
		skip += first;
	}

	return allVaults;
}

/**
 * Fetch vaults from all subgraph endpoints, deduplicate by vault id.
 */
async function fetchAllVaults(owner) {
	const results = await Promise.allSettled(
		ORDERBOOK_SUBGRAPH_URLS.map(url =>
			fetchVaultsFromEndpoint(url, owner).catch(err => {
				console.error(`  Warning: failed to query ${url}: ${err.message}`);
				return [];
			})
		)
	);

	const allVaults = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

	// Deduplicate by vault id, preferring the first occurrence (from active subgraph)
	const seen = new Set();
	return allVaults.filter(v => {
		if (seen.has(v.id)) return false;
		seen.add(v.id);
		return true;
	});
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

// ============================================================================
// Main
// ============================================================================

async function main() {
	console.log('='.repeat(70));
	console.log('Orderbook Liquidity Calculator');
	console.log('='.repeat(70));
	console.log(`Target address: ${TARGET_ADDRESS}`);
	console.log(`Querying ${ORDERBOOK_SUBGRAPH_URLS.length} subgraph endpoint(s)...\n`);

	// Step 1: Fetch all vaults for the owner
	const vaults = await fetchAllVaults(TARGET_ADDRESS);
	console.log(`Found ${vaults.length} vault(s)\n`);

	if (vaults.length === 0) {
		console.log('No vaults found for this address.');
		return;
	}

	// Step 2: Group vaults by token and sum balances
	const tokenBalances = new Map(); // tokenAddress -> { symbol, decimals, totalRaw, vaultCount, vaultIds }

	for (const vault of vaults) {
		const tokenAddr = (vault.token.address || vault.token.id).toLowerCase();
		const decimals = Number(vault.token.decimals) || 18;
		const symbol = vault.token.symbol || 'UNKNOWN';
		const name = vault.token.name || '';
		const rawBalance = vault.balance || '0';

		if (!tokenBalances.has(tokenAddr)) {
			tokenBalances.set(tokenAddr, {
				symbol,
				name,
				decimals,
				totalRaw: 0n,
				vaultCount: 0,
				vaultIds: []
			});
		}

		const entry = tokenBalances.get(tokenAddr);
		entry.totalRaw += BigInt(rawBalance);
		entry.vaultCount++;
		entry.vaultIds.push(vault.vaultId);
	}

	// Step 3: Fetch prices from Pyth
	const feedIdsToFetch = new Set();
	for (const [addr] of tokenBalances) {
		const known = KNOWN_TOKENS[addr];
		if (known?.priceFeedId) {
			feedIdsToFetch.add(known.priceFeedId);
		}
	}

	console.log(`Fetching prices for ${feedIdsToFetch.size} token(s) from Pyth oracle...\n`);
	const pythPrices = await fetchPythPrices([...feedIdsToFetch]);

	// Step 4: Calculate and display results
	console.log('-'.repeat(70));
	console.log('VAULT BALANCES BY TOKEN');
	console.log('-'.repeat(70));

	let totalUsdcValue = 0;
	const rows = [];

	for (const [addr, entry] of tokenBalances) {
		const balance = formatBalance(entry.totalRaw.toString(), entry.decimals);
		const known = KNOWN_TOKENS[addr];
		const symbol = known?.symbol || entry.symbol;

		let usdValue = null;
		if (symbol === 'USDC') {
			usdValue = balance; // USDC is 1:1 with USD
		} else if (known?.priceFeedId) {
			const feedId = normaliseFeedId(known.priceFeedId);
			const price = pythPrices.get(feedId);
			if (price != null) {
				usdValue = balance * price;
			}
		}

		if (usdValue != null) {
			totalUsdcValue += usdValue;
		}

		rows.push({ addr, symbol, balance, usdValue, entry });
	}

	// Sort by USD value descending (unknowns last)
	rows.sort((a, b) => {
		if (a.usdValue == null && b.usdValue == null) return 0;
		if (a.usdValue == null) return 1;
		if (b.usdValue == null) return -1;
		return b.usdValue - a.usdValue;
	});

	for (const row of rows) {
		const usdStr = row.usdValue != null
			? `$${row.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
			: '(no price)';
		const balStr = row.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

		console.log(`  ${row.symbol.padEnd(18)} ${balStr.padStart(20)} tokens   ${usdStr.padStart(16)}   (${row.entry.vaultCount} vault(s))`);
	}

	console.log('-'.repeat(70));
	console.log(`\nTOTAL LIQUIDITY (USD): $${totalUsdcValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
	console.log(`\nTotal vaults: ${vaults.length}`);
	console.log(`Total unique tokens: ${tokenBalances.size}`);
	console.log('='.repeat(70));
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
