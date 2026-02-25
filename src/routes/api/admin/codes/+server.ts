import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createAccessCode,
	listAccessCodes,
	deleteAccessCode,
	getAccessCode,
	getWalletsByCode,
	generateAccessCode,
	updateAccessCode
} from '$lib/server/accessCodes';
import { requireAdmin } from '$lib/server/adminAuth';
import { createAuditLogger } from '$lib/server/auditLog';

// GET - List all access codes
export const GET: RequestHandler = async ({ cookies, request }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-codes-list');
	if (guardResponse) return guardResponse;

	const codes = await listAccessCodes();

	// Add wallet counts for each code
	const codesWithStats = await Promise.all(
		codes.map(async (code) => {
			const wallets = await getWalletsByCode(code.code);
			return {
				...code,
				walletCount: wallets.length
			};
		})
	);

	return json({ codes: codesWithStats });
};

// POST - Create new access code
export const POST: RequestHandler = async ({ request, cookies }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-codes-create');
	if (guardResponse) return guardResponse;

	const audit = createAuditLogger(request);

	try {
		const { code, maxUses, expiresAt, label } = await request.json();

		// If code provided, validate format
		if (code && typeof code === 'string') {
			const existingCode = await getAccessCode(code);
			if (existingCode) {
				return json({ error: 'Access code already exists' }, { status: 400 });
			}
		}

		const accessCode = await createAccessCode(
			code || null,
			maxUses ?? null,
			expiresAt ?? null,
			label ?? null,
			'admin'
		);

		// Audit log
		await audit.logSuccess(
			'ACCESS_CODE_CREATED',
			{
				code: accessCode.code,
				maxUses: accessCode.maxUses,
				expiresAt: accessCode.expiresAt,
				label: accessCode.label
			},
			{ adminUser: 'admin' }
		);

		return json({ success: true, code: accessCode });
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};

// DELETE - Delete access code
export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-codes-delete');
	if (guardResponse) return guardResponse;

	const audit = createAuditLogger(request);

	try {
		const { code } = await request.json();

		if (!code || typeof code !== 'string') {
			return json({ error: 'Access code required' }, { status: 400 });
		}

		const deleted = await deleteAccessCode(code);

		if (deleted) {
			// Audit log
			await audit.logSuccess(
				'ACCESS_CODE_DELETED',
				{ code: code.toUpperCase() },
				{ adminUser: 'admin' }
			);
			return json({ success: true });
		}

		return json({ error: 'Access code not found' }, { status: 404 });
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};

// PATCH - Generate a new code (utility endpoint)
export const PATCH: RequestHandler = async ({ cookies, request }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-codes-generate');
	if (guardResponse) return guardResponse;

	const code = generateAccessCode();
	return json({ code });
};

// PUT - Update an existing access code
export const PUT: RequestHandler = async ({ request, cookies }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-codes-update');
	if (guardResponse) return guardResponse;

	const audit = createAuditLogger(request);

	try {
		const { code, maxUses, expiresAt, label } = await request.json();

		if (!code || typeof code !== 'string') {
			return json({ error: 'Access code required' }, { status: 400 });
		}

		const existingCode = await getAccessCode(code);
		if (!existingCode) {
			return json({ error: 'Access code not found' }, { status: 404 });
		}

		const updatedCode = await updateAccessCode(code, {
			maxUses: maxUses !== undefined ? maxUses : undefined,
			expiresAt: expiresAt !== undefined ? expiresAt : undefined,
			label: label !== undefined ? label : undefined
		});

		if (updatedCode) {
			// Audit log
			await audit.logSuccess(
				'ACCESS_CODE_UPDATED',
				{
					code: code.toUpperCase(),
					changes: { maxUses, expiresAt, label }
				},
				{ adminUser: 'admin' }
			);

			return json({ success: true, code: updatedCode });
		}

		return json({ error: 'Failed to update code' }, { status: 500 });
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};
