<script lang="ts">
	export let show: boolean = false;
	export let title: string = '';
	export let onClose: () => void;
	// Allow consumers to control modal size
	export let maxWidthClass: string = 'max-w-4xl';
	export let maxHeightVh: number = 80; // percentage of viewport height
</script>

{#if show}
	<button
		type="button"
		class="fixed inset-0 z-[10040] h-full w-full bg-black/20"
		on:click={onClose}
		aria-label="Close modal overlay"
	/>
	<div
		class={`fixed left-1/2 top-1/2 z-[10050] mx-2 w-full ${maxWidthClass} -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-4 text-left shadow-xl transition-all duration-200 ease-in-out`}
		role="dialog"
		aria-modal="true"
		aria-label="Modal"
	>
		<div
			class="relative w-full overflow-y-auto rounded-lg bg-gray-900 p-6 shadow-lg"
			style={`max-height: ${maxHeightVh}vh;`}
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
