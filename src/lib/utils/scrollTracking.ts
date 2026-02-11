import { browser } from '$app/environment';
import { track } from '$lib/services/analytics';

let activeCleanup: (() => void) | null = null;

/**
 * Initialize scroll tracking for a page
 * Call this on page mount, returns a cleanup function for unmount
 */
export function initScrollTracking(pageName: string): () => void {
	if (!browser) return () => {};

	// Clean up any existing tracking
	if (activeCleanup) {
		activeCleanup();
	}

	// Per-session state captured in closure to avoid race conditions
	let maxScrollDepth = 0;
	let scrollCount = 0;
	const startTime = Date.now();
	let reachedBottom = false;
	let cleaned = false;

	// Throttle scroll handler for performance
	let ticking = false;

	const handleScroll = () => {
		if (ticking) return;

		ticking = true;
		requestAnimationFrame(() => {
			if (cleaned) {
				ticking = false;
				return;
			}
			const scrollTop = window.scrollY;
			const docHeight = document.documentElement.scrollHeight - window.innerHeight;

			// Avoid division by zero
			if (docHeight <= 0) {
				ticking = false;
				return;
			}

			// Only count valid scroll events (after docHeight validation)
			scrollCount++;

			const depth = Math.round((scrollTop / docHeight) * 100);

			if (depth > maxScrollDepth) {
				maxScrollDepth = depth;
			}

			// Track when user reaches bottom (95%+)
			if (depth >= 95 && !reachedBottom) {
				reachedBottom = true;
				track('page_scrolled_to_bottom', {
					page: pageName,
					time_to_bottom_ms: Date.now() - startTime
				});
			}

			ticking = false;
		});
	};

	window.addEventListener('scroll', handleScroll, { passive: true });

	// Cleanup function
	const cleanup = () => {
		if (cleaned) return;
		cleaned = true;

		window.removeEventListener('scroll', handleScroll);

		// Track final scroll depth on page leave
		if (scrollCount > 0) {
			track('page_scroll_depth', {
				page: pageName,
				max_depth_percent: maxScrollDepth,
				total_scrolls: scrollCount,
				time_on_page_ms: Date.now() - startTime
			});
		}

		if (activeCleanup === cleanup) {
			activeCleanup = null;
		}
	};

	activeCleanup = cleanup;
	return cleanup;
}
