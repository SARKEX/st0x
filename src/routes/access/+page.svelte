<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import { signMessage } from '@wagmi/core';
	import { signerAddress, connected, web3Modal, wagmiConfig } from 'svelte-wagmi';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		checkingAccess,
		checkWalletAccess,
		createSignMessage,
		registerWallet
	} from '$lib/stores/accessStore';

	// Form state
	let accessCode = '';
	let captchaToken = '';
	let error = '';
	let submitting = false;
	let captchaWidgetId: string | null = null;
	let captchaReady = false;

	// Derived state for showing captcha (avoid cyclical dependency with captchaToken)
	$: showCaptcha = $connected && $signerAddress && accessCode.trim();

	// Check if already registered when wallet connects
	$: if ($signerAddress && browser) {
		checkWalletAccess($signerAddress).then((registered) => {
			if (registered) {
				goto('/');
			}
		});
	}

	// Load hCaptcha script and pre-fill access code from URL
	onMount(() => {
		// Pre-fill access code from URL param (utm_campaign or ref for backwards compat)
		const urlParams = new URLSearchParams(window.location.search);
		const code = urlParams.get('utm_campaign') || urlParams.get('ref');
		if (code) {
			accessCode = code.trim();
		}

		if (browser && !document.getElementById('hcaptcha-script')) {
			const script = document.createElement('script');
			script.id = 'hcaptcha-script';
			script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
			script.async = true;
			script.defer = true;
			script.onload = () => {
				captchaReady = true;
			};
			document.head.appendChild(script);
		} else if (browser && window.hcaptcha) {
			captchaReady = true;
		} else if (browser) {
			// Script element exists but hcaptcha not ready yet - poll until it's available
			const checkHcaptcha = setInterval(() => {
				if (window.hcaptcha) {
					captchaReady = true;
					clearInterval(checkHcaptcha);
				}
			}, 100);
			// Stop polling after 10 seconds
			setTimeout(() => clearInterval(checkHcaptcha), 10000);
		}
	});

	// Clean up hcaptcha widget on unmount to prevent stale state
	onDestroy(() => {
		if (browser && window.hcaptcha && captchaWidgetId !== null) {
			try {
				window.hcaptcha.remove(captchaWidgetId);
			} catch {
				// Ignore errors during cleanup
			}
		}
		captchaWidgetId = null;
	});

	// Render captcha when ready and conditions are met
	$: if (captchaReady && showCaptcha && browser && !captchaWidgetId) {
		setTimeout(() => {
			const container = document.getElementById('hcaptcha-container');
			if (container && window.hcaptcha && !captchaWidgetId) {
				try {
					captchaWidgetId = window.hcaptcha.render('hcaptcha-container', {
						sitekey: env.PUBLIC_HCAPTCHA_SITEKEY || '10000000-ffff-ffff-ffff-000000000001',
						callback: (token: string) => {
							captchaToken = token;
						},
						'expired-callback': () => {
							captchaToken = '';
						},
						theme: 'dark'
					});
				} catch (err) {
					console.error('Failed to render hcaptcha:', err);
					// Reset state to allow retry
					captchaWidgetId = null;
				}
			}
		}, 100);
	}

	function handleConnectWallet() {
		$web3Modal.open();
	}

	async function handleSubmit() {
		if (!$signerAddress || !$wagmiConfig) {
			error = 'Wallet not connected';
			return;
		}

		if (!accessCode.trim()) {
			error = 'Please enter an access code';
			return;
		}

		if (!captchaToken) {
			error = 'Please complete the captcha';
			return;
		}

		submitting = true;
		error = '';

		try {
			// Create message to sign
			const message = createSignMessage($signerAddress, accessCode.trim().toUpperCase());

			// Request signature from wallet
			const signature = await signMessage($wagmiConfig, { message });

			// Register with backend
			const result = await registerWallet(
				$signerAddress,
				accessCode.trim(),
				signature,
				message,
				captchaToken
			);

			if (result.success) {
				goto('/');
			} else {
				error = result.error || 'Registration failed';
				// Reset captcha on error
				if (window.hcaptcha && captchaWidgetId !== null) {
					window.hcaptcha.reset(captchaWidgetId);
					captchaToken = '';
				}
			}
		} catch (err) {
			if (err instanceof Error) {
				if (err.message.includes('rejected') || err.message.includes('denied')) {
					error = 'Signature request was rejected';
				} else {
					error = err.message;
				}
			} else {
				error = 'An unexpected error occurred';
			}
			// Reset captcha on error
			if (window.hcaptcha && captchaWidgetId !== null) {
				window.hcaptcha.reset(captchaWidgetId);
				captchaToken = '';
			}
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Real Stocks, On-Chain | ST0X</title>
</svelte:head>

<div class="min-h-screen bg-gray-950 text-white">
	<PageContainer>
		<div
			class="mx-auto flex max-w-6xl flex-col gap-10 px-2 py-16 md:flex-row md:items-start md:gap-16 md:py-24"
		>
			<!-- Left side: Branding -->
			<div class="flex-1">
				<div class="mb-6">
					<img src="/images/logo-sidebar.svg" alt="ST0x Logo" class="h-10 w-auto" />
				</div>
				<h1 class="text-4xl font-semibold leading-tight tracking-[-0.02em] sm:text-6xl md:text-7xl">
					Your Gateway to
					<span class="bg-gradient-to-b from-[#f0c48b] to-[#e5b47a] bg-clip-text text-transparent"
						>On-Chain</span
					>
					Equities
				</h1>
				<p class="mt-6 max-w-xl text-base text-gray-300 sm:text-lg">
					ST0x is the first blockchain-powered equities platform. 24/7 settlement. Built by
					pioneers.
				</p>
				<p class="mt-6 max-w-2xl text-sm text-gray-400">
					Connect your wallet and enter your access code to begin. Don't have an access code?
					Contact us at
					<a class="text-[#e8be89] hover:underline" href="mailto:toby@st0x.io">toby@st0x.io</a>.
				</p>
			</div>

			<!-- Right side: Access form -->
			<div class="w-full max-w-md md:pt-8">
				<Card>
					{#if $checkingAccess}
						<div class="flex items-center justify-center py-8">
							<div
								class="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
							></div>
							<span class="ml-3 text-gray-400">Checking access...</span>
						</div>
					{:else}
						<div class="space-y-6">
							<!-- Error message -->
							{#if error}
								<div
									class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300"
								>
									{error}
								</div>
							{/if}

							<!-- Step 1: Connect Wallet -->
							<div class="space-y-2">
								<div class="flex items-center gap-2">
									<div
										class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium {$connected &&
										$signerAddress
											? 'bg-green-600 text-white'
											: 'bg-gray-700 text-gray-300'}"
									>
										{$connected && $signerAddress ? '✓' : '1'}
									</div>
									<span class="text-sm font-medium text-gray-300">Connect Wallet</span>
								</div>
								{#if !$connected || !$signerAddress}
									<Button
										on:click={handleConnectWallet}
										variant="primary"
										className="w-full"
										disabled={submitting}
									>
										Connect Wallet
									</Button>
								{:else}
									<div
										class="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2"
									>
										<svg class="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
											<path
												fill-rule="evenodd"
												d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.707a1 1 0 00-1.414-1.414L9 10.172 7.707 8.879a1 1 0 10-1.414 1.414L9 13l4.707-4.707z"
												clip-rule="evenodd"
											/>
										</svg>
										<span class="text-sm text-gray-300">
											{$signerAddress.slice(0, 6)}...{$signerAddress.slice(-4)}
										</span>
									</div>
								{/if}
							</div>

							<!-- Step 2: Enter Access Code -->
							<div class="space-y-2">
								<div class="flex items-center gap-2">
									<div
										class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium {accessCode.trim()
											? 'bg-green-600 text-white'
											: 'bg-gray-700 text-gray-300'}"
									>
										{accessCode.trim() ? '✓' : '2'}
									</div>
									<span class="text-sm font-medium text-gray-300">Enter Access Code</span>
								</div>
								<input
									type="text"
									bind:value={accessCode}
									disabled={submitting}
									placeholder="ST0X-XXXX-XXXX"
									class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 uppercase text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89] disabled:cursor-not-allowed disabled:opacity-50"
								/>
							</div>

							<!-- Step 3: Captcha -->
							<div class="space-y-2">
								<div class="flex items-center gap-2">
									<div
										class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium {captchaToken
											? 'bg-green-600 text-white'
											: 'bg-gray-700 text-gray-300'}"
									>
										{captchaToken ? '✓' : '3'}
									</div>
									<span class="text-sm font-medium text-gray-300">Verify You're Human</span>
								</div>
								{#if showCaptcha}
									<div
										id="hcaptcha-container"
										class="flex justify-center"
										data-sitekey={env.PUBLIC_HCAPTCHA_SITEKEY ||
											'10000000-ffff-ffff-ffff-000000000001'}
									></div>
								{:else}
									<div
										class="flex h-[78px] items-center justify-center rounded border border-gray-700 bg-gray-800/30 text-sm text-gray-500"
									>
										Complete previous steps first
									</div>
								{/if}
							</div>

							<!-- Step 4: Sign & Submit -->
							<div class="space-y-2">
								<div class="flex items-center gap-2">
									<div
										class="flex h-6 w-6 items-center justify-center rounded-full bg-gray-700 text-xs font-medium text-gray-300"
									>
										4
									</div>
									<span class="text-sm font-medium text-gray-300">Sign & Register</span>
								</div>
								<Button
									on:click={handleSubmit}
									variant="primary"
									className="w-full"
									disabled={!$connected ||
										!$signerAddress ||
										!accessCode.trim() ||
										!captchaToken ||
										submitting}
								>
									{#if submitting}
										<span class="flex items-center gap-2">
											<span
												class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
											></span>
											Signing...
										</span>
									{:else}
										Sign & Get Access
									{/if}
								</Button>
								<p class="text-center text-xs text-gray-500">
									You'll be asked to sign a message to verify wallet ownership
								</p>
							</div>
						</div>
					{/if}
				</Card>
			</div>
		</div>
	</PageContainer>

	<!-- Background gradient -->
	<div class="pointer-events-none fixed inset-0 -z-10 opacity-15">
		<div
			class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-yellow-700/10 via-gray-900 to-gray-950"
		/>
	</div>
</div>

<style>
	:global(.h-captcha) {
		display: flex;
		justify-content: center;
	}
</style>
