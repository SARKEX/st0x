<script lang="ts">
	import Section from './Section.svelte';
	import WalletConnect from '../WalletConnect.svelte';
	import { currentNetwork } from '$lib/stores';

	export let title: string = 'Connect Your Wallet';
	export let description: string = '';
	export let showSection: boolean = true;
	export let minHeight: boolean = true;

	$: defaultDescription =
		description ||
		`Connect your wallet to access this feature on ${
			$currentNetwork?.displayName || 'this network'
		}.`;
</script>

<div class={minHeight ? 'flex min-h-[60vh] items-center justify-center' : ''}>
	{#if showSection}
		<Section>
			<div class="flex flex-col items-center justify-center gap-6 px-6 py-12 sm:px-8 sm:py-16">
				<div class="rounded-full bg-gradient-to-br from-blue-600/20 to-purple-700/20 p-6">
					<svg
						class="h-10 w-10 text-blue-400 sm:h-12 sm:w-12"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						/>
					</svg>
				</div>

				<div class="text-center">
					<h2 class="mb-2 text-xl font-bold sm:text-2xl">{title}</h2>
					<p class="max-w-md text-sm text-gray-400 sm:text-base">
						{defaultDescription}
					</p>
				</div>

				<WalletConnect />

				{#if $$slots.extra}
					<slot name="extra" />
				{/if}
			</div>
		</Section>
	{:else}
		<div class="flex flex-col items-center justify-center gap-6 px-6 py-12">
			<div class="rounded-full bg-gradient-to-br from-blue-600/20 to-purple-700/20 p-6">
				<svg
					class="h-10 w-10 text-blue-400 sm:h-12 sm:w-12"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
					/>
				</svg>
			</div>

			<div class="text-center">
				<h2 class="mb-2 text-xl font-bold sm:text-2xl">{title}</h2>
				<p class="max-w-md text-sm text-gray-400 sm:text-base">
					{defaultDescription}
				</p>
			</div>

			<WalletConnect />

			{#if $$slots.extra}
				<slot name="extra" />
			{/if}
		</div>
	{/if}
</div>
