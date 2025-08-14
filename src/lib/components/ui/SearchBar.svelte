<script lang="ts">
	export let value: string = '';
	export let placeholder: string = 'Search...';
	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		value = target.value;
	}
</script>

<input
	type="text"
	class="w-full rounded-xl border border-white/10 bg-black/30 p-4 text-lg outline-none placeholder-gray-400 focus:border-yellow-500/50 focus:ring-0"
	placeholder={placeholder}
	value={value}
	on:input={handleInput}
/>