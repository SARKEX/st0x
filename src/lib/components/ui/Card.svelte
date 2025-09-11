<script lang="ts">
	export let className: string = '';
	export let paddingClass: string = 'p-3 sm:p-4 lg:p-5';
	export let showGradient: boolean = true;
</script>

<div
	class={'group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 transition-all hover:border-yellow-500/30 ' +
		className +
		' ' +
		paddingClass}
>
	{#if showGradient}
		<div
			class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
		/>
	{/if}
	<slot />
</div>
