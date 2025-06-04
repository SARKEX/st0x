<script lang="ts">
	import WalletConnect from '$lib/components/WalletConnect.svelte';


</script>

<div class="w-full bg-white shadow-md">
	<div
		class="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row sm:gap-0 sm:px-6 sm:py-4"
	>
		<div class="flex items-center gap-2">
			<img  alt="stox" class="h-8 w-8 sm:h-10 sm:w-10" />
			<span class="text-lg font-bold text-primary sm:text-xl"
				>stox<span class="text-black"> liquisity</span></span
			>
		</div>
		<div class="flex w-full items-center sm:w-auto">
			<WalletConnect />
		</div>
	</div>
</div>
<!-- Spacer -->
<div class="h-16 sm:h-20" />
