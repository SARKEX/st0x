<script lang="ts" context="module">
	// Deterministic brand-ish gradient discs for asset rows, ported from the v2
	// handoff (`src2/atoms.jsx` → AssetDisc). USDC gets blue + "$". Everything else
	// derives a two-stop gradient from a per-ticker table (falling back to neutral).
	const ASSET_COLORS: Record<string, [string, string]> = {
		tNVDA: ['#9aa6ff', '#4d3bd8'],
		tTSLA: ['#ff8d8d', '#d83b3b'],
		tCOIN: ['#6fa8ff', '#1a56db'],
		tMSTR: ['#ffb877', '#f08a1d'],
		tAAPL: ['#cfd6df', '#8a94a3'],
		tMETA: ['#6fb3ff', '#2b6fe0'],
		tSPYM: ['#ff9d6f', '#e0512b'],
		tQQQM: ['#7fd1ff', '#1d8fe0'],
		tSIVR: ['#cdd6e0', '#8a98a8'],
		tCRCL: ['#7fffd6', '#10b981'],
		tAMZN: ['#ffcf6f', '#e0a020'],
		tIAU: ['#ffe08a', '#e0b820'],
		tARKK: ['#b89dff', '#6d3bd8'],
		tPPLT: ['#cdd6e0', '#7a8898'],
		tVWO: ['#7fc1ff', '#2b7fe0'],
		tBMNR: ['#ff9d8a', '#e0512b'],
		USDC: ['#4aa0f5', '#2775CA']
	};
</script>

<script lang="ts">
	/** Token symbol, with or without a `w`/`t` prefix (e.g. `wtNVDA`, `tNVDA`, `USDC`). */
	export let sym: string;
	export let size = 32;
	export let ring = false;

	$: normalized = sym.replace(/^w/, '');
	$: isUsdc = sym === 'USDC';
	$: colors = ASSET_COLORS[normalized] ?? ['#9aa9bb', '#5c6a7c'];
	$: letters = isUsdc ? '$' : normalized.replace(/^t/, '').slice(0, 2).toUpperCase();
	$: boxShadow = ring ? '0 0 0 3px rgba(45,227,166,.18)' : 'inset 0 1px 0 rgba(255,255,255,.25)';
</script>

<div
	class="relative flex shrink-0 items-center justify-center rounded-full font-bold text-white"
	style="width:{size}px;height:{size}px;font-size:{size *
		0.36}px;background:radial-gradient(circle at 30% 25%, {colors[0]}, {colors[1]});box-shadow:{boxShadow};"
>
	{letters}
</div>
