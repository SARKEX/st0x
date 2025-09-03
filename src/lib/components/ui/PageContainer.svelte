<script lang="ts">
	export let className: string = '';
</script>

<div class={'space-y-6 p-3 sm:space-y-8 sm:p-6 ' + className}>
	<slot />
</div>
