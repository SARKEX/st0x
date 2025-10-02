<script lang="ts" generics="T">
	// eslint-disable-next-line
	export let options: T[];
	// eslint-disable-next-line
	export let selected: T;
	// eslint-disable-next-line
	export let getOptionLabel: (option: T) => string;

	export let dataTestId: string = '';
	export let id: string | undefined = undefined;
	export let ariaLabelledby: string | undefined = undefined;
</script>

<select
	class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white transition-colors focus:border-yellow-500/50 focus:outline-none"
	bind:value={selected}
	{id}
	aria-labelledby={ariaLabelledby}
	data-testid={dataTestId}
>
	{#each options as option}
		<option value={option}>
			{getOptionLabel(option)}
		</option>
	{/each}
</select>
