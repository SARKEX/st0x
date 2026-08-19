<script lang="ts">
	// Number that eases up to its value (for "earned to date" / projected yield).
	// No-op on prefers-reduced-motion — shows the final value immediately.
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	export let value: number;
	export let prefix = '$';
	export let decimals = 2;
	export let live = false;
	export let className = '';

	let displayed = value;
	let raf: number | null = null;
	let liveTimer: ReturnType<typeof setInterval> | null = null;
	let reduceMotion = false;
	let started = false;

	function format(n: number): string {
		return (
			prefix +
			n.toLocaleString('en-US', {
				minimumFractionDigits: decimals,
				maximumFractionDigits: decimals
			})
		);
	}

	function animateTo(target: number): void {
		if (!browser || reduceMotion) {
			displayed = target;
			return;
		}
		if (raf) cancelAnimationFrame(raf);
		if (liveTimer) {
			clearInterval(liveTimer);
			liveTimer = null;
		}
		const start = performance.now();
		const duration = 900;
		const origin = displayed;
		const tick = (t: number) => {
			const k = Math.min(1, (t - start) / duration);
			const eased = 1 - Math.pow(1 - k, 3);
			displayed = origin + (target - origin) * eased;
			if (k < 1) {
				raf = requestAnimationFrame(tick);
			} else {
				raf = null;
				if (live && !reduceMotion) {
					liveTimer = setInterval(() => {
						displayed += target * 0.0000004;
					}, 80);
				}
			}
		};
		raf = requestAnimationFrame(tick);
	}

	onMount(() => {
		reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		displayed = 0;
		started = true;
		return () => {
			if (raf) cancelAnimationFrame(raf);
			if (liveTimer) clearInterval(liveTimer);
		};
	});

	// Re-animate whenever the target changes (and once on mount, after `started`).
	$: if (started) animateTo(value);
</script>

<span class={className}>{format(displayed)}</span>
