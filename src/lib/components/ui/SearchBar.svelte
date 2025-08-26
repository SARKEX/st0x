<script lang="ts">
	export let value: string = '';
	export let placeholder: string = 'Search...';
	export let minChars: number = 3;
	export let showMinCharsHint: boolean = true;
	
	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		value = target.value;
	}
	
	$: showHint = showMinCharsHint && value.length > 0 && value.length < minChars;
</script>

<div class="relative h-full">
	<input
		type="text"
		class="h-full w-full rounded-xl border border-white/10 bg-black/30 px-6 py-5 text-lg outline-none placeholder-gray-400 focus:border-yellow-500/50 focus:ring-0"
		placeholder={placeholder}
		{value}
		on:input={handleInput}
	/>
	{#if showHint}
		<div class="absolute left-0 right-0 top-full mt-1 text-sm text-gray-400">
			Type at least {minChars} characters to search
		</div>
	{/if}
</div>