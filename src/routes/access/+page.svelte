<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { signMessage, disconnect } from '@wagmi/core';
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
	import {
		isStaleWalletSessionError,
		handleStaleWalletSession
	} from '$lib/utils/walletUtils';

	// Form state
	let accessCode = '';
	let error = '';
	let submitting = false;

	// Check if already registered when wallet connects
	$: if ($signerAddress && browser) {
		checkWalletAccess($signerAddress).then((registered) => {
			if (registered) {
				goto('/');
			}
		});
	}

	// Pre-fill access code from URL
	onMount(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const code = urlParams.get('utm_campaign') || urlParams.get('ref');
		if (code) {
			accessCode = code.trim();
		}
	});

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

		submitting = true;
		error = '';

		try {
			// Create message to sign
			const message = createSignMessage($signerAddress, accessCode.trim().toUpperCase());

			// Request signature from wallet
			const signature = await signMessage($wagmiConfig, { message });

			// Register with backend
			const result = await registerWallet($signerAddress, accessCode.trim(), signature, message);

			if (result.success) {
				goto('/');
			} else {
				error = result.error || 'Registration failed';
			}
		} catch (err) {
			if (isStaleWalletSessionError(err)) {
				error = await handleStaleWalletSession($wagmiConfig);
			} else if (err instanceof Error) {
				if (err.message.includes('rejected') || err.message.includes('denied')) {
					error = 'Signature request was rejected';
				} else {
					error = err.message;
				}
			} else {
				error = 'An unexpected error occurred';
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
										class="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2"
									>
										<div class="flex items-center gap-2">
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
										<button
											type="button"
											on:click={() => $wagmiConfig && disconnect($wagmiConfig)}
											class="text-gray-400 hover:text-red-400 transition-colors"
											aria-label="Disconnect wallet"
											disabled={submitting}
										>
											<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
												/>
											</svg>
										</button>
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

							<!-- Step 3: Sign & Submit -->
							<div class="space-y-2">
								<div class="flex items-center gap-2">
									<div
										class="flex h-6 w-6 items-center justify-center rounded-full bg-gray-700 text-xs font-medium text-gray-300"
									>
										3
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
