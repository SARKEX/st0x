<script lang="ts">
	export let className: string = '';
	export let paddingClass: string = 'p-3 sm:p-4 lg:p-5';
	export let showGradient: boolean = true;
</script>

<div class={"bg-gray-700/30 rounded-xl border border-white/5 relative overflow-hidden group hover:border-yellow-500/30 transition-all " + className + " " + paddingClass}>
	{#if showGradient}
		<div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity" />
	{/if}
	<slot />
</div>