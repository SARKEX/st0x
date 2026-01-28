// Store for referral programme data
import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

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

// Fetch referral profile and performance
export async function fetchReferralProfile(walletAddress: string): Promise<void> {
	if (!browser || !walletAddress) return;

	referralLoading.set(true);
	referralError.set(null);

	try {
		const response = await fetch(`/api/referrals/profile?wallet=${walletAddress}`);
		const data = await response.json();

		if (!response.ok || !data.success) {
			throw new Error(data.error || 'Failed to fetch referral profile');
		}

		if (data.hasProfile) {
			referralProfile.set(data.profile);
			referralPerformance.set(data.performance);
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
	message: string
): Promise<{ success: boolean; referralCode?: string; error?: string }> {
	if (!browser) return { success: false, error: 'Not in browser' };

	try {
		const response = await fetch('/api/referrals/join', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				address,
				telegramHandle,
				nickname,
				signature,
				message
			})
		});

		const data = await response.json();

		if (data.success) {
			// Refresh profile after joining
			await fetchReferralProfile(address);
			return { success: true, referralCode: data.referralCode };
		}

		return { success: false, error: data.error || 'Failed to join' };
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

		const response = await fetch(url);
		const data = await response.json();

		if (!response.ok || !data.success) {
			throw new Error(data.error || 'Failed to fetch leaderboard');
		}

		referralLeaderboard.set(data.leaderboard);
		referralTotalParticipants.set(data.totalParticipants);
		referralUserPosition.set(data.userPosition || null);
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
	message: string
): Promise<{ success: boolean; error?: string }> {
	if (!browser) return { success: false, error: 'Not in browser' };

	try {
		const response = await fetch('/api/referrals/profile/update', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				walletAddress,
				nickname: newNickname,
				signature,
				message
			})
		});

		const data = await response.json();

		if (data.success) {
			// Update the local profile store
			referralProfile.update((profile) => {
				if (profile) {
					return { ...profile, nickname: newNickname };
				}
				return profile;
			});
			return { success: true };
		}

		return { success: false, error: data.error || 'Failed to update nickname' };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Network error'
		};
	}
}

// Create message for signing nickname update
export function createNicknameUpdateSignMessage(address: string, newNickname: string): string {
	return `Sign to update your st0x referral nickname.

Wallet: ${address}
New Nickname: ${newNickname}
Timestamp: ${Date.now()}`;
}

// Create the message for signing to join the programme
export function createReferralSignMessage(address: string): string {
	return `Sign to join the st0x referral programme.

Wallet: ${address}
Timestamp: ${Date.now()}`;
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
