<script lang="ts">
	export let header: boolean = false;
	export let className: string = '';
</script>

{#if header}
	<th class={className}>
		<slot />
	</th>
{:else}
	<td class={className}>
		<slot />
	</td>
{/if}

