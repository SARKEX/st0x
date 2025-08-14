<script lang="ts">
	export let className: string = '';
</script>

<div class={"bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-white/10 " + className}>
	<slot />
</div>