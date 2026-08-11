// API endpoint to retrieve snapshots by block and token from Vercel Blob
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { list } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { TOKENS, onTokenCatalogChange } from '$lib/config/tokens';
import { TOKEN_MIGRATION_MAPPINGS } from '$lib/config/tokenMigration';
import { getServerApplicationCatalog } from '$lib/server/applicationCatalog';

const LEGACY_BY_WRAPPED = new Map<string, string>();
const WRAPPED_BY_LEGACY = new Map<string, string>();
const LEGACY_SYMBOLS = new Set<string>();

// Build a map from current/legacy symbols to their historical (previous) symbols
// e.g., 'wtspym' -> ['wtSPLG', 'tSPLG']
const PREVIOUS_SYMBOLS_BY_CURRENT = new Map<string, string[]>();

// Reverse map: previous symbol -> canonical (current wrapped) symbol
const CANONICAL_BY_PREVIOUS = new Map<string, string>();

onTokenCatalogChange((tokens) => {
	LEGACY_BY_WRAPPED.clear();
	WRAPPED_BY_LEGACY.clear();
	LEGACY_SYMBOLS.clear();
	PREVIOUS_SYMBOLS_BY_CURRENT.clear();
	CANONICAL_BY_PREVIOUS.clear();

	for (const mapping of TOKEN_MIGRATION_MAPPINGS) {
		LEGACY_BY_WRAPPED.set(
			`${mapping.chainId}:${mapping.newToken.symbol.toLowerCase()}`,
			mapping.oldToken.symbol
		);
		WRAPPED_BY_LEGACY.set(
			`${mapping.chainId}:${mapping.oldToken.symbol.toLowerCase()}`,
			mapping.newToken.symbol
		);
		LEGACY_SYMBOLS.add(`${mapping.chainId}:${mapping.oldToken.symbol.toLowerCase()}`);
	}

	for (const token of tokens) {
		for (const previousSymbol of token.previousSymbols ?? []) {
			LEGACY_SYMBOLS.add(`${token.chainId}:${previousSymbol.toLowerCase()}`);
			CANONICAL_BY_PREVIOUS.set(`${token.chainId}:${previousSymbol.toLowerCase()}`, token.symbol);
		}
		if (token.previousSymbols?.length) {
			PREVIOUS_SYMBOLS_BY_CURRENT.set(
				`${token.chainId}:${token.symbol.toLowerCase()}`,
				token.previousSymbols
			);
			if (token.legacySymbol) {
				PREVIOUS_SYMBOLS_BY_CURRENT.set(
					`${token.chainId}:${token.legacySymbol.toLowerCase()}`,
					token.previousSymbols
				);
			}
		}
	}
});

function uniqueSymbols(symbols: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const s of symbols) {
		const trimmed = s.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
	}
	return out;
}

function getTokenSymbolCandidates(chainId: number, tokenSymbol: string): string[] {
	const symbol = tokenSymbol.trim();
	const lower = symbol.toLowerCase();
	const key = `${chainId}:${lower}`;
	const candidates: string[] = [symbol];

	const mappedLegacy = LEGACY_BY_WRAPPED.get(key);
	if (mappedLegacy) candidates.push(mappedLegacy);

	const mappedWrapped = WRAPPED_BY_LEGACY.get(key);
	if (mappedWrapped) candidates.push(mappedWrapped);

	// Generic fallbacks (covers default wtXXX <-> tXXX naming)
	if (symbol.startsWith('wt')) candidates.push(`t${symbol.slice(2)}`);
	if (symbol.startsWith('t')) candidates.push(`wt${symbol.slice(1)}`);

	// Historical symbol names (e.g., wtSPYM -> wtSPLG, tSPLG)
	const prevSymbols = PREVIOUS_SYMBOLS_BY_CURRENT.get(key);
	if (prevSymbols) candidates.push(...prevSymbols);

	return uniqueSymbols(candidates);
}

function getCanonicalSymbol(chainId: number, symbol: string): string {
	const key = `${chainId}:${symbol.toLowerCase()}`;
	// Check if this is a previous/renamed symbol
	const canonical = CANONICAL_BY_PREVIOUS.get(key);
	if (canonical) return canonical;
	return WRAPPED_BY_LEGACY.get(key) ?? symbol;
}

function getAllSnapshotTokenSymbols(chainId: number): string[] {
	return uniqueSymbols([
		...TOKENS.filter((token) => token.chainId === chainId).map((token) => token.symbol),
		...TOKEN_MIGRATION_MAPPINGS.filter((mapping) => mapping.chainId === chainId).map(
			(mapping) => mapping.oldToken.symbol
		),
		...TOKENS.filter((token) => token.chainId === chainId).flatMap(
			(token) => token.previousSymbols ?? []
		)
	]);
}

export const GET: RequestHandler = async ({ url }) => {
	const { networkCatalog } = await getServerApplicationCatalog();
	const requestedChain = url.searchParams.get('chainId');
	const chainId = requestedChain === null ? networkCatalog[0]?.chainId : Number(requestedChain);
	if (requestedChain === null && networkCatalog.length !== 1) {
		return json({ error: 'Missing chainId parameter' }, { status: 400 });
	}
	if (
		!Number.isSafeInteger(chainId) ||
		!networkCatalog.some((network) => network.chainId === chainId)
	) {
		return json({ error: 'Unsupported chainId parameter' }, { status: 400 });
	}
	const snapshotPrefix = (symbol: string, blockNumber: string) =>
		`snapshots/${chainId}/${symbol}/${blockNumber}.json`;
	const allowLegacySnapshots = networkCatalog.length === 1;
	const legacySnapshotPrefix = (symbol: string, blockNumber: string) =>
		`snapshots/${symbol}/${blockNumber}.json`;
	const findSnapshot = async (symbol: string, blockNumber: string) => {
		const prefixes = [snapshotPrefix(symbol, blockNumber)];
		if (allowLegacySnapshots) prefixes.push(legacySnapshotPrefix(symbol, blockNumber));
		for (const prefix of prefixes) {
			const { blobs } = await list({ prefix, limit: 1, token: env.BLOB_READ_WRITE_TOKEN });
			if (blobs[0]) return blobs[0];
		}
		return null;
	};
	// Check if Blob token is available (required for Vercel Blob storage)
	if (!env.BLOB_READ_WRITE_TOKEN) {
		return json(
			{ error: 'Blob storage not configured (missing BLOB_READ_WRITE_TOKEN)' },
			{ status: 503 }
		);
	}

	try {
		const blockNumber = url.searchParams.get('block');
		const tokenSymbol = url.searchParams.get('token');

		if (!blockNumber) {
			return json({ error: 'Missing block parameter' }, { status: 400 });
		}

		// If token is specified, get that specific snapshot
		if (tokenSymbol) {
			const candidateSymbols = getTokenSymbolCandidates(chainId, tokenSymbol);
			const lookupResults = await Promise.all(
				candidateSymbols.map(async (symbol) => {
					return { symbol, blob: await findSnapshot(symbol, blockNumber) };
				})
			);
			const match = lookupResults.find((r) => r.blob);

			if (!match?.blob) {
				return json(
					{
						success: false,
						error: `Snapshot not found for ${tokenSymbol} at block ${blockNumber}`,
						searchedSymbols: candidateSymbols
					},
					{ status: 404 }
				);
			}

			// Fetch the actual snapshot data
			const snapshotResponse = await fetch(match.blob.url);
			if (!snapshotResponse.ok) {
				return json({ error: 'Failed to fetch snapshot data' }, { status: 500 });
			}

			const snapshotData = await snapshotResponse.json();

			return json({
				success: true,
				blockNumber: parseInt(blockNumber),
				chainId,
				token: tokenSymbol,
				resolvedToken: match.symbol,
				url: match.blob.url,
				snapshot: snapshotData
			});
		}

		// If no token specified, get all token snapshots for this block
		// Query each token's specific blob path in parallel to avoid pagination issues
		const tokenSymbols = getAllSnapshotTokenSymbols(chainId);

		const snapshotsRaw = (
			await Promise.all(
				tokenSymbols.map(async (symbol) => {
					try {
						const blob = await findSnapshot(symbol, blockNumber);
						if (!blob) return null;

						const response = await fetch(blob.url);
						if (!response.ok)
							return {
								token: symbol,
								canonicalToken: getCanonicalSymbol(chainId, symbol),
								isLegacy: LEGACY_SYMBOLS.has(`${chainId}:${symbol.toLowerCase()}`),
								url: blob.url,
								snapshot: null
							};

						const data = await response.json();
						return {
							token: symbol,
							canonicalToken: getCanonicalSymbol(chainId, symbol),
							isLegacy: LEGACY_SYMBOLS.has(`${chainId}:${symbol.toLowerCase()}`),
							url: blob.url,
							snapshot: data
						};
					} catch {
						return null;
					}
				})
			)
		).filter((s) => s !== null);

		// If both wrapped and legacy snapshots exist for the same token/block, prefer wrapped.
		const canonicalMap = new Map<
			string,
			{
				token: string;
				canonicalToken: string;
				isLegacy: boolean;
				url: string;
				snapshot: unknown;
			}
		>();
		for (const entry of snapshotsRaw) {
			const existing = canonicalMap.get(entry.canonicalToken);
			if (!existing) {
				canonicalMap.set(entry.canonicalToken, entry);
				continue;
			}
			if (existing.isLegacy && !entry.isLegacy && entry.snapshot != null) {
				canonicalMap.set(entry.canonicalToken, entry);
			}
		}

		const snapshots = Array.from(canonicalMap.values())
			.map((entry) => ({
				token: entry.canonicalToken,
				url: entry.url,
				snapshot: entry.snapshot
			}))
			.sort((a, b) => a.token.localeCompare(b.token));

		if (snapshots.length === 0) {
			return json(
				{
					success: false,
					error: `No snapshots found for block ${blockNumber}`
				},
				{ status: 404 }
			);
		}

		return json({
			success: true,
			chainId,
			blockNumber: parseInt(blockNumber),
			tokensFound: snapshots.length,
			snapshots
		});
	} catch (error) {
		console.error('[Snapshot Get] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
