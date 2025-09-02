<script lang="ts">
	export let className: string = '';
	export let responsive: boolean = true;
	
	// Accept plain class too for convenience
	let customClass: string = '';
	export { customClass as class };
</script>

<div class={responsive ? "overflow-x-auto" : ""}>
	<table class={"w-full min-w-full " + className + (customClass ? ' ' + customClass : '')}>
		<slot />
	</table>
</div>
