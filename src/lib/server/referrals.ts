import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { getKv, kvGet, kvSet, KV_KEYS, type MonthlyPointsData, type RewardsPoolConfig } from './kv';
import { getExcludedWalletsSet } from './kv';
import { getWalletInfo, type RegisteredWallet } from './accessCodes';

// Create a public client for Base network for signature verification
const basePublicClient = createPublicClient({
	chain: base,
	transport: http('https://mainnet.base.org')
});

// Types
export interface ReferralProfile {
	walletAddress: string; // The referrer's wallet (primary key)
	referralCode: string; // e.g., "st0x-ref-abc123"
	nickname: string; // Display name for leaderboard
	telegramHandle: string; // e.g., "@username"
	createdAt: string; // ISO timestamp
	isActive: boolean; // Can be deactivated by admin
}

// Note: ReferredWallet is no longer needed - we use RegisteredWallet from accessCodes.ts
// which already tracks accessCode (= referralCode) for each wallet

export interface ReferralPerformance {
	walletsReferred: number;
	totalPoints: number; // Sum of points from referred wallets
	projectedRewards: number; // 50% of sum of estimated rewards
}

export interface ReferralLeaderboardEntry {
	rank: number;
	nickname: string;
	referralCode: string;
	walletsReferred: number;
	totalPoints: number;
	projectedRewards: number;
}

export interface AdminReferralLeaderboardEntry extends ReferralLeaderboardEntry {
	telegramHandle: string;
	walletAddress: string;
	referredWallets: string[]; // List of referred wallet addresses
	createdAt: string;
}

// In-memory fallback for development
const devStore = {
	profiles: new Map<string, ReferralProfile>(),
	codeToWallet: new Map<string, string>(),
	codeWallets: new Map<string, string[]>() // Shared with accessCodes system
};

// Generate a random referral code in format st0x-ref-xxxxxx
export function generateReferralCode(): string {
	const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // Removed confusing chars (0, o, 1, i, l)
	const randomPart = Array.from(
		{ length: 6 },
		() => chars[Math.floor(Math.random() * chars.length)]
	).join('');
	return `st0x-ref-${randomPart}`;
}

// Create the message that users need to sign to join the referral programme
export function createReferralSignMessage(address: string): string {
	return `Sign to join the st0x referral programme.

Wallet: ${address}
Timestamp: ${Date.now()}`;
}

// Verify a wallet signature (reuse logic from accessCodes)
export async function verifyWalletSignature(
	address: string,
	message: string,
	signature: `0x${string}`
): Promise<boolean> {
	try {
		const valid = await basePublicClient.verifyMessage({
			address: address as `0x${string}`,
			message,
			signature
		});
		return valid;
	} catch (error) {
		const msg = error instanceof Error ? error.message : 'Unknown verification error';
		console.error('[referrals] Signature verification failed:', { message: msg });
		return false;
	}
}

// Validate telegram handle format
export function isValidTelegramHandle(handle: string): boolean {
	// Must start with @ and be 5-32 chars (including @)
	// Username can only contain a-z, 0-9, and underscores
	const pattern = /^@[a-zA-Z][a-zA-Z0-9_]{3,30}$/;
	return pattern.test(handle);
}

// Validate nickname
export function isValidNickname(nickname: string): boolean {
	// 3-20 characters, alphanumeric and underscores
	const pattern = /^[a-zA-Z0-9_]{3,20}$/;
	return pattern.test(nickname);
}

// === Profile Management ===

export async function createReferralProfile(
	walletAddress: string,
	nickname: string,
	telegramHandle: string
): Promise<{ success: boolean; profile?: ReferralProfile; error?: string }> {
	const normalizedWallet = walletAddress.toLowerCase();
	const normalizedNickname = nickname.trim();
	const normalizedTelegram = telegramHandle.trim();

	// Validate inputs
	if (!isValidNickname(normalizedNickname)) {
		return {
			success: false,
			error: 'Nickname must be 3-20 characters (letters, numbers, underscores)'
		};
	}

	if (!isValidTelegramHandle(normalizedTelegram)) {
		return { success: false, error: 'Invalid Telegram handle format (e.g., @username)' };
	}

	// Check if wallet already has a referral profile
	const existingProfile = await getReferralProfile(normalizedWallet);
	if (existingProfile) {
		return { success: false, error: 'You already have a referral profile' };
	}

	// Check if nickname is already taken
	const nicknameTaken = await isNicknameTaken(normalizedNickname);
	if (nicknameTaken) {
		return { success: false, error: 'This nickname is already taken' };
	}

	// Generate unique referral code
	let referralCode = generateReferralCode();
	let attempts = 0;
	while ((await getReferralProfileByCode(referralCode)) && attempts < 10) {
		referralCode = generateReferralCode();
		attempts++;
	}

	// Verify the final code is unique
	if (await getReferralProfileByCode(referralCode)) {
		return { success: false, error: 'Failed to generate unique referral code. Please try again.' };
	}

	const profile: ReferralProfile = {
		walletAddress: normalizedWallet,
		referralCode,
		nickname: normalizedNickname,
		telegramHandle: normalizedTelegram,
		createdAt: new Date().toISOString(),
		isActive: true
	};

	const kv = await getKv();
	if (kv) {
		await kvSet(KV_KEYS.referralProfile(normalizedWallet), profile);
		await kvSet(KV_KEYS.referralCodeToWallet(referralCode), normalizedWallet);
		// Add to list of all profiles
		const allProfiles = (await kvGet<string[]>(KV_KEYS.allReferralProfiles())) || [];
		if (!allProfiles.includes(normalizedWallet)) {
			allProfiles.push(normalizedWallet);
			await kvSet(KV_KEYS.allReferralProfiles(), allProfiles);
		}
	} else {
		devStore.profiles.set(normalizedWallet, profile);
		devStore.codeToWallet.set(referralCode.toLowerCase(), normalizedWallet);
	}

	return { success: true, profile };
}

export async function getReferralProfile(walletAddress: string): Promise<ReferralProfile | null> {
	const normalizedWallet = walletAddress.toLowerCase();

	const kv = await getKv();
	if (kv) {
		return await kvGet<ReferralProfile>(KV_KEYS.referralProfile(normalizedWallet));
	}
	return devStore.profiles.get(normalizedWallet) || null;
}

export async function getReferralProfileByCode(code: string): Promise<ReferralProfile | null> {
	const normalizedCode = code.toLowerCase();

	const kv = await getKv();
	if (kv) {
		const walletAddress = await kvGet<string>(KV_KEYS.referralCodeToWallet(normalizedCode));
		if (!walletAddress) return null;
		return await getReferralProfile(walletAddress);
	}

	const walletAddress = devStore.codeToWallet.get(normalizedCode);
	if (!walletAddress) return null;
	return devStore.profiles.get(walletAddress) || null;
}

async function isNicknameTaken(nickname: string): Promise<boolean> {
	const normalizedNickname = nickname.toLowerCase();

	const kv = await getKv();
	if (kv) {
		const allWallets = (await kvGet<string[]>(KV_KEYS.allReferralProfiles())) || [];
		for (const wallet of allWallets) {
			const profile = await getReferralProfile(wallet);
			if (profile && profile.nickname.toLowerCase() === normalizedNickname) {
				return true;
			}
		}
		return false;
	}

	for (const profile of devStore.profiles.values()) {
		if (profile.nickname.toLowerCase() === normalizedNickname) {
			return true;
		}
	}
	return false;
}

export async function listAllReferralProfiles(): Promise<ReferralProfile[]> {
	const kv = await getKv();
	if (kv) {
		const allWallets = (await kvGet<string[]>(KV_KEYS.allReferralProfiles())) || [];
		const profiles: ReferralProfile[] = [];
		for (const wallet of allWallets) {
			const profile = await getReferralProfile(wallet);
			if (profile) {
				profiles.push(profile);
			}
		}
		return profiles;
	}
	return Array.from(devStore.profiles.values());
}

// === Referred Wallet Management ===

/**
 * @deprecated No longer needed - the access code used to register IS the referral link.
 * Wallets are automatically linked to referrers via code_wallets in accessCodes system.
 * Kept for backwards compatibility but does nothing.
 */
export async function linkReferredWallet(
	_walletAddress: string,
	_referralCode: string
): Promise<{ success: boolean; error?: string }> {
	// No-op: referral linking now happens automatically via the access code system
	// When a wallet registers with code X, they appear in code_wallets:{X}
	// If someone has a ReferralProfile with that code, they get credit automatically
	return { success: true };
}

/**
 * Get wallet registration info - uses the single source of truth from accessCodes system.
 * Returns RegisteredWallet which contains the accessCode (= referralCode) used to register.
 */
export async function getReferredWallet(walletAddress: string): Promise<RegisteredWallet | null> {
	return await getWalletInfo(walletAddress);
}

export async function getWalletsReferredByCode(code: string): Promise<string[]> {
	const profile = await getReferralProfileByCode(code);
	if (!profile) return [];

	const kv = await getKv();
	if (kv) {
		// Use the single source of truth: code_wallets from accessCodes system
		// Try both the exact code format and uppercase (for legacy ST0X-XXXX-XXXX codes)
		const wallets =
			(await kvGet<string[]>(KV_KEYS.codeWallets(profile.referralCode.toUpperCase()))) || [];

		// Normalize to lowercase and deduplicate
		return [...new Set(wallets.map((w) => w.toLowerCase()))];
	}
	return devStore.codeWallets.get(profile.referralCode.toUpperCase()) || [];
}

// === Performance Calculation ===

export async function calculateReferralPerformance(
	referralCode: string,
	currentMonth?: string
): Promise<ReferralPerformance> {
	// Get wallets referred by this code
	const referredWallets = await getWalletsReferredByCode(referralCode);

	if (referredWallets.length === 0) {
		return {
			walletsReferred: 0,
			totalPoints: 0,
			projectedRewards: 0
		};
	}

	// Get current month if not provided
	const now = new Date();
	const month =
		currentMonth || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

	// Fetch monthly points data
	const monthlyData = await kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(month));
	const poolConfig = await kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(month));
	const excludedSet = await getExcludedWalletsSet();

	if (!monthlyData) {
		return {
			walletsReferred: referredWallets.length,
			totalPoints: 0,
			projectedRewards: 0
		};
	}

	// Calculate total points across all wallets
	let globalTotalPoints = 0;
	for (const [address, data] of Object.entries(monthlyData.wallets)) {
		if (!excludedSet.has(address.toLowerCase())) {
			globalTotalPoints += data.totalPoints;
		}
	}

	// Sum points from referred wallets
	// Note: referredWallets are lowercase, but monthlyData.wallets keys may be mixed case
	let referralTotalPoints = 0;
	for (const wallet of referredWallets) {
		const normalizedWallet = wallet.toLowerCase();
		// Try exact match first, then case-insensitive lookup
		const walletData =
			monthlyData.wallets[wallet] ||
			monthlyData.wallets[normalizedWallet] ||
			Object.entries(monthlyData.wallets).find(
				([addr]) => addr.toLowerCase() === normalizedWallet
			)?.[1];

		if (walletData && !excludedSet.has(normalizedWallet)) {
			referralTotalPoints += walletData.totalPoints;
		}
	}

	// Calculate effective pool (base + rocketboost achieved)
	const poolAmount = poolConfig?.poolAmount ?? 0;
	const rocketBoostAmounts = poolConfig?.rocketBoostAmounts ?? {
		tier25: 0,
		tier50: 0,
		tier75: 0,
		tier100: 0
	};
	const rocketBoostTvlTarget = poolConfig?.rocketBoostTvlTarget ?? 0;

	// Calculate rocketboost progress
	const daysInMonth = getDaysInMonth(month);
	const rocketBoostTargetPoints = rocketBoostTvlTarget * 2 * daysInMonth * 100;
	const progressPercent =
		rocketBoostTargetPoints > 0 ? (globalTotalPoints / rocketBoostTargetPoints) * 100 : 0;

	const rocketBoostAchievedAmount =
		(progressPercent >= 25 ? rocketBoostAmounts.tier25 : 0) +
		(progressPercent >= 50 ? rocketBoostAmounts.tier50 : 0) +
		(progressPercent >= 75 ? rocketBoostAmounts.tier75 : 0) +
		(progressPercent >= 100 ? rocketBoostAmounts.tier100 : 0);

	const effectivePool = poolAmount + rocketBoostAchievedAmount;

	// Calculate estimated rewards for referred wallets
	const referredRewards =
		globalTotalPoints > 0 ? (referralTotalPoints / globalTotalPoints) * effectivePool : 0;

	// Referrer gets 50% of referred wallets' rewards
	const projectedRewards = referredRewards * 0.5;

	return {
		walletsReferred: referredWallets.length,
		totalPoints: referralTotalPoints,
		projectedRewards
	};
}

// === Leaderboard ===

export async function buildReferralLeaderboard(
	currentMonth?: string
): Promise<ReferralLeaderboardEntry[]> {
	const profiles = await listAllReferralProfiles();

	if (profiles.length === 0) {
		return [];
	}

	const entries: ReferralLeaderboardEntry[] = [];

	for (const profile of profiles) {
		if (!profile.isActive) continue;

		const performance = await calculateReferralPerformance(profile.referralCode, currentMonth);

		entries.push({
			rank: 0, // Will be assigned after sorting
			nickname: profile.nickname,
			referralCode: profile.referralCode,
			walletsReferred: performance.walletsReferred,
			totalPoints: performance.totalPoints,
			projectedRewards: performance.projectedRewards
		});
	}

	// Sort by total points descending
	entries.sort((a, b) => b.totalPoints - a.totalPoints || a.nickname.localeCompare(b.nickname));

	// Assign ranks
	entries.forEach((entry, index) => {
		entry.rank = index + 1;
	});

	return entries;
}

export async function buildAdminReferralLeaderboard(
	currentMonth?: string
): Promise<AdminReferralLeaderboardEntry[]> {
	const profiles = await listAllReferralProfiles();

	if (profiles.length === 0) {
		return [];
	}

	const entries: AdminReferralLeaderboardEntry[] = [];

	for (const profile of profiles) {
		const performance = await calculateReferralPerformance(profile.referralCode, currentMonth);
		const referredWallets = await getWalletsReferredByCode(profile.referralCode);

		entries.push({
			rank: 0,
			nickname: profile.nickname,
			referralCode: profile.referralCode,
			walletsReferred: performance.walletsReferred,
			totalPoints: performance.totalPoints,
			projectedRewards: performance.projectedRewards,
			telegramHandle: profile.telegramHandle,
			walletAddress: profile.walletAddress,
			referredWallets,
			createdAt: profile.createdAt
		});
	}

	// Sort by total points descending
	entries.sort((a, b) => b.totalPoints - a.totalPoints || a.nickname.localeCompare(b.nickname));

	// Assign ranks
	entries.forEach((entry, index) => {
		entry.rank = index + 1;
	});

	return entries;
}

// === Profile Updates ===

export async function updateReferralNickname(
	walletAddress: string,
	newNickname: string
): Promise<{ success: boolean; profile?: ReferralProfile; error?: string }> {
	const normalizedWallet = walletAddress.toLowerCase();
	const normalizedNickname = newNickname.trim();

	// Validate nickname format
	if (!isValidNickname(normalizedNickname)) {
		return {
			success: false,
			error: 'Nickname must be 3-20 characters (letters, numbers, underscores)'
		};
	}

	// Get existing profile
	const profile = await getReferralProfile(normalizedWallet);
	if (!profile) {
		return { success: false, error: 'No referral profile found' };
	}

	// If nickname unchanged, return success
	if (profile.nickname.toLowerCase() === normalizedNickname.toLowerCase()) {
		return { success: true, profile };
	}

	// Check if new nickname is already taken by someone else
	const nicknameTaken = await isNicknameTaken(normalizedNickname);
	if (nicknameTaken) {
		return { success: false, error: 'This nickname is already taken' };
	}

	// Update the profile
	profile.nickname = normalizedNickname;

	const kv = await getKv();
	if (kv) {
		await kvSet(KV_KEYS.referralProfile(normalizedWallet), profile);
	} else {
		devStore.profiles.set(normalizedWallet, profile);
	}

	return { success: true, profile };
}

// === Admin Migration ===

/**
 * Create a referral profile for a user (admin migration).
 * The referralCode should match an existing access code - wallets registered with that
 * code are automatically attributed to this referrer via the shared code_wallets system.
 *
 * @param migrateFromAccessCode - @deprecated No longer used, kept for API compatibility
 */
export async function createReferralProfileForMigration(
	walletAddress: string,
	referralCode: string,
	nickname: string,
	telegramHandle: string,
	_migrateFromAccessCode?: string // Deprecated: no longer needed
): Promise<{ success: boolean; profile?: ReferralProfile; error?: string; migratedWallets?: number }> {
	const normalizedWallet = walletAddress.toLowerCase();
	const normalizedNickname = nickname.trim();
	const normalizedTelegram = telegramHandle.trim();
	// Preserve original code format (don't force lowercase for legacy codes)
	const normalizedCode = referralCode.trim();

	// Validate inputs (but NOT code format - allow legacy formats)
	if (!isValidNickname(normalizedNickname)) {
		return {
			success: false,
			error: 'Nickname must be 3-20 characters (letters, numbers, underscores)'
		};
	}

	if (!isValidTelegramHandle(normalizedTelegram)) {
		return { success: false, error: 'Invalid Telegram handle format (e.g., @username)' };
	}

	// Check if wallet already has a referral profile
	const existingProfile = await getReferralProfile(normalizedWallet);
	if (existingProfile) {
		return { success: false, error: 'Wallet already has a referral profile' };
	}

	// Check if referral code is already in use
	const existingCodeProfile = await getReferralProfileByCode(normalizedCode);
	if (existingCodeProfile) {
		return { success: false, error: 'Referral code is already in use' };
	}

	// Check if nickname is already taken
	const nicknameTaken = await isNicknameTaken(normalizedNickname);
	if (nicknameTaken) {
		return { success: false, error: 'This nickname is already taken' };
	}

	const profile: ReferralProfile = {
		walletAddress: normalizedWallet,
		referralCode: normalizedCode,
		nickname: normalizedNickname,
		telegramHandle: normalizedTelegram,
		createdAt: new Date().toISOString(),
		isActive: true
	};

	const kv = await getKv();

	if (kv) {
		await kvSet(KV_KEYS.referralProfile(normalizedWallet), profile);
		await kvSet(KV_KEYS.referralCodeToWallet(normalizedCode.toLowerCase()), normalizedWallet);

		// Add to list of all profiles
		const allProfiles = (await kvGet<string[]>(KV_KEYS.allReferralProfiles())) || [];
		if (!allProfiles.includes(normalizedWallet)) {
			allProfiles.push(normalizedWallet);
			await kvSet(KV_KEYS.allReferralProfiles(), allProfiles);
		}
	} else {
		devStore.profiles.set(normalizedWallet, profile);
		devStore.codeToWallet.set(normalizedCode.toLowerCase(), normalizedWallet);
	}

	// Count existing wallets for this code (from the single source of truth: code_wallets)
	// No migration needed - wallets are already tracked in the access code system
	const existingWallets = await kvGet<string[]>(KV_KEYS.codeWallets(normalizedCode.toUpperCase())) || [];
	const walletCount = existingWallets.filter(w => w.toLowerCase() !== normalizedWallet).length;

	return { success: true, profile, migratedWallets: walletCount };
}

// === Validation ===

export function isValidReferralCode(code: string): boolean {
	// Format: st0x-ref-xxxxxx (6 lowercase alphanumeric chars)
	const pattern = /^st0x-ref-[a-z0-9]{6}$/;
	return pattern.test(code.toLowerCase());
}

// Helper function
function getDaysInMonth(monthStr: string): number {
	const [year, month] = monthStr.split('-').map(Number);
	return new Date(year, month, 0).getDate();
}
