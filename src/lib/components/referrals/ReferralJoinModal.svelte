<script lang="ts">
	import { walletAddress } from '$lib/stores/authStore';
	import { signMessage } from '$lib/services/walletService';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		showReferralJoinModal,
		showReferralDashboardModal,
		joinReferralProgramme,
		createReferralSignMessage,
		fetchReferralProfile
	} from '$lib/stores/referralStore';
	import { isStaleWalletSessionError, handleStaleWalletSession } from '$lib/utils/walletUtils';
	import { wagmiConfig } from 'svelte-wagmi';

	let telegramHandle = '';
	let nickname = '';
	let error = '';
	let submitting = false;
	let success = false;
	let generatedCode = '';

	function closeModal() {
		showReferralJoinModal.set(false);
		// Reset form state
		telegramHandle = '';
		nickname = '';
		error = '';
		success = false;
		generatedCode = '';
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}

	// Validate telegram handle format
	function validateTelegram(handle: string): boolean {
		const pattern = /^@[a-zA-Z][a-zA-Z0-9_]{3,30}$/;
		return pattern.test(handle);
	}

	// Validate nickname format
	function validateNickname(name: string): boolean {
		const pattern = /^[a-zA-Z0-9_]{3,20}$/;
		return pattern.test(name);
	}

	$: telegramValid = !telegramHandle || validateTelegram(telegramHandle);
	$: nicknameValid = !nickname || validateNickname(nickname);
	$: canSubmit =
		telegramHandle.trim() &&
		nickname.trim() &&
		validateTelegram(telegramHandle.trim()) &&
		validateNickname(nickname.trim());

	async function handleSubmit() {
		if (!$walletAddress || !canSubmit) return;

		submitting = true;
		error = '';

		try {
			// Create message to sign
			const message = createReferralSignMessage($walletAddress);

			// Request signature from wallet
			const signature = await signMessage(message);

			// Join the referral programme
			const result = await joinReferralProgramme(
				$walletAddress,
				telegramHandle.trim(),
				nickname.trim(),
				signature,
				message
			);

			if (result.success) {
				success = true;
				generatedCode = result.referralCode || '';
				// Fetch the updated profile
				await fetchReferralProfile($walletAddress);
			} else {
				error = result.error || 'Failed to join referral programme';
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

	function openDashboard() {
		closeModal();
		showReferralDashboardModal.set(true);
	}

	async function copyCode() {
		if (generatedCode) {
			try {
				await navigator.clipboard.writeText(generatedCode);
			} catch {
				// Silently fail
			}
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $showReferralJoinModal}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
		on:click={closeModal}
		on:keydown={(e) => e.key === 'Enter' && closeModal()}
		role="button"
		tabindex="0"
	/>

	<!-- Modal -->
	<div class="fixed inset-0 z-[201] flex items-center justify-center p-4">
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md overflow-hidden rounded-xl border border-gray-700 bg-gray-800 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="join-modal-title"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 px-6 py-4">
				<h2 id="join-modal-title" class="text-lg font-semibold text-white">
					{success ? 'Welcome to the Referral Programme!' : 'Join Referral Programme'}
				</h2>
				<button
					on:click={closeModal}
					class="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="p-6">
				{#if success}
					<!-- Success state -->
					<div class="space-y-4 text-center">
						<div
							class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20"
						>
							<svg
								class="h-8 w-8 text-green-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 13l4 4L19 7"
								/>
							</svg>
						</div>

						<div>
							<p class="text-gray-300">Your referral code is:</p>
							<div class="mt-2 flex items-center justify-center gap-2">
								<code class="rounded-lg bg-gray-700 px-4 py-2 font-mono text-lg text-yellow-400">
									{generatedCode}
								</code>
								<button
									on:click={copyCode}
									class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
									title="Copy code"
								>
									<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
										/>
									</svg>
								</button>
							</div>
						</div>

						<p class="text-sm text-gray-400">
							Share this code with friends. You'll earn 50% of the projected rewards from wallets
							that sign up using your code.
						</p>

						<Button on:click={openDashboard} variant="primary" fullWidth>View Dashboard</Button>
					</div>
				{:else}
					<!-- Join form -->
					<div class="space-y-4">
						<p class="text-sm text-gray-300">
							Join our referral programme to earn rewards when others sign up using your code.
						</p>

						{#if error}
							<div
								class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300"
							>
								{error}
							</div>
						{/if}

						<!-- Telegram handle input -->
						<div class="space-y-2">
							<label for="telegram-handle" class="text-sm font-medium text-gray-300">
								Telegram Handle
							</label>
							<input
								id="telegram-handle"
								type="text"
								bind:value={telegramHandle}
								disabled={submitting}
								placeholder="@username"
								class="w-full rounded-lg border px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50 {telegramValid
									? 'border-gray-700 bg-gray-800 focus:border-yellow-500 focus:ring-yellow-500'
									: 'border-red-500 bg-gray-800 focus:border-red-500 focus:ring-red-500'}"
							/>
							{#if !telegramValid}
								<p class="text-xs text-red-400">
									Invalid format. Must start with @ (e.g., @username)
								</p>
							{/if}
						</div>

						<!-- Nickname input -->
						<div class="space-y-2">
							<label for="nickname" class="text-sm font-medium text-gray-300">
								Leaderboard Nickname
							</label>
							<input
								id="nickname"
								type="text"
								bind:value={nickname}
								disabled={submitting}
								placeholder="Your display name"
								class="w-full rounded-lg border px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50 {nicknameValid
									? 'border-gray-700 bg-gray-800 focus:border-yellow-500 focus:ring-yellow-500'
									: 'border-red-500 bg-gray-800 focus:border-red-500 focus:ring-red-500'}"
							/>
							{#if !nicknameValid}
								<p class="text-xs text-red-400">
									3-20 characters, letters, numbers, and underscores only
								</p>
							{:else}
								<p class="text-xs text-gray-500">
									This will be displayed publicly on the leaderboard
								</p>
							{/if}
						</div>

						<Button
							on:click={handleSubmit}
							variant="primary"
							fullWidth
							disabled={!canSubmit || submitting}
						>
							{#if submitting}
								<span class="flex items-center gap-2">
									<span
										class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
									></span>
									Signing...
								</span>
							{:else}
								Sign & Join
							{/if}
						</Button>

						<p class="text-center text-xs text-gray-500">
							You'll sign a message to verify wallet ownership
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
