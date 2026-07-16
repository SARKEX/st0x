<script lang="ts">
	import type { ComponentType } from 'svelte';

	export let title: string = '';
	export let description: string = '';
	export let icon: ComponentType | null = null;
	export let showBorder: boolean = false;
	export let className: string = '';
</script>

<div
	class={'text-center ' +
		(showBorder ? 'bg-surface-2/50 rounded-lg border border-line p-8' : 'py-12') +
		' ' +
		className}
>
	{#if icon}
		<div class="mb-4 flex justify-center">
			<div class="bg-surface-2/50 rounded-full p-4">
				<svelte:component this={icon} class="h-8 w-8 text-text-3" />
			</div>
		</div>
	{/if}

	{#if title}
		<h3 class="mb-2 text-lg font-semibold text-text-2 sm:text-xl">{title}</h3>
	{/if}

	{#if description}
		<p class="text-sm text-text-3 sm:text-base">{description}</p>
	{:else if !title}
		<p class="text-text-2"><slot /></p>
	{/if}

	{#if $$slots.action}
		<div class="mt-6">
			<slot name="action" />
		</div>
	{/if}
</div>
