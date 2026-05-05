/**
 * One-time announcement state (e.g., the token-swap migration announcement).
 * Extracted from rewardsStore.ts in Phase 1 (DEPR-01 / D-16) — token-swap
 * announcements are NOT rewards UI; they're a generic announcement primitive.
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Modal visibility store
export const showTokenSwapAnnouncementModal = writable(false);

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
