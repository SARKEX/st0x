import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { getKv, kvGet, kvSet, kvDel, KV_KEYS } from './kv';
import { env } from '$env/dynamic/private';

// Create a public client for Base network for signature verification
// Supports ECDSA (EOA), EIP-1271 (Smart Contracts), and EIP-6492 (Undeployed)
const basePublicClient = createPublicClient({
	chain: base,
	transport: http('https://mainnet.base.org')
});

// Types
export interface AccessCode {
	code: string;
	maxUses: number | null; // null = unlimited
	currentUses: number;
	expiresAt: string | null; // ISO timestamp, null = never expires
	createdAt: string;
	createdBy: string;
	label: string | null;
}

export interface RegisteredWallet {
	address: string;
	accessCode: string;
	registeredAt: string;
}

// In-memory fallback for development
const devStore = {
	codes: new Map<string, AccessCode>(),
	wallets: new Map<string, RegisteredWallet>(),
	codeWallets: new Map<string, string[]>()
};

// Generate a random code in format ST0X-XXXX-XXXX
export function generateAccessCode(): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (0, O, 1, I)
	const randomPart = (length: number) =>
		Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
	return `ST0X-${randomPart(4)}-${randomPart(4)}`;
}

// Create the message that users need to sign
export function createSignMessage(address: string, code: string): string {
	return `Sign to verify wallet ownership for st0x rewards.

Wallet: ${address}
Access Code: ${code}
Timestamp: ${Date.now()}`;
}

// Verify a wallet signature
// Supports: ECDSA (EOA), EIP-1271 (Smart Contract Wallets), EIP-6492 (Undeployed Counterfactual)
export async function verifyWalletSignature(
	address: string,
	message: string,
	signature: `0x${string}`
): Promise<boolean> {
	try {
		// viem's publicClient.verifyMessage handles all signature types:
		// - ECDSA for EOA wallets
		// - EIP-1271 for deployed smart contract wallets (Safe, AA wallets)
		// - EIP-6492 for undeployed counterfactual wallets
		const valid = await basePublicClient.verifyMessage({
			address: address as `0x${string}`,
			message,
			signature
		});
		return valid;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown verification error';
		console.error('[accessCodes] Signature verification failed:', { message });
		return false;
	}
}

// Verify hCaptcha token
export async function verifyCaptcha(token: string): Promise<boolean> {
	const secret = env.HCAPTCHA_SECRET;
	if (!secret) {
		console.warn('HCAPTCHA_SECRET not configured, skipping captcha verification');
		return true; // Allow in dev without captcha
	}

	try {
		const response = await fetch('https://hcaptcha.com/siteverify', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				secret,
				response: token
			})
		});
		const data = await response.json();
		return data.success === true;
	} catch {
		return false;
	}
}

// === Access Code Management ===

export async function createAccessCode(
	code: string | null,
	maxUses: number | null,
	expiresAt: string | null,
	label: string | null,
	createdBy: string
): Promise<AccessCode> {
	const finalCode = (code?.trim() || generateAccessCode()).toUpperCase();

	const accessCode: AccessCode = {
		code: finalCode,
		maxUses,
		currentUses: 0,
		expiresAt,
		createdAt: new Date().toISOString(),
		createdBy,
		label
	};

	const kv = await getKv();
	if (kv) {
		await kvSet(KV_KEYS.accessCode(finalCode), accessCode);
		// Add to list of all codes
		const allCodes = (await kvGet<string[]>(KV_KEYS.allCodes())) || [];
		if (!allCodes.includes(finalCode)) {
			allCodes.push(finalCode);
			await kvSet(KV_KEYS.allCodes(), allCodes);
		}
	} else {
		devStore.codes.set(finalCode, accessCode);
	}

	return accessCode;
}

export async function getAccessCode(code: string): Promise<AccessCode | null> {
	const normalizedCode = code.trim().toUpperCase();

	const kv = await getKv();
	if (kv) {
		return await kvGet<AccessCode>(KV_KEYS.accessCode(normalizedCode));
	}
	return devStore.codes.get(normalizedCode) || null;
}

export async function validateAccessCode(
	code: string
): Promise<{ valid: boolean; reason?: string; remaining?: number }> {
	const accessCode = await getAccessCode(code);

	if (!accessCode) {
		return { valid: false, reason: 'Invalid access code' };
	}

	// Check expiration
	if (accessCode.expiresAt && new Date(accessCode.expiresAt) < new Date()) {
		return { valid: false, reason: 'Access code has expired' };
	}

	// Check usage limit
	if (accessCode.maxUses !== null && accessCode.currentUses >= accessCode.maxUses) {
		return { valid: false, reason: 'Access code has reached maximum uses' };
	}

	const remaining =
		accessCode.maxUses !== null ? accessCode.maxUses - accessCode.currentUses : undefined;

	return { valid: true, remaining };
}

export async function incrementCodeUsage(code: string): Promise<void> {
	const normalizedCode = code.trim().toUpperCase();
	const accessCode = await getAccessCode(normalizedCode);

	if (!accessCode) return;

	accessCode.currentUses += 1;

	const kv = await getKv();
	if (kv) {
		await kvSet(KV_KEYS.accessCode(normalizedCode), accessCode);
	} else {
		devStore.codes.set(normalizedCode, accessCode);
	}
}

export async function updateAccessCode(
	code: string,
	updates: {
		maxUses?: number | null;
		expiresAt?: string | null;
		label?: string | null;
	}
): Promise<AccessCode | null> {
	const normalizedCode = code.trim().toUpperCase();
	const accessCode = await getAccessCode(normalizedCode);

	if (!accessCode) return null;

	// Apply updates
	if ('maxUses' in updates) {
		accessCode.maxUses = updates.maxUses ?? null;
	}
	if ('expiresAt' in updates) {
		accessCode.expiresAt = updates.expiresAt ?? null;
	}
	if ('label' in updates) {
		accessCode.label = updates.label ?? null;
	}

	const kv = await getKv();
	if (kv) {
		await kvSet(KV_KEYS.accessCode(normalizedCode), accessCode);
	} else {
		devStore.codes.set(normalizedCode, accessCode);
	}

	return accessCode;
}

export async function listAccessCodes(): Promise<AccessCode[]> {
	const kv = await getKv();
	if (kv) {
		const allCodes = (await kvGet<string[]>(KV_KEYS.allCodes())) || [];
		const codes: AccessCode[] = [];
		for (const code of allCodes) {
			const accessCode = await getAccessCode(code);
			if (accessCode) {
				codes.push(accessCode);
			}
		}
		return codes;
	}
	return Array.from(devStore.codes.values());
}

export async function deleteAccessCode(code: string): Promise<boolean> {
	const normalizedCode = code.trim().toUpperCase();

	const kv = await getKv();
	if (kv) {
		await kvDel(KV_KEYS.accessCode(normalizedCode));
		// Remove from all codes list
		const allCodes = (await kvGet<string[]>(KV_KEYS.allCodes())) || [];
		const filtered = allCodes.filter((c: string) => c !== normalizedCode);
		await kvSet(KV_KEYS.allCodes(), filtered);
		return true;
	}

	return devStore.codes.delete(normalizedCode);
}

// === Wallet Management ===

export async function isWalletRegistered(address: string): Promise<boolean> {
	const normalizedAddress = address.toLowerCase();

	const kv = await getKv();
	if (kv) {
		const wallet = await kvGet<RegisteredWallet>(KV_KEYS.wallet(normalizedAddress));
		return wallet !== null;
	}
	return devStore.wallets.has(normalizedAddress);
}

export async function getWalletInfo(address: string): Promise<RegisteredWallet | null> {
	const normalizedAddress = address.toLowerCase();

	const kv = await getKv();
	if (kv) {
		return await kvGet<RegisteredWallet>(KV_KEYS.wallet(normalizedAddress));
	}
	return devStore.wallets.get(normalizedAddress) || null;
}

export async function registerWallet(address: string, code: string): Promise<RegisteredWallet> {
	const normalizedAddress = address.toLowerCase();
	const normalizedCode = code.trim().toUpperCase();

	const wallet: RegisteredWallet = {
		address: normalizedAddress,
		accessCode: normalizedCode,
		registeredAt: new Date().toISOString()
	};

	const kv = await getKv();
	if (kv) {
		await kvSet(KV_KEYS.wallet(normalizedAddress), wallet);
		// Add to code's wallet list for analytics
		const codeWallets = (await kvGet<string[]>(KV_KEYS.codeWallets(normalizedCode))) || [];
		if (!codeWallets.includes(normalizedAddress)) {
			codeWallets.push(normalizedAddress);
			await kvSet(KV_KEYS.codeWallets(normalizedCode), codeWallets);
		}
	} else {
		devStore.wallets.set(normalizedAddress, wallet);
		const existing = devStore.codeWallets.get(normalizedCode) || [];
		if (!existing.includes(normalizedAddress)) {
			existing.push(normalizedAddress);
			devStore.codeWallets.set(normalizedCode, existing);
		}
	}

	// Increment code usage
	await incrementCodeUsage(normalizedCode);

	return wallet;
}

export async function getWalletsByCode(code: string): Promise<string[]> {
	const normalizedCode = code.trim().toUpperCase();

	const kv = await getKv();
	if (kv) {
		return (await kvGet<string[]>(KV_KEYS.codeWallets(normalizedCode))) || [];
	}
	return devStore.codeWallets.get(normalizedCode) || [];
}

// === Full Registration Flow ===

export interface RegistrationResult {
	success: boolean;
	error?: string;
	wallet?: RegisteredWallet;
}

export async function processRegistration(
	address: string,
	code: string,
	signature: `0x${string}`,
	message: string
): Promise<RegistrationResult> {
	// 1. Verify signature
	const signatureValid = await verifyWalletSignature(address, message, signature);
	if (!signatureValid) {
		return { success: false, error: 'Signature verification failed' };
	}

	// 2. Check if wallet already registered
	const alreadyRegistered = await isWalletRegistered(address);
	if (alreadyRegistered) {
		return { success: false, error: 'Wallet is already registered' };
	}

	// 3. Validate access code
	const codeValidation = await validateAccessCode(code);
	if (!codeValidation.valid) {
		return { success: false, error: codeValidation.reason };
	}

	// 4. Register wallet
	const wallet = await registerWallet(address, code);

	return { success: true, wallet };
}
