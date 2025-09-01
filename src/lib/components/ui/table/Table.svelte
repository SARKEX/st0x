<script lang="ts">
	export let className: string = '';
	export let responsive: boolean = true;
</script>

<div class={responsive ? "overflow-x-auto" : ""}>
	<table class={"w-full min-w-full " + className}>
		<slot />
	</table>
</div>

