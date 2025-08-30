<script lang="ts">
	export let className: string = '';
</script>

<div class={"prose prose-invert mx-auto w-full max-w-full rounded-2xl border border-white/10 bg-gray-800/70 p-4 shadow-xl backdrop-blur-md md:p-6 xl:p-8 " + className}>
	<slot />
</div>

