<script lang="ts">
	export let className: string = '';
</script>

<table class={"w-full " + className}>
	<slot />
</table>

