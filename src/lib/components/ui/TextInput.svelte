<script lang="ts">
	export let id: string;
	export let value: string = '';
	export let placeholder: string = '';
	export let type: 'text' | 'number' | 'search' = 'text';
	export let className: string = '';
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher<{ input: { value: string } }>();

	function onInput(event: Event) {
		const target = event.target as HTMLInputElement;
		value = target.value;
		dispatch('input', { value });
	}
</script>

<input
	id={id}
	class={"w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white transition-colors focus:border-yellow-500/50 focus:outline-none " + className}
	{type}
	{placeholder}
	value={value}
	on:input={onInput}
/>

