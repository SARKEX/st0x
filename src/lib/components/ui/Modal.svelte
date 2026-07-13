<script lang="ts" context="module">
	// Per-instance id so multiple open modals each register/unregister cleanly.
	let modalSeq = 0;
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { setSheetOpen } from '$lib/stores/uiStore';

	export let show: boolean = false;
	export let title: string = '';
	export let onClose: () => void;
	// Allow consumers to control modal size
	export let maxWidthClass: string = 'max-w-4xl';
	export let maxHeightVh: number = 80; // percentage of viewport height

	const sheetId = `uiModal-${modalSeq++}`;
	// On mobile the modal is a bottom-sheet; hide the tab bar while it's open.
	$: setSheetOpen(sheetId, show);
	onDestroy(() => setSheetOpen(sheetId, false));
</script>

{#if show}
	<div
		class="fixed inset-0 z-[10040] flex items-end justify-center p-0 sm:items-center sm:p-4"
		role="presentation"
	>
		<button
			type="button"
			class="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm"
			on:click={onClose}
			aria-label="Close modal overlay"
		></button>
		<div
			class={`relative z-[10050] w-full ${maxWidthClass} overflow-y-auto rounded-t-2xl border border-line bg-surface-1 p-6 text-left shadow-[var(--shadow-pop)] transition-all duration-200 ease-in-out sm:rounded-2xl`}
			style={`max-height: ${maxHeightVh}vh; padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));`}
			role="dialog"
			aria-modal="true"
			aria-label="Modal"
		>
			<!-- grab handle (mobile bottom-sheet affordance) -->
			<div class="bg-text/15 mx-auto mb-3 h-1 w-10 rounded-full sm:hidden"></div>
			<div class="mb-4 flex items-center justify-between border-b border-line pb-2">
				<h3 class="text-lg font-bold text-text">{title}</h3>
				<button
					type="button"
					class="rounded-full p-1 text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
					on:click={onClose}
					on:keydown={(e) => e.key === 'Enter' && onClose()}
					aria-label="Close modal"
				>
					<Icon name="close" className="h-5 w-5" />
				</button>
			</div>
			<div class="text-sm text-text-2">
				<slot />
			</div>
		</div>
	</div>
{/if}
