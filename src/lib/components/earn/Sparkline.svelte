<script lang="ts" context="module">
	// Per-instance gradient id without Math.random (keeps SSR/client markup
	// identical and avoids id collisions between multiple sparklines).
	let sparkUid = 0;
</script>

<script lang="ts">
	// Monotonic sparkline for SGOV NAV accretion.
	export let data: number[] = [];
	export let w = 120;
	export let h = 36;
	export let color = '#34d399';
	export let fill = true;

	const gradientId = `spark-${(sparkUid += 1)}`;

	$: geometry = (() => {
		if (data.length < 2) return { line: '', area: '' };
		const min = Math.min(...data);
		const max = Math.max(...data);
		const sx = w / (data.length - 1);
		const sy = (h - 4) / (max - min || 1);
		const line = data
			.map((v, i) => {
				const x = (i * sx).toFixed(1);
				const y = (h - 2 - (v - min) * sy).toFixed(1);
				return `${i ? 'L' : 'M'}${x},${y}`;
			})
			.join(' ');
		return { line, area: `${line} L${w},${h} L0,${h} Z` };
	})();
</script>

<svg
	viewBox="0 0 {w} {h}"
	class="overflow-visible"
	style="width:{w}px;height:{h}px;"
	aria-hidden="true"
>
	<defs>
		<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color={color} stop-opacity="0.35" />
			<stop offset="100%" stop-color={color} stop-opacity="0" />
		</linearGradient>
	</defs>
	{#if fill && geometry.area}
		<path d={geometry.area} fill="url(#{gradientId})" />
	{/if}
	<path
		d={geometry.line}
		fill="none"
		stroke={color}
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>
