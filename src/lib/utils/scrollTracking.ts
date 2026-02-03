import { browser } from '$app/environment';
import { track } from '$lib/services/analytics';

interface ScrollTrackingState {
	pageName: string;
	maxScrollDepth: number;
	scrollCount: number;
	startTime: number;
	reachedBottom: boolean;
	cleanup: (() => void) | null;
}

const state: ScrollTrackingState = {
	pageName: '',
	maxScrollDepth: 0,
	scrollCount: 0,
	startTime: 0,
	reachedBottom: false,
	cleanup: null
};

/**
 * Initialize scroll tracking for a page
 * Call this on page mount, returns a cleanup function for unmount
 */
export function initScrollTracking(pageName: string): () => void {
	if (!browser) return () => {};

	// Clean up any existing tracking
	if (state.cleanup) {
		state.cleanup();
	}

	// Reset state
	state.pageName = pageName;
	state.maxScrollDepth = 0;
	state.scrollCount = 0;
	state.startTime = Date.now();
	state.reachedBottom = false;

	// Throttle scroll handler for performance
	let ticking = false;

	const handleScroll = () => {
		if (ticking) return;

		ticking = true;
		requestAnimationFrame(() => {
			state.scrollCount++;

			const scrollTop = window.scrollY;
			const docHeight = document.documentElement.scrollHeight - window.innerHeight;

			// Avoid division by zero
			if (docHeight <= 0) {
				ticking = false;
				return;
			}

			const depth = Math.round((scrollTop / docHeight) * 100);

			if (depth > state.maxScrollDepth) {
				state.maxScrollDepth = depth;
			}

			// Track when user reaches bottom (95%+)
			if (depth >= 95 && !state.reachedBottom) {
				state.reachedBottom = true;
				track('page_scrolled_to_bottom', {
					page: state.pageName,
					time_to_bottom_ms: Date.now() - state.startTime
				});
			}

			ticking = false;
		});
	};

	window.addEventListener('scroll', handleScroll, { passive: true });

	// Cleanup function
	const cleanup = () => {
		window.removeEventListener('scroll', handleScroll);

		// Track final scroll depth on page leave
		if (state.scrollCount > 0) {
			track('page_scroll_depth', {
				page: state.pageName,
				max_depth_percent: state.maxScrollDepth,
				total_scrolls: state.scrollCount,
				time_on_page_ms: Date.now() - state.startTime
			});
		}

		state.cleanup = null;
	};

	state.cleanup = cleanup;
	return cleanup;
}

/**
 * Get current scroll tracking state (useful for debugging)
 */
export function getScrollTrackingState(): Readonly<Omit<ScrollTrackingState, 'cleanup'>> {
	return {
		pageName: state.pageName,
		maxScrollDepth: state.maxScrollDepth,
		scrollCount: state.scrollCount,
		startTime: state.startTime,
		reachedBottom: state.reachedBottom
	};
}
