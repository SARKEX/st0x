<script lang="ts">
	import { connected } from 'svelte-wagmi';
	import { currentNetwork } from '$lib/stores';
	
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
		} catch (error) {
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
						<div class="flex gap-2">
							<input
								type="email"
								bind:value={email}
								placeholder="Enter your email"
								disabled={isSubmitting}
								class="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-yellow-500/50 sm:text-sm"
							/>
							<button
								type="submit"
								disabled={isSubmitting}
								class="rounded-lg bg-yellow-500 px-4 py-2 text-xs font-medium text-black transition-all hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
							>
								{isSubmitting ? 'Submitting...' : 'Subscribe'}
							</button>
						</div>
						{#if submitMessage}
							<p class="text-xs {submitMessage.includes('Thank you') ? 'text-green-400' : 'text-red-400'}">
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
							href="https://twitter.com/your-handle"
							target="_blank"
							rel="noopener noreferrer"
							class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
							aria-label="Follow on X"
						>
							<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
							</svg>
						</a>

						<!-- Telegram -->
						<a
							href="https://t.me/your-channel"
							target="_blank"
							rel="noopener noreferrer"
							class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
							aria-label="Join Telegram"
						>
							<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
							</svg>
						</a>

						<!-- Discord -->
						<a
							href="https://discord.gg/your-invite"
							target="_blank"
							rel="noopener noreferrer"
							class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
							aria-label="Join Discord"
						>
							<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
							</svg>
						</a>

						<!-- GitHub -->
						<a
							href="https://github.com/your-org"
							target="_blank"
							rel="noopener noreferrer"
							class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
							aria-label="View on GitHub"
						>
							<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
							</svg>
						</a>

						<!-- LinkedIn -->
						<a
							href="https://linkedin.com/company/your-company"
							target="_blank"
							rel="noopener noreferrer"
							class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
							aria-label="Connect on LinkedIn"
						>
							<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
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