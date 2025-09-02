<script lang="ts">
	export let header: boolean = false;
	export let className: string = '';
	export let align: 'left' | 'center' | 'right' = 'left';
	
	let customClass: string = '';
	export { customClass as class };
	
	const alignClass = {
		left: 'text-left',
		center: 'text-center',
		right: 'text-right'
	}[align];
</script>

{#if header}
	<th class={"p-2 sm:p-3 text-xs sm:text-sm " + alignClass + " " + className + (customClass ? ' ' + customClass : '')}>
		<slot />
	</th>
{:else}
	<td class={"p-2 sm:p-3 text-xs sm:text-sm " + alignClass + " " + className + (customClass ? ' ' + customClass : '')}>
		<slot />
	</td>
{/if}
