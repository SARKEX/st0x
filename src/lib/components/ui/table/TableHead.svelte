<script lang="ts">
	export let className: string = '';
	export let align: 'left' | 'center' | 'right' = 'left';
	
	const alignClass = {
		left: 'text-left',
		center: 'text-center',
		right: 'text-right'
	}[align];
</script>

<th class={"p-2 sm:p-3 text-xs font-medium uppercase tracking-wide text-gray-400 " + alignClass + " " + className}>
	<slot />
</th>

