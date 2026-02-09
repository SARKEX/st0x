// Store for referral programme data
import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { fetchJson } from '$lib/utils/fetchJson';

// Types
export interface ReferralProfile {
	referralCode: string;
	nickname: string;
	telegramHandle: string;
	createdAt: string;
	isActive: boolean;
}

export interface ReferralPerformance {
	walletsReferred: number;
	totalPoints: number;
	projectedRewards: number;
}

export interface ReferralLeaderboardEntry {
	rank: number;
	nickname: string;
	totalPoints: number;
	walletsReferred: number;
	projectedRewards: number;
}

// Profile and performance stores
export const referralProfile = writable<ReferralProfile | null>(null);
export const referralPerformance = writable<ReferralPerformance | null>(null);
export const referralLoading = writable(false);
export const referralError = writable<string | null>(null);

// Leaderboard stores
export const referralLeaderboard = writable<ReferralLeaderboardEntry[]>([]);
export const referralLeaderboardLoading = writable(false);
export const referralLeaderboardError = writable<string | null>(null);
export const referralUserPosition = writable<ReferralLeaderboardEntry | null>(null);
export const referralTotalParticipants = writable(0);

// Modal visibility stores
export const showReferralJoinModal = writable(false);
export const showReferralDashboardModal = writable(false);
export const showReferralLeaderboardModal = writable(false);

// Derived stores
export const hasReferralProfile = derived(referralProfile, ($profile) => $profile !== null);

type ReferralChallengeAction = 'join' | 'update_nickname';

async function requestReferralChallenge(
	address: string,
	action: ReferralChallengeAction,
	nickname?: string
): Promise<{ success: boolean; nonce?: string; message?: string; error?: string }> {
	if (!browser) return { success: false, error: 'Not in browser' };

	try {
		const response = await fetchJson<{
			success?: boolean;
			nonce?: string;
			message?: string;
			error?: string;
		}>('/api/referrals/challenge', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				address,
				action,
				nickname: nickname || undefined
			})
		});

		if (response.ok && response.data?.success && response.data.nonce && response.data.message) {
			return { success: true, nonce: response.data.nonce, message: response.data.message };
		}

		return { success: false, error: response.error || 'Failed to issue referral challenge' };
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : 'Network error' };
	}
}

export async function requestReferralJoinChallenge(
	address: string
): Promise<{ success: boolean; nonce?: string; message?: string; error?: string }> {
	return requestReferralChallenge(address, 'join');
}

export async function requestReferralNicknameUpdateChallenge(
	address: string,
	nickname: string
): Promise<{ success: boolean; nonce?: string; message?: string; error?: string }> {
	return requestReferralChallenge(address, 'update_nickname', nickname);
}

// Fetch referral profile and performance
export async function fetchReferralProfile(walletAddress: string): Promise<void> {
	if (!browser || !walletAddress) return;

	referralLoading.set(true);
	referralError.set(null);

	try {
		const response = await fetchJson<{
			success?: boolean;
			error?: string;
			hasProfile?: boolean;
			profile?: ReferralProfile;
			performance?: ReferralPerformance;
		}>(`/api/referrals/profile?wallet=${walletAddress}`);

		if (!response.ok || !response.data?.success) {
			throw new Error(response.error || 'Failed to fetch referral profile');
		}

		if (response.data.hasProfile) {
			referralProfile.set(response.data.profile || null);
			referralPerformance.set(response.data.performance || null);
		} else {
			referralProfile.set(null);
			referralPerformance.set(null);
		}
	} catch (err) {
		referralError.set(err instanceof Error ? err.message : 'Unknown error');
		referralProfile.set(null);
		referralPerformance.set(null);
	} finally {
		referralLoading.set(false);
	}
}

// Join referral programme
export async function joinReferralProgramme(
	address: string,
	telegramHandle: string,
	nickname: string,
	signature: string,
	challengeNonce: string
): Promise<{ success: boolean; referralCode?: string; error?: string }> {
	if (!browser) return { success: false, error: 'Not in browser' };

	try {
		const response = await fetchJson<{
			success?: boolean;
			referralCode?: string;
			error?: string;
		}>('/api/referrals/join', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				address,
				telegramHandle,
				nickname,
				signature,
				challengeNonce
			})
		});

		if (response.ok && response.data?.success) {
			// Refresh profile after joining
			await fetchReferralProfile(address);
			return { success: true, referralCode: response.data.referralCode };
		}

		return { success: false, error: response.error || 'Failed to join' };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Network error'
		};
	}
}

// Fetch public leaderboard
export async function fetchReferralLeaderboard(walletAddress?: string): Promise<void> {
	if (!browser) return;

	referralLeaderboardLoading.set(true);
	referralLeaderboardError.set(null);

	try {
		const url = walletAddress
			? `/api/referrals/leaderboard?wallet=${walletAddress}`
			: '/api/referrals/leaderboard';

		const response = await fetchJson<{
			success?: boolean;
			error?: string;
			leaderboard?: ReferralLeaderboardEntry[];
			totalParticipants?: number;
			userPosition?: ReferralLeaderboardEntry | null;
		}>(url);

		if (!response.ok || !response.data?.success) {
			throw new Error(response.error || 'Failed to fetch leaderboard');
		}

		referralLeaderboard.set(response.data.leaderboard || []);
		referralTotalParticipants.set(response.data.totalParticipants || 0);
		referralUserPosition.set(response.data.userPosition || null);
	} catch (err) {
		referralLeaderboardError.set(err instanceof Error ? err.message : 'Unknown error');
		referralLeaderboard.set([]);
	} finally {
		referralLeaderboardLoading.set(false);
	}
}

// Reset referral state (e.g., when wallet disconnects)
export function resetReferralState(): void {
	referralProfile.set(null);
	referralPerformance.set(null);
	referralLoading.set(false);
	referralError.set(null);
	referralUserPosition.set(null);
}

// Update referral nickname
export async function updateReferralNickname(
	walletAddress: string,
	newNickname: string,
	signature: string,
	challengeNonce: string
): Promise<{ success: boolean; error?: string }> {
	if (!browser) return { success: false, error: 'Not in browser' };

	try {
		const response = await fetchJson<{
			success?: boolean;
			error?: string;
		}>('/api/referrals/profile/update', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				walletAddress,
				nickname: newNickname,
				signature,
				challengeNonce
			})
		});

		if (response.ok && response.data?.success) {
			// Update the local profile store
			referralProfile.update((profile) => {
				if (profile) {
					return { ...profile, nickname: newNickname };
				}
				return profile;
			});
			return { success: true };
		}

		return { success: false, error: response.error || 'Failed to update nickname' };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Network error'
		};
	}
}

// Format referral code for display
export function formatReferralCode(code: string): string {
	return code.toLowerCase();
}

// Generate share URL
export function getShareUrl(referralCode: string): string {
	if (!browser) return '';
	const baseUrl = window.location.origin;
	return `${baseUrl}?ref=${referralCode}`;
}

// Copy to clipboard helper
export async function copyToClipboard(text: string): Promise<boolean> {
	if (!browser) return false;

	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		// Fallback for older browsers
		const textArea = document.createElement('textarea');
		textArea.value = text;
		textArea.style.position = 'fixed';
		textArea.style.left = '-9999px';
		document.body.appendChild(textArea);
		textArea.select();
		try {
			document.execCommand('copy');
			document.body.removeChild(textArea);
			return true;
		} catch {
			document.body.removeChild(textArea);
			return false;
		}
	}
}
