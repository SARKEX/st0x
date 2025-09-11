<script lang="ts">
	export let className: string = '';
</script>

<div
	class={'rounded-2xl border border-white/10 bg-gray-800/50 p-4 backdrop-blur-sm sm:p-6 ' +
		className}
>
	<slot />
</div>
