<script lang="ts">
	import { connected } from 'svelte-wagmi';
	import { currentNetwork } from '$lib/stores';
	import Button from '$lib/components/ui/Button.svelte';

	let email = '';
	let isSubmitting = false;
	let submitMessage = '';

	async function handleNewsletterSubmit(e: Event) {
		e.preventDefault();
		isSubmitting = true;
		submitMessage = '';

		// Basic email validation
		if (!email || !email.includes('@')) {
			submitMessage = 'Please enter a valid email address';
			isSubmitting = false;
			return;
		}

		try {
			const response = await fetch('/api/newsletter', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ email })
			});

			const data = await response.json();

			if (data.success) {
				submitMessage = data.message || 'Thank you for subscribing!';
				email = '';
			} else {
				submitMessage = data.error || 'Something went wrong. Please try again.';
			}
		} catch {
			submitMessage = 'Something went wrong. Please try again.';
		} finally {
			isSubmitting = false;
			setTimeout(() => {
				submitMessage = '';
			}, 5000);
		}
	}
</script>

<!-- Footer -->
<div class="mt-16 border-t border-white/10 bg-gray-800/80 backdrop-blur-sm">
	<div class="p-4 sm:p-6">
		<div class="mb-8 grid grid-cols-1 gap-8 sm:grid-cols-3 lg:gap-12">
			<!-- Legal Column -->
			<div>
				<h4 class="mb-4 text-base font-semibold text-white sm:text-lg">Legal</h4>
				<div class="space-y-3">
					<a
						href="/terms"
						class="block text-xs text-gray-400 transition-colors hover:text-yellow-500 sm:text-sm"
					>
						Terms of Service
					</a>
					<a
						href="/privacy"
						class="block text-xs text-gray-400 transition-colors hover:text-yellow-500 sm:text-sm"
					>
						Privacy Policy
					</a>
					<a
						href="/compliance"
						class="block text-xs text-gray-400 transition-colors hover:text-yellow-500 sm:text-sm"
					>
						Compliance
					</a>
				</div>
			</div>

			<!-- Resources Column -->
			<div>
				<h4 class="mb-4 text-base font-semibold text-white sm:text-lg">Resources</h4>
				<div class="space-y-3">
					<a
						href="/docs"
						class="block text-xs text-gray-400 transition-colors hover:text-yellow-500 sm:text-sm"
					>
						Documentation
					</a>
					<a
						href="/audit"
						class="block text-xs text-gray-400 transition-colors hover:text-yellow-500 sm:text-sm"
					>
						Audit Reports
					</a>
					<a
						href="/faqs"
						class="block text-xs text-gray-400 transition-colors hover:text-yellow-500 sm:text-sm"
					>
						FAQs
					</a>
					<a
						href="/whitepaper"
						class="block text-xs text-gray-400 transition-colors hover:text-yellow-500 sm:text-sm"
					>
						Whitepaper
					</a>
				</div>
			</div>

			<!-- Get in Touch Column -->
			<div>
				<h4 class="mb-4 text-base font-semibold text-white sm:text-lg">Get in Touch</h4>

				<!-- Newsletter Signup -->
				<div class="mb-4">
					<p class="mb-3 text-xs text-gray-400 sm:text-sm">Subscribe to our newsletter</p>
					<form on:submit={handleNewsletterSubmit} class="space-y-2">
						<div class="flex flex-col gap-2 sm:flex-row">
							<input
								type="email"
								bind:value={email}
								placeholder="Enter your email"
								disabled={isSubmitting}
								class="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-yellow-500/50 sm:text-sm"
							/>
							<Button
								type="submit"
								disabled={isSubmitting}
								variant="secondary"
								size="sm"
								className="bg-yellow-500 text-black hover:bg-yellow-400 border-0 w-full sm:w-auto"
							>
								{isSubmitting ? 'Submitting...' : 'Subscribe'}
							</Button>
						</div>
						{#if submitMessage}
							<p
								class="text-xs {submitMessage.includes('Thank you')
									? 'text-green-400'
									: 'text-red-400'}"
							>
								{submitMessage}
							</p>
						{/if}
					</form>
				</div>

				<!-- Social Media Links -->
				<div class="mt-6">
					<p class="mb-3 text-xs text-gray-400 sm:text-sm">Follow us</p>
					<div class="flex gap-3">
						<!-- X (Twitter) -->
						<a
							href="https://x.com/st0x_io"
							target="_blank"
							rel="noopener noreferrer"
							class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
							aria-label="Follow on X"
						>
							<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path
									d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
								/>
							</svg>
						</a>

						<!-- Telegram -->
						<a
							href="https://t.me/+oIzo_I9xi745ODU0"
							target="_blank"
							rel="noopener noreferrer"
							class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
							aria-label="Join Telegram"
						>
							<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path
									d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
								/>
							</svg>
						</a>

						<!-- LinkedIn -->
						<a
							href="https://www.linkedin.com/company/st0x"
							target="_blank"
							rel="noopener noreferrer"
							class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
							aria-label="Connect on LinkedIn"
						>
							<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path
									d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
								/>
							</svg>
						</a>
					</div>
				</div>
			</div>
		</div>

		<!-- Bottom Bar -->
				<div class="border-t border-white/10 pt-6 sm:pt-8">
					<div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
						<div class="text-xs text-gray-400 sm:text-sm">
							© {new Date().getFullYear()} SARK X (BVI) Ltd. All rights reserved.
						</div>
						<div class="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
							<div class="hidden items-center gap-2 text-xs text-gray-400 sm:flex sm:text-sm">
								{#if $connected}
									<div class="h-2 w-2 animate-pulse rounded-full bg-green-500" />
									Wallet Connected
								{:else}
									<div class="h-2 w-2 animate-pulse rounded-full bg-red-500" />
									Wallet Disconnected
								{/if}
							</div>
							<div class="hidden text-xs text-gray-400 sm:block sm:text-sm">Network: {$currentNetwork.name}</div>
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
