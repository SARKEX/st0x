<script lang="ts">
	export let className: string = '';
	const baseClass = 'border-b border-white/5 hover:bg-white/5 transition-colors';
</script>

<tr class={(className && className.length > 0) ? className : baseClass}>
	<slot />
</tr>

