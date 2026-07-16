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
	class="bg-surface-3/50 w-full rounded-lg border border-line px-4 py-3 text-text transition-colors focus:border-accent-line focus:outline-none"
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
