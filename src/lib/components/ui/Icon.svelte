<script lang="ts" context="module">
	// Canonical app-wide line-icon set, ported verbatim from the v2 design handoff
	// (`src2/atoms.jsx` → Icon). viewBox 0 0 24 24, currentColor, round caps. Use
	// this everywhere instead of mixed icon libraries so glyphs match the mock.
	export type IconName =
		| 'unlock'
		| 'bank'
		| 'bolt'
		| 'shield'
		| 'sprout'
		| 'check'
		| 'close'
		| 'info'
		| 'plus'
		| 'minus'
		| 'clock'
		| 'arrowRight'
		| 'arrowUpRight'
		| 'arrowDown'
		| 'chevronDown'
		| 'trendUp'
		| 'wallet'
		| 'blocks'
		| 'coins'
		| 'chart'
		| 'lock'
		| 'home';
</script>

<script lang="ts">
	export let name: IconName;
	export let className = 'h-5 w-5';
	export let stroke = 1.6;
</script>

<svg
	viewBox="0 0 24 24"
	class="icon-{name} {className}"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'shield'}
		<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
	{:else if name === 'home'}
		<path d="M4 11.5L12 4l8 7.5" />
		<path d="M6 10v9.5h12V10" />
	{:else if name === 'unlock'}
		<rect x="4.5" y="11" width="15" height="9" rx="1.5" />
		<path d="M8 11V8a4 4 0 017.4-2" />
	{:else if name === 'bolt'}
		<path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" />
	{:else if name === 'blocks'}
		<rect x="3.5" y="3.5" width="7" height="7" rx="1" />
		<rect x="13.5" y="3.5" width="7" height="7" rx="1" />
		<rect x="3.5" y="13.5" width="7" height="7" rx="1" />
		<rect x="13.5" y="13.5" width="7" height="7" rx="1" />
	{:else if name === 'bank'}
		<path d="M3 9l9-5 9 5" />
		<path d="M5 9v8M19 9v8M9 9v8M15 9v8" />
		<path d="M3 20h18" />
	{:else if name === 'sprout'}
		<path d="M12 20v-8" />
		<path d="M12 12c0-3 2.5-5 6-5 0 3-2.5 5-6 5z" />
		<path d="M12 13c0-2.5-2-4.5-5-4.5 0 2.5 2 4.5 5 4.5z" />
	{:else if name === 'check'}
		<path d="M5 13l4 4L19 7" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M6 18L18 6" />
	{:else if name === 'info'}
		<circle cx="12" cy="12" r="9" />
		<path d="M12 11v5M12 8h.01" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'minus'}
		<path d="M5 12h14" />
	{:else if name === 'coins'}
		<ellipse cx="9" cy="7" rx="5.5" ry="2.5" />
		<path d="M3.5 7v5c0 1.4 2.5 2.5 5.5 2.5" />
		<path d="M3.5 12v3c0 1.4 2.5 2.5 5.5 2.5" />
		<ellipse cx="15" cy="14" rx="5.5" ry="2.5" />
		<path d="M9.5 14.5v5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-5" />
	{:else if name === 'chart'}
		<path d="M4 4v16h16" />
		<path d="M7 14l3-3 3 2 5-6" />
	{:else if name === 'lock'}
		<rect x="4.5" y="11" width="15" height="9" rx="1.5" />
		<path d="M8 11V8a4 4 0 018 0v3" />
	{:else if name === 'clock'}
		<circle cx="12" cy="12" r="9" />
		<path d="M12 7v5l3 2" />
	{:else if name === 'wallet'}
		<rect x="3" y="6" width="18" height="13" rx="2" />
		<path d="M3 10h18M16 14h2" />
	{:else if name === 'arrowRight'}
		<path d="M5 12h14M13 6l6 6-6 6" />
	{:else if name === 'arrowUpRight'}
		<path d="M7 17L17 7M9 7h8v8" />
	{:else if name === 'arrowDown'}
		<path d="M12 5v14M6 13l6 6 6-6" />
	{:else if name === 'chevronDown'}
		<path d="M6 9l6 6 6-6" />
	{:else if name === 'trendUp'}
		<path d="M3 17l6-6 4 4 8-8M21 7h-5m5 0v5" />
	{/if}
</svg>
