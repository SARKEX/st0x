<script lang="ts" generics="T">
	// eslint-disable-next-line
	export let options: T[];
	// eslint-disable-next-line
	export let selected: T;
	// eslint-disable-next-line
	export let getOptionLabel: (option: T) => string;

	export let dataTestId: string = '';
</script>

<select
	class="rounded border border-gray-300 bg-transparent px-2 py-1"
	bind:value={selected}
	data-testid={dataTestId}
>
	{#each options as option}
		<option value={option}>
			{getOptionLabel(option)}
		</option>
	{/each}
</select>
