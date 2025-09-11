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
		(showBorder ? 'rounded-lg border border-white/10 bg-gray-800/50 p-8' : 'py-12') +
		' ' +
		className}
>
	{#if icon}
		<div class="mb-4 flex justify-center">
			<div class="rounded-full bg-gray-800/50 p-4">
				<svelte:component this={icon} class="h-8 w-8 text-gray-500" />
			</div>
		</div>
	{/if}

	{#if title}
		<h3 class="mb-2 text-lg font-semibold text-gray-400 sm:text-xl">{title}</h3>
	{/if}

	{#if description}
		<p class="text-sm text-gray-500 sm:text-base">{description}</p>
	{:else if !title}
		<p class="text-gray-400"><slot /></p>
	{/if}

	{#if $$slots.action}
		<div class="mt-6">
			<slot name="action" />
		</div>
	{/if}
</div>
