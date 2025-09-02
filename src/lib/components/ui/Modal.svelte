<script lang="ts">
	export let show: boolean = false;
	export let title: string = '';
	export let onClose: () => void;
</script>

{#if show}
	<button
		type="button"
		class="fixed inset-0 z-[99] h-full w-full bg-transparent"
		on:click={onClose}
		aria-label="Close modal overlay"
	/>
	<div
		class="fixed left-1/2 top-1/2 z-[100] mx-2 w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-4 text-left shadow-xl transition-all duration-200 ease-in-out"
		role="dialog"
		aria-modal="true"
		aria-label="Modal"
	>
		<div
			class="relative max-h-[80vh] w-full overflow-y-auto rounded-lg bg-gray-900 p-6 shadow-lg"
			role="document"
		>
			<div class="mb-4 flex items-center justify-between border-b border-white/10 pb-2">
				<h3 class="text-lg font-bold text-white">{title}</h3>
				<button
					type="button"
					class="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-primary"
					on:click={onClose}
					on:keydown={(e) => e.key === 'Enter' && onClose()}
					aria-label="Close modal"
				>
					✕
				</button>
			</div>
			<div class="text-sm text-gray-400">
				<slot />
			</div>
		</div>
	</div>
{/if}

