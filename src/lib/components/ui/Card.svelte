<script lang="ts">
	export let className: string = '';
	export let paddingClass: string = 'p-5';
	export let showGradient: boolean = false;
	// Top-hairline visibility: 'hover' (default, fades in on hover), 'static'
	// (always shown), or 'none'. Only applies when showGradient is true.
	export let hairline: 'hover' | 'static' | 'none' = 'hover';
</script>

<div
	class={'group relative overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-[var(--shadow-2)] ' +
		paddingClass +
		(className ? ' ' + className : '')}
>
	{#if showGradient && hairline !== 'none'}
		<div
			class={'absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-accent-bright via-accent to-accent-deep transition-opacity ' +
				(hairline === 'static' ? 'opacity-60' : 'opacity-0 group-hover:opacity-100')}
		></div>
	{/if}
	<slot />
</div>
