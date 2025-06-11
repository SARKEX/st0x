<script lang="ts">
	import { connected } from 'svelte-wagmi';
</script>

<!-- Footer -->
<footer class="mt-16 border-t border-white/10 bg-gray-800/80 backdrop-blur-sm">
	<div class="p-6">
		<div class="mb-8 grid grid-cols-3 gap-8">
			<div>
				<h4 class="mb-4 font-semibold">Legal</h4>
				<div class="space-y-2">
					<a
						href="/terms"
						class="block text-sm text-gray-400 transition-colors hover:text-yellow-500"
						>Terms of Service</a
					>
					<a
						href="/privacy"
						class="block text-sm text-gray-400 transition-colors hover:text-yellow-500"
						>Privacy Policy</a
					>
					<a
						href="/disclaimers"
						class="block text-sm text-gray-400 transition-colors hover:text-yellow-500"
						>Risk Disclaimers</a
					>
					<a
						href="/compliance"
						class="block text-sm text-gray-400 transition-colors hover:text-yellow-500"
						>Compliance</a
					>
				</div>
			</div>
			<div>
				<h4 class="mb-4 font-semibold">Resources</h4>
				<div class="space-y-2">
					<a
						href="/docs"
						class="block text-sm text-gray-400 transition-colors hover:text-yellow-500"
						>Documentation</a
					>
					<a href="/api" class="block text-sm text-gray-400 transition-colors hover:text-yellow-500"
						>API Reference</a
					>
					<a
						href="/security"
						class="block text-sm text-gray-400 transition-colors hover:text-yellow-500">Security</a
					>
					<a
						href="/audit"
						class="block text-sm text-gray-400 transition-colors hover:text-yellow-500"
						>Audit Reports</a
					>
				</div>
			</div>
			<div>
				<h4 class="mb-4 font-semibold">Contact</h4>
				<div class="space-y-2">
					<a
						href="/support"
						class="block text-sm text-gray-400 transition-colors hover:text-yellow-500"
						>Support Center</a
					>
					<a
						href="mailto:hello@st0x.com"
						class="block text-sm text-gray-400 transition-colors hover:text-yellow-500"
						>hello@st0x.com</a
					>
					<a
						href="/bug-bounty"
						class="block text-sm text-gray-400 transition-colors hover:text-yellow-500"
						>Bug Bounty</a
					>
					<a
						href="/careers"
						class="block text-sm text-gray-400 transition-colors hover:text-yellow-500">Careers</a
					>
				</div>
			</div>
		</div>

		<!-- Bottom Bar -->
		<div class="border-t border-white/10 pt-8">
			<div class="flex flex-col items-center justify-between gap-4 md:flex-row">
				<div class="text-sm text-gray-400">© 2025 ST0x. All rights reserved.</div>
				<div class="flex items-center gap-6">
					<div class="flex items-center gap-2 text-sm text-gray-400">
						{#if $connected}
							<div class="h-2 w-2 animate-pulse rounded-full bg-green-500" />
							System Status: Operational
						{:else}
							<div class="h-2 w-2 animate-pulse rounded-full bg-red-500" />
							System Status: Offline
						{/if}
					</div>
					<div class="text-sm text-gray-400">Network: Arbitrum</div>
				</div>
			</div>

			<!-- Risk Warning -->
			<div class="mt-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
				<div class="flex items-start gap-3">
					<div
						class="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-yellow-500"
					>
						<span class="text-xs font-bold text-gray-900">!</span>
					</div>
					<div class="text-sm text-gray-300">
						<strong class="text-yellow-500">Investment Risk Warning:</strong> Trading tokenized assets
						involves substantial risk of loss. Past performance does not guarantee future results. Please
						read our risk disclaimers and ensure you understand the risks before trading. ST0x is not
						available to residents of certain jurisdictions.
					</div>
				</div>
			</div>
		</div>
	</div>
</footer>
