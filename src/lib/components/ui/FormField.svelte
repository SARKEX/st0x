<script lang="ts">
	export let id: string;
	export let label: string;
	export let hint: string = '';
	export let required: boolean = false;
	export let className: string = '';
</script>

<div class={"w-full " + className}>
	<label for={id} class="mb-2 block text-sm font-medium text-gray-300">
		{label} {#if required}<span class="text-red-500">*</span>{/if}
	</label>
	<slot />
	{#if hint}
		<p class="mt-1 text-xs text-gray-500">{hint}</p>
	{/if}
</div>

