// Store for user rewards data (points, ranking, pool info)
import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export interface WalletRanking {
	address: string;
	points: number;
	rank: number;
}

export interface RocketBoostTiers {
	tier25: number;
	tier50: number;
	tier75: number;
	tier100: number;
}

export interface RocketBoostTiersAchieved {
	tier25: boolean;
	tier50: boolean;
	tier75: boolean;
	tier100: boolean;
}

export interface ProjectionData {
	daysElapsed: number;
	daysRemaining: number;
	avgDailyPoints: number;
	projectedTotalPoints: number;
	projectedProgress: number;
}

// User-specific rewards data (from /api/rewards/user)
export interface UserRewardsData {
	userPoints: number;
	estimatedReward: number;
	rank: number | null;
	averageValue: number; // userPoints / snapshotCount / 100 (in USD)
	approxApy: number | null; // annualized percentage, null if no holdings
}

// Global rewards data (from /api/rewards/global - CDN cached)
export interface GlobalRewardsData {
	currentMonth: string;
	totalPoints: number;
	totalWallets: number;
	snapshotCount: number;
	// Pool config
	poolAmount: number;
	effectivePool: number;
	poolApy: number | null;
	// RocketBoost
	rocketBoostAmounts: RocketBoostTiers;
	rocketBoostTvlTarget: number;
	rocketBoostTargetPoints: number;
	rocketBoostProgress: number;
	rocketBoostTiersAchieved: RocketBoostTiersAchieved;
	rocketBoostAchievedAmount: number;
	// Projection
	projection: ProjectionData;
}

// Core stores
export const rewardsData = writable<UserRewardsData | null>(null);
export const rewardsLoading = writable(false);
export const rewardsError = writable<string | null>(null);

// Global rewards data (CDN cached, same for all users)
export const globalRewardsData = writable<GlobalRewardsData | null>(null);
export const globalRewardsLoading = writable(false);

// Public leaderboard data (for non-connected users)
export interface PublicLeaderboardData {
	allRankings: WalletRanking[];
	totalWallets: number;
}
export const publicLeaderboardData = writable<PublicLeaderboardData | null>(null);
export const publicLeaderboardLoading = writable(false);
export const publicLeaderboardError = writable(false);

// Modal visibility stores
export const showDetailsModal = writable(false);
export const showLeaderboardModal = writable(false);
export const showRulesModal = writable(false);
export const showTokenSwapAnnouncementModal = writable(false);
export type RewardsModalTab = 'details' | 'rules';
export const rewardsModalTab = writable<RewardsModalTab>('details');

// Local storage key for token swap announcement
const TOKEN_SWAP_ANNOUNCEMENT_SEEN_KEY = 'st0x_token_swap_announcement_seen';

// Check if user has seen the token swap announcement
export function hasSeenTokenSwapAnnouncement(): boolean {
	if (!browser) return true;
	return localStorage.getItem(TOKEN_SWAP_ANNOUNCEMENT_SEEN_KEY) === 'true';
}

// Mark token swap announcement as seen
export function markTokenSwapAnnouncementSeen(): void {
	if (!browser) return;
	localStorage.setItem(TOKEN_SWAP_ANNOUNCEMENT_SEEN_KEY, 'true');
	showTokenSwapAnnouncementModal.set(false);
}

// Initialize token swap announcement modal on first visit
export function initTokenSwapAnnouncement(): void {
	if (!browser) return;
	if (!hasSeenTokenSwapAnnouncement()) {
		showTokenSwapAnnouncementModal.set(true);
	}
}

// Derived stores for convenience
export const hasRewardsData = derived(rewardsData, ($data) => $data !== null);
export const hasGlobalRewardsData = derived(globalRewardsData, ($data) => $data !== null);
export const userPoints = derived(rewardsData, ($data) => $data?.userPoints ?? 0);
export const estimatedReward = derived(rewardsData, ($data) => $data?.estimatedReward ?? 0);
export const userRank = derived(rewardsData, ($data) => $data?.rank);
export const approxApy = derived(rewardsData, ($data) => $data?.approxApy ?? null);
// Global data derived stores
export const globalPoolApy = derived(globalRewardsData, ($data) => $data?.poolApy ?? null);
export const totalWallets = derived(globalRewardsData, ($data) => $data?.totalWallets ?? 0);
export const rocketBoostProgress = derived(
	globalRewardsData,
	($data) => $data?.rocketBoostProgress ?? 0
);

// Fetch user rewards data (user-specific only)
export async function fetchUserRewards(walletAddress: string): Promise<void> {
	if (!browser || !walletAddress) return;

	rewardsLoading.set(true);
	rewardsError.set(null);

	try {
		const response = await fetch(`/api/rewards/user?wallet=${walletAddress}`);
		const data = await response.json();

		if (!response.ok || !data.success) {
			throw new Error(data.error || 'Failed to fetch rewards data');
		}

		rewardsData.set({
			userPoints: data.userPoints,
			estimatedReward: data.estimatedReward,
			rank: data.rank,
			averageValue: data.averageValue,
			approxApy: data.approxApy
		});
	} catch (err) {
		rewardsError.set(err instanceof Error ? err.message : 'Unknown error');
		rewardsData.set(null);
	} finally {
		rewardsLoading.set(false);
	}
}

// Fetch global rewards data (CDN cached, can be called without wallet connection)
export async function fetchGlobalRewards(): Promise<void> {
	if (!browser) return;

	globalRewardsLoading.set(true);

	try {
		const response = await fetch('/api/rewards/global');
		const data = await response.json();

		if (response.ok && data.success) {
			globalRewardsData.set({
				currentMonth: data.currentMonth,
				totalPoints: data.totalPoints,
				totalWallets: data.totalWallets,
				snapshotCount: data.snapshotCount,
				poolAmount: data.poolAmount,
				effectivePool: data.effectivePool,
				poolApy: data.poolApy,
				rocketBoostAmounts: data.rocketBoostAmounts,
				rocketBoostTvlTarget: data.rocketBoostTvlTarget,
				rocketBoostTargetPoints: data.rocketBoostTargetPoints,
				rocketBoostProgress: data.rocketBoostProgress,
				rocketBoostTiersAchieved: data.rocketBoostTiersAchieved,
				rocketBoostAchievedAmount: data.rocketBoostAchievedAmount,
				projection: data.projection
			});
		}
	} catch {
		// Silently fail - global data is not critical for individual user experience
	} finally {
		globalRewardsLoading.set(false);
	}
}

// Fetch public leaderboard (can be called without wallet connection)
export async function fetchPublicLeaderboard(): Promise<void> {
	if (!browser) return;

	publicLeaderboardLoading.set(true);
	publicLeaderboardError.set(false);

	try {
		const response = await fetch('/api/rewards/leaderboard');
		const data = await response.json();

		if (response.ok && data.success) {
			publicLeaderboardData.set({
				allRankings: data.leaderboard,
				totalWallets: data.totalWallets
			});
		} else {
			// Mark as error to prevent infinite retry loop
			publicLeaderboardError.set(true);
		}
	} catch {
		// Mark as error to prevent infinite retry loop
		publicLeaderboardError.set(true);
	} finally {
		publicLeaderboardLoading.set(false);
	}
}

// Reset rewards state
export function resetRewardsState(): void {
	rewardsData.set(null);
	rewardsLoading.set(false);
	rewardsError.set(null);
}

// Re-export formatting utilities for backwards compatibility
export {
	formatUsd,
	formatPoints,
	formatApy,
	truncateAddress as formatAddress
} from '$lib/utils/format';
