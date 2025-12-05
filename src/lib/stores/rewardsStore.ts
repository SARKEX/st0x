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

export interface LastMonthData {
	month: string;
	userPoints: number;
	totalPoints: number;
	reward: number;
	poolAmount: number;
	rocketBoostAchievedAmount: number;
}

export interface ProjectionData {
	daysElapsed: number;
	daysRemaining: number;
	avgDailyPoints: number;
	projectedTotalPoints: number;
	projectedProgress: number;
}

export interface UserRewardsData {
	currentMonth: string;
	userPoints: number;
	totalPoints: number;
	estimatedReward: number;
	rank: number | null;
	totalWallets: number;
	// APY calculation fields
	snapshotCount: number;
	averageValue: number; // userPoints / snapshotCount / 100 (in USD)
	approxApy: number | null; // annualized percentage, null if no holdings
	// Pool config
	poolAmount: number;
	rocketBoostAmounts: RocketBoostTiers;
	rocketBoostTvlTarget: number;
	rocketBoostTargetPoints: number; // rocketBoostTvlTarget * 2 * daysInMonth * 100
	rocketBoostTiersAchieved: RocketBoostTiersAchieved;
	rocketBoostAchievedAmount: number;
	effectivePool: number;
	projection: ProjectionData;
	lastMonth: LastMonthData | null;
	leaderboard: {
		top3: WalletRanking[];
		aroundUser: WalletRanking[];
		allRankings: WalletRanking[];
	};
}

// Core stores
export const rewardsData = writable<UserRewardsData | null>(null);
export const rewardsLoading = writable(false);
export const rewardsError = writable<string | null>(null);

// Global pool APY (same for all users, fetched once)
export const globalPoolApy = writable<number | null>(null);
export const globalPoolApyLoading = writable(false);

// Modal visibility stores
export const showDetailsModal = writable(false);
export const showLeaderboardModal = writable(false);
export const showRulesModal = writable(false);
export type RewardsModalTab = 'details' | 'rules';
export const rewardsModalTab = writable<RewardsModalTab>('details');

// Derived stores for convenience
export const hasRewardsData = derived(rewardsData, ($data) => $data !== null);
export const userPoints = derived(rewardsData, ($data) => $data?.userPoints ?? 0);
export const estimatedReward = derived(rewardsData, ($data) => $data?.estimatedReward ?? 0);
export const userRank = derived(rewardsData, ($data) => $data?.rank);
export const approxApy = derived(rewardsData, ($data) => $data?.approxApy ?? null);

// Fetch user rewards data
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
			currentMonth: data.currentMonth,
			userPoints: data.userPoints,
			totalPoints: data.totalPoints,
			estimatedReward: data.estimatedReward,
			rank: data.rank,
			totalWallets: data.totalWallets,
			snapshotCount: data.snapshotCount,
			averageValue: data.averageValue,
			approxApy: data.approxApy,
			poolAmount: data.poolAmount,
			rocketBoostAmounts: data.rocketBoostAmounts,
			rocketBoostTvlTarget: data.rocketBoostTvlTarget,
			rocketBoostTargetPoints: data.rocketBoostTargetPoints,
			rocketBoostTiersAchieved: data.rocketBoostTiersAchieved,
			rocketBoostAchievedAmount: data.rocketBoostAchievedAmount,
			effectivePool: data.effectivePool,
			projection: data.projection,
			lastMonth: data.lastMonth,
			leaderboard: data.leaderboard
		});
	} catch (err) {
		rewardsError.set(err instanceof Error ? err.message : 'Unknown error');
		rewardsData.set(null);
	} finally {
		rewardsLoading.set(false);
	}
}

// Fetch global pool APY (can be called without wallet connection)
export async function fetchGlobalPoolApy(): Promise<void> {
	if (!browser) return;

	globalPoolApyLoading.set(true);

	try {
		const response = await fetch('/api/rewards/pool-apy');
		const data = await response.json();

		if (response.ok && data.success) {
			globalPoolApy.set(data.poolApy);
		}
	} catch {
		// Silently fail - APY is not critical
	} finally {
		globalPoolApyLoading.set(false);
	}
}

// Reset rewards state
export function resetRewardsState(): void {
	rewardsData.set(null);
	rewardsLoading.set(false);
	rewardsError.set(null);
}

// Format currency
export function formatUsd(amount: number): string {
	if (amount >= 1000) {
		return '$' + (amount / 1000).toFixed(1) + 'K';
	}
	return '$' + amount.toFixed(2);
}

// Format points
export function formatPoints(points: number): string {
	if (points >= 1_000_000) {
		return (points / 1_000_000).toFixed(1) + 'M';
	}
	if (points >= 1_000) {
		return (points / 1_000).toFixed(1) + 'K';
	}
	return Math.round(points).toLocaleString();
}

// Format address for display
export function formatAddress(address: string): string {
	return address.slice(0, 6) + '...' + address.slice(-4);
}

// Format APY percentage
export function formatApy(apy: number | null): string {
	if (apy === null || apy === 0) return '-';
	if (apy >= 1000) {
		return (apy / 1000).toFixed(1) + 'K%';
	}
	if (apy >= 100) {
		return Math.round(apy) + '%';
	}
	return apy.toFixed(1) + '%';
}
