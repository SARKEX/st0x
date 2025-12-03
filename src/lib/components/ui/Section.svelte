<script lang="ts">
	export let className: string = '';
</script>

<div class={'p-4 sm:p-6 ' + className}>
	<slot />
</div>
