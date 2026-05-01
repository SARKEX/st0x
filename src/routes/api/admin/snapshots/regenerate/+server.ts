// Regenerate all snapshots for existing blocks
// This regenerates snapshots using the current code while keeping the same block numbers
// Useful when the snapshot generation logic has been fixed/improved
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { put } from '@vercel/blob';
import { generateAllTokenSnapshots } from '$lib/server/snapshots/generator';
import { TOKEN_ADDRESSES } from '$lib/server/snapshots/scraper';
import { kvGet, KV_KEYS, type SnapshotBlockRecord } from '$lib/server/kv';
import { env } from '$env/dynamic/private';
import { requireAdmin } from '$lib/server/adminAuth';
import { createAuditLogger } from '$lib/server/auditLog';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-snapshots-regenerate');
	if (guardResponse) return guardResponse;

	// Check if Blob token is available
	if (!env.BLOB_READ_WRITE_TOKEN) {
		return json(
			{ error: 'Blob storage not configured (missing BLOB_READ_WRITE_TOKEN)' },
			{ status: 503 }
		);
	}

	const audit = createAuditLogger(request);
	let scopeForAudit: { month?: string; blockNumber?: number } = {};

	try {
		const body = await request.json();
		const { confirmText, month, blockNumber } = body;
		scopeForAudit = {
			month: typeof month === 'string' ? month : undefined,
			blockNumber: typeof blockNumber === 'number' ? blockNumber : undefined
		};

		// For single block regeneration, no confirmation needed
		// For bulk regeneration, require REGENERATE confirmation
		if (!blockNumber && confirmText !== 'REGENERATE') {
			return json({ error: 'Invalid confirmation. Type REGENERATE to confirm.' }, { status: 400 });
		}

		// Get all canonical blocks
		const allBlocks = (await kvGet<SnapshotBlockRecord[]>(KV_KEYS.snapshotBlocks())) || [];

		if (allBlocks.length === 0) {
			return json({ error: 'No snapshot blocks found' }, { status: 404 });
		}

		// Determine which blocks to regenerate
		let blocksToRegenerate: SnapshotBlockRecord[];

		if (blockNumber) {
			// Single block regeneration
			const targetBlock = allBlocks.find((b) => b.blockNumber === blockNumber);
			if (!targetBlock) {
				return json(
					{ error: `Block ${blockNumber} not found in canonical blocks` },
					{ status: 404 }
				);
			}
			blocksToRegenerate = [targetBlock];
		} else if (month) {
			// Filter by month
			blocksToRegenerate = allBlocks.filter((b) => b.date.startsWith(month));
			if (blocksToRegenerate.length === 0) {
				return json({ error: `No blocks found for month ${month}` }, { status: 404 });
			}
		} else {
			// All blocks
			blocksToRegenerate = allBlocks;
		}

		console.log(`[Regenerate] Starting regeneration of ${blocksToRegenerate.length} blocks`);
		console.log(
			`[Regenerate] TOKEN_ADDRESSES: ${
				TOKEN_ADDRESSES.length
			} tokens configured: ${TOKEN_ADDRESSES.join(', ')}`
		);

		const results: {
			blockNumber: number;
			date: string;
			tokensGenerated: number;
			success: boolean;
			error?: string;
		}[] = [];

		// Process blocks one at a time to avoid overwhelming resources
		for (const block of blocksToRegenerate) {
			try {
				console.log(`[Regenerate] Processing block ${block.blockNumber} (${block.date})`);

				// Generate snapshots using the updated code (with correct vault attribution)
				console.log(
					`[Regenerate] Calling generateAllTokenSnapshots for block ${block.blockNumber}...`
				);
				const snapshots = await generateAllTokenSnapshots(block.blockNumber);
				console.log(
					`[Regenerate] Generated ${snapshots.length} snapshots for block ${block.blockNumber}`
				);

				if (snapshots.length === 0) {
					console.warn(
						`[Regenerate] WARNING: No snapshots generated for block ${block.blockNumber}`
					);
				}

				// Store each token's snapshot to blob (overwrites existing)
				let storedCount = 0;
				for (const snapshot of snapshots) {
					const blobPath = `snapshots/${snapshot.tokenSymbol}/${block.blockNumber}.json`;

					await put(blobPath, JSON.stringify(snapshot, null, 2), {
						access: 'public',
						contentType: 'application/json',
						token: env.BLOB_READ_WRITE_TOKEN,
						addRandomSuffix: false,
						allowOverwrite: true
					});

					storedCount++;
					console.log(
						`[Regenerate] Stored ${snapshot.tokenSymbol} at block ${block.blockNumber} (${storedCount}/${snapshots.length})`
					);
				}

				results.push({
					blockNumber: block.blockNumber,
					date: block.date,
					tokensGenerated: snapshots.length,
					success: true
				});
				console.log(
					`[Regenerate] Successfully processed block ${block.blockNumber}: ${snapshots.length} tokens`
				);
			} catch (error) {
				console.error(`[Regenerate] Error processing block ${block.blockNumber}:`, error);
				results.push({
					blockNumber: block.blockNumber,
					date: block.date,
					tokensGenerated: 0,
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}

		// Per-wallet points pipeline was deleted in Phase 1 (DEPR-02 D-03);
		// regenerated blobs no longer require a follow-up recalculate step.

		const successful = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;

		console.log(`[Regenerate] Completed: ${successful} successful, ${failed} failed`);

		try {
			await audit.logSuccess(
				'SNAPSHOT_REGENERATED',
				{
					...scopeForAudit,
					totalBlocks: blocksToRegenerate.length,
					successful,
					failed,
					regeneratedAt: new Date().toISOString()
				},
				{ adminUser: 'admin' }
			);
		} catch (auditErr) {
			console.error('[Regenerate] Audit-log emission failed:', auditErr);
		}

		return json({
			success: true,
			message: `Regenerated ${successful} blocks (${failed} failed).`,
			totalBlocks: blocksToRegenerate.length,
			successful,
			failed,
			results
		});
	} catch (error) {
		console.error('[Regenerate] Error:', error);
		try {
			await audit.logFailure(
				'SNAPSHOT_REGENERATED',
				{ ...scopeForAudit, regeneratedAt: new Date().toISOString() },
				error instanceof Error ? error.message : 'Unknown error',
				{ adminUser: 'admin' }
			);
		} catch (auditErr) {
			console.error('[Regenerate] Audit-log failure emission failed:', auditErr);
		}
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
