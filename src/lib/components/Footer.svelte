<script lang="ts">
	import { connected } from 'svelte-wagmi';
	import { currentNetwork } from '$lib/stores';
</script>

<!-- Footer -->
<div class="mt-16 border-t border-white/10 bg-gray-800/80 backdrop-blur-sm">
	<div class="p-4 sm:p-6">
		<div class="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
			<div>
				<h4 class="mb-4 text-base font-semibold sm:text-lg">Legal</h4>
				<div class="space-y-2">
					<a
						href="/terms"
						class="block text-xs text-gray-400 transition-colors hover:text-yellow-500 sm:text-sm"
						>Terms of Service</a
					>
				</div>
			</div>
			<div>
				<h4 class="mb-4 text-base font-semibold sm:text-lg">Resources</h4>
				<div class="space-y-2">
					<a
						href="/docs"
						class="block text-xs text-gray-400 transition-colors hover:text-yellow-500 sm:text-sm"
						>Documentation</a
					>
					<a
						href="/audit"
						class="block text-xs text-gray-400 transition-colors hover:text-yellow-500 sm:text-sm"
						>Audit Reports</a
					>
				</div>
			</div>
		</div>

		<!-- Bottom Bar -->
		<div class="border-t border-white/10 pt-6 sm:pt-8">
			<div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
				<div class="text-xs text-gray-400 sm:text-sm">
					© SARK X (BVI) Ltd. All rights reserved.
				</div>
				<div class="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
					<div class="flex items-center gap-2 text-xs text-gray-400 sm:text-sm">
						{#if $connected}
							<div class="h-2 w-2 animate-pulse rounded-full bg-green-500" />
							Wallet Connected
						{:else}
							<div class="h-2 w-2 animate-pulse rounded-full bg-red-500" />
							Wallet Disconnected
						{/if}
					</div>
					<div class="text-xs text-gray-400 sm:text-sm">Network: {$currentNetwork.name}</div>
				</div>
			</div>

			<!-- Risk Warning -->
			<div class="mt-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 sm:p-4">
				<div class="flex flex-col items-start gap-3 sm:flex-row">
					<div
						class="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-yellow-500"
					>
						<span class="text-xs font-bold text-gray-900">!</span>
					</div>
					<div class="text-xs text-gray-300 sm:text-sm">
						<strong class="text-yellow-500">Investment Risk Warning:</strong> Trading tokenized assets
						involves substantial risk of loss. Past performance does not guarantee future results. Please
						read our risk disclaimers and ensure you understand the risks before trading. ST0x is not
						available to residents of certain jurisdictions.
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
