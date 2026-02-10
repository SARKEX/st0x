// API endpoint to retrieve snapshots by block and token from Vercel Blob
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { list } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { TOKENS } from '$lib/config/tokens';
import { TOKEN_MIGRATION_MAPPINGS } from '$lib/config/tokenMigration';

const LEGACY_BY_WRAPPED = new Map(
	TOKEN_MIGRATION_MAPPINGS.map((m) => [m.newToken.symbol.toLowerCase(), m.oldToken.symbol])
);
const WRAPPED_BY_LEGACY = new Map(
	TOKEN_MIGRATION_MAPPINGS.map((m) => [m.oldToken.symbol.toLowerCase(), m.newToken.symbol])
);
const LEGACY_SYMBOLS = new Set([
	...TOKEN_MIGRATION_MAPPINGS.map((m) => m.oldToken.symbol.toLowerCase()),
	...TOKENS.flatMap((t) => t.previousSymbols ?? []).map((s) => s.toLowerCase())
]);

// Build a map from current/legacy symbols to their historical (previous) symbols
// e.g., 'wtspym' -> ['wtSPLG', 'tSPLG']
const PREVIOUS_SYMBOLS_BY_CURRENT = new Map<string, string[]>();
for (const t of TOKENS) {
	if (t.previousSymbols?.length) {
		PREVIOUS_SYMBOLS_BY_CURRENT.set(t.symbol.toLowerCase(), t.previousSymbols);
		// Also map the legacy symbol to previous symbols
		if (t.legacySymbol) {
			PREVIOUS_SYMBOLS_BY_CURRENT.set(t.legacySymbol.toLowerCase(), t.previousSymbols);
		}
	}
}

// Reverse map: previous symbol -> canonical (current wrapped) symbol
const CANONICAL_BY_PREVIOUS = new Map<string, string>();
for (const t of TOKENS) {
	if (t.previousSymbols?.length) {
		for (const prev of t.previousSymbols) {
			CANONICAL_BY_PREVIOUS.set(prev.toLowerCase(), t.symbol);
		}
	}
}

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

function getTokenSymbolCandidates(tokenSymbol: string): string[] {
	const symbol = tokenSymbol.trim();
	const lower = symbol.toLowerCase();
	const candidates: string[] = [symbol];

	const mappedLegacy = LEGACY_BY_WRAPPED.get(lower);
	if (mappedLegacy) candidates.push(mappedLegacy);

	const mappedWrapped = WRAPPED_BY_LEGACY.get(lower);
	if (mappedWrapped) candidates.push(mappedWrapped);

	// Generic fallbacks (covers default wtXXX <-> tXXX naming)
	if (symbol.startsWith('wt')) candidates.push(`t${symbol.slice(2)}`);
	if (symbol.startsWith('t')) candidates.push(`wt${symbol.slice(1)}`);

	// Historical symbol names (e.g., wtSPYM -> wtSPLG, tSPLG)
	const prevSymbols = PREVIOUS_SYMBOLS_BY_CURRENT.get(lower);
	if (prevSymbols) candidates.push(...prevSymbols);

	return uniqueSymbols(candidates);
}

function getCanonicalSymbol(symbol: string): string {
	// Check if this is a previous/renamed symbol
	const canonical = CANONICAL_BY_PREVIOUS.get(symbol.toLowerCase());
	if (canonical) return canonical;
	return WRAPPED_BY_LEGACY.get(symbol.toLowerCase()) ?? symbol;
}

function getAllSnapshotTokenSymbols(): string[] {
	return uniqueSymbols([
		...TOKENS.map((t) => t.symbol),
		...TOKEN_MIGRATION_MAPPINGS.map((m) => m.oldToken.symbol),
		...TOKENS.flatMap((t) => t.previousSymbols ?? [])
	]);
}

export const GET: RequestHandler = async ({ url }) => {
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
			const candidateSymbols = getTokenSymbolCandidates(tokenSymbol);
			const lookupResults = await Promise.all(
				candidateSymbols.map(async (symbol) => {
					const prefix = `snapshots/${symbol}/${blockNumber}.json`;
					const { blobs } = await list({ prefix, limit: 1, token: env.BLOB_READ_WRITE_TOKEN });
					return { symbol, blob: blobs[0] ?? null };
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
				token: tokenSymbol,
				resolvedToken: match.symbol,
				url: match.blob.url,
				snapshot: snapshotData
			});
		}

		// If no token specified, get all token snapshots for this block
		// Query each token's specific blob path in parallel to avoid pagination issues
		const tokenSymbols = getAllSnapshotTokenSymbols();

			const snapshotsRaw = (
				await Promise.all(
					tokenSymbols.map(async (symbol) => {
						const prefix = `snapshots/${symbol}/${blockNumber}.json`;
						try {
						const { blobs } = await list({
							prefix,
								limit: 1,
								token: env.BLOB_READ_WRITE_TOKEN
							});
							if (blobs.length === 0) return null;

							const response = await fetch(blobs[0].url);
							if (!response.ok)
								return {
									token: symbol,
									canonicalToken: getCanonicalSymbol(symbol),
									isLegacy: LEGACY_SYMBOLS.has(symbol.toLowerCase()),
									url: blobs[0].url,
									snapshot: null
								};

							const data = await response.json();
							return {
								token: symbol,
								canonicalToken: getCanonicalSymbol(symbol),
								isLegacy: LEGACY_SYMBOLS.has(symbol.toLowerCase()),
								url: blobs[0].url,
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
