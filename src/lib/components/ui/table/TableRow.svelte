<script lang="ts">
	export let className: string = '';
	export let isHeader: boolean = false;
	
	const baseClass = isHeader 
		? 'border-b border-white/10' 
		: 'border-b border-white/5 hover:bg-white/5 transition-colors';
</script>

<tr class={className || baseClass}>
	<slot />
</tr>

