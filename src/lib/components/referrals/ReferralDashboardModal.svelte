<script lang="ts">
	import {
		referralProfile,
		referralPerformance,
		referralLoading,
		showReferralDashboardModal,
		showReferralLeaderboardModal,
		getShareUrl,
		copyToClipboard,
		updateReferralNickname,
		requestReferralNicknameUpdateChallenge
	} from '$lib/stores/referralStore';
	import { walletAddress } from '$lib/stores/authStore';
	import { signMessage } from '$lib/services/walletService';
	import { formatPoints, formatUsd } from '$lib/utils/format';
	import { isStaleWalletSessionError, handleStaleWalletSession } from '$lib/utils/walletUtils';
	import { wagmiConfig } from 'svelte-wagmi';
	import ModalTabs from '$lib/components/ui/ModalTabs.svelte';

	const tabs = [
		{ id: 'dashboard', label: 'Dashboard' },
		{ id: 'about', label: 'About' }
	];

	type Tab = 'dashboard' | 'about';
	let activeTab: Tab = 'dashboard';

	function handleTabChange(e: CustomEvent<string>) {
		activeTab = e.detail as Tab;
	}

	let codeCopied = false;
	let linkCopied = false;

	// Nickname editing state
	let isEditingNickname = false;
	let newNickname = '';
	let nicknameError = '';
	let nicknameSaving = false;

	function validateNickname(name: string): boolean {
		const pattern = /^[a-zA-Z0-9_]{3,20}$/;
		return pattern.test(name);
	}

	$: nicknameValid = !newNickname || validateNickname(newNickname);

	function startEditingNickname() {
		newNickname = $referralProfile?.nickname || '';
		nicknameError = '';
		isEditingNickname = true;
	}

	function cancelEditingNickname() {
		isEditingNickname = false;
		newNickname = '';
		nicknameError = '';
	}

	function getErrorMessage(err: unknown): string {
		if (isStaleWalletSessionError(err)) {
			return 'Wallet session expired. Please reconnect.';
		}
		if (err instanceof Error) {
			if (err.message.includes('rejected') || err.message.includes('denied')) {
				return 'Signature request was rejected';
			}
			return err.message;
		}
		return 'An unexpected error occurred';
	}

	async function saveNickname() {
		const trimmedNickname = newNickname.trim();
		if (!$walletAddress || !trimmedNickname || !validateNickname(trimmedNickname)) return;

		nicknameSaving = true;
		nicknameError = '';

		try {
			const challenge = await requestReferralNicknameUpdateChallenge(
				$walletAddress,
				trimmedNickname
			);
			if (!challenge.success || !challenge.message || !challenge.nonce) {
				nicknameError = challenge.error || 'Failed to issue nickname update challenge';
				return;
			}

			const signature = await signMessage(challenge.message);
			const result = await updateReferralNickname(
				$walletAddress,
				trimmedNickname,
				signature,
				challenge.nonce
			);

			if (result.success) {
				isEditingNickname = false;
				newNickname = '';
			} else {
				nicknameError = result.error || 'Failed to update nickname';
			}
		} catch (err) {
			nicknameError = getErrorMessage(err);
			if (isStaleWalletSessionError(err)) {
				await handleStaleWalletSession($wagmiConfig);
			}
		} finally {
			nicknameSaving = false;
		}
	}

	function closeModal() {
		showReferralDashboardModal.set(false);
		activeTab = 'dashboard'; // Reset to dashboard tab on close
		cancelEditingNickname(); // Reset editing state
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}

	function openLeaderboard() {
		closeModal();
		showReferralLeaderboardModal.set(true);
	}

	async function copyCode() {
		if ($referralProfile?.referralCode) {
			const success = await copyToClipboard($referralProfile.referralCode);
			if (success) {
				codeCopied = true;
				setTimeout(() => (codeCopied = false), 2000);
			}
		}
	}

	async function copyShareLink() {
		if ($referralProfile?.referralCode) {
			const url = getShareUrl($referralProfile.referralCode);
			const success = await copyToClipboard(url);
			if (success) {
				linkCopied = true;
				setTimeout(() => (linkCopied = false), 2000);
			}
		}
	}

	$: shareUrl = $referralProfile ? getShareUrl($referralProfile.referralCode) : '';
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $showReferralDashboardModal}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
		on:click={closeModal}
		on:keydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				closeModal();
			}
		}}
		role="button"
		tabindex="0"
		aria-label="Close modal"
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
			aria-labelledby="dashboard-modal-title"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 px-6 py-4">
				<h2 id="dashboard-modal-title" class="text-lg font-semibold text-white">
					Referral Programme
				</h2>
				<button
					on:click={closeModal}
					class="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
					aria-label="Close"
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

			<!-- Tabs -->
			<ModalTabs {tabs} {activeTab} on:change={handleTabChange} />

			<!-- Content -->
			<div class="p-6">
				{#if activeTab === 'about'}
					<!-- About Tab Content -->
					<div class="space-y-6 text-sm text-gray-300">
						<div>
							<h3 class="mb-3 text-base font-semibold text-white">Referrals</h3>
							<div class="space-y-3">
								<p>
									Users can sign up to receive a personal referral code. Each user is issued a
									unique code along with a referral link, which can be shared with their network. To
									ensure referrals are properly tracked and eligible for rewards, new users must
									sign up using either the referral code or the referral link.
								</p>
								<p>
									Referrers currently earn 50% of the referred user's rewards. This elevated rate is
									intentionally set during the early stage of the platform to incentivise growth and
									reward early supporters. The referral percentage is expected to decrease over
									time.
								</p>
								<p>
									Referral rewards are paid in addition to the existing rewards pool and are not
									deducted from it.
								</p>
								<p>
									At present, referral codes are issued upon request and subject to approval by the
									ST0x team.
								</p>
							</div>
						</div>

						<div>
							<h3 class="mb-3 text-base font-semibold text-white">Rules and Eligibility</h3>
							<ul class="list-disc space-y-2 pl-5">
								<li>
									Referral rewards are earned in addition to the pool payouts, currently there is a
									0.5x multiplier, the multiplier will change month to month as set by the ST0x team
								</li>
								<li>Referrals rewards will be paid out in the same way as the point rewards</li>
							</ul>
						</div>
					</div>
				{:else if $referralLoading}
					<div class="flex items-center justify-center py-8">
						<div
							class="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-yellow-400"
						></div>
					</div>
				{:else if $referralProfile}
					<div class="space-y-6">
						<!-- Profile Info -->
						<div class="rounded-lg bg-gray-700/50 p-4">
							<div class="mb-3">
								{#if isEditingNickname}
									<!-- Editing nickname -->
									<div class="space-y-2">
										<div class="flex items-center gap-2">
											<input
												type="text"
												bind:value={newNickname}
												disabled={nicknameSaving}
												placeholder="New nickname"
												class="flex-1 rounded-lg border px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50 {nicknameValid
													? 'border-gray-600 bg-gray-800 focus:border-yellow-500 focus:ring-yellow-500'
													: 'border-red-500 bg-gray-800 focus:border-red-500 focus:ring-red-500'}"
											/>
											<button
												on:click={saveNickname}
												disabled={nicknameSaving || !nicknameValid || !newNickname.trim()}
												class="rounded-lg bg-yellow-500 p-1.5 text-black transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
												title="Save"
											>
												{#if nicknameSaving}
													<span
														class="block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black"
													></span>
												{:else}
													<svg
														class="h-4 w-4"
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
												{/if}
											</button>
											<button
												on:click={cancelEditingNickname}
												disabled={nicknameSaving}
												class="rounded-lg bg-gray-600 p-1.5 text-gray-300 transition-colors hover:bg-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
												title="Cancel"
											>
												<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M6 18L18 6M6 6l12 12"
													/>
												</svg>
											</button>
										</div>
										{#if !nicknameValid && newNickname}
											<p class="text-xs text-red-400">
												3-20 characters, letters, numbers, and underscores only
											</p>
										{/if}
										{#if nicknameError}
											<p class="text-xs text-red-400">{nicknameError}</p>
										{/if}
									</div>
								{:else}
									<!-- Display nickname -->
									<div class="flex items-center justify-between">
										<span class="text-sm text-gray-400">Welcome,</span>
										<div class="flex items-center gap-2">
											<span class="font-medium text-white">{$referralProfile.nickname}</span>
											<button
												on:click={startEditingNickname}
												class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-600 hover:text-white"
												title="Edit nickname"
											>
												<svg
													class="h-3.5 w-3.5"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
													/>
												</svg>
											</button>
										</div>
									</div>
								{/if}
							</div>

							<!-- Referral Code -->
							<div class="space-y-2">
								<span class="text-xs text-gray-400">Your Referral Code</span>
								<div class="flex items-center gap-2">
									<code class="flex-1 rounded-lg bg-gray-800 px-4 py-2 font-mono text-yellow-400">
										{$referralProfile.referralCode}
									</code>
									<button
										on:click={copyCode}
										class="rounded-lg bg-gray-800 p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
										title="Copy code"
										aria-label="Copy referral code"
									>
										{#if codeCopied}
											<svg
												class="h-5 w-5 text-green-400"
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
										{:else}
											<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
												/>
											</svg>
										{/if}
									</button>
								</div>
							</div>

							<!-- Share Link -->
							<div class="mt-3 space-y-2">
								<span class="text-xs text-gray-400">Share Link</span>
								<div class="flex items-center gap-2">
									<input
										type="text"
										readonly
										value={shareUrl}
										class="flex-1 truncate rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300"
									/>
									<button
										on:click={copyShareLink}
										class="rounded-lg bg-gray-800 p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
										title="Copy link"
										aria-label="Copy share link"
									>
										{#if linkCopied}
											<svg
												class="h-5 w-5 text-green-400"
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
										{:else}
											<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
												/>
											</svg>
										{/if}
									</button>
								</div>
							</div>
						</div>

						<!-- Performance Stats -->
						{#if $referralPerformance}
							<div class="rounded-lg bg-gray-700/50 p-4">
								<h3 class="mb-3 text-sm font-medium text-gray-300">Performance</h3>
								<div class="grid grid-cols-3 gap-4 text-center">
									<div>
										<p class="text-2xl font-bold text-white">
											{$referralPerformance.walletsReferred}
										</p>
										<p class="text-xs text-gray-400">Wallets Referred</p>
									</div>
									<div>
										<p class="text-2xl font-bold text-yellow-400">
											{formatPoints($referralPerformance.totalPoints)}
										</p>
										<p class="text-xs text-gray-400">Total Points</p>
									</div>
									<div>
										<p class="text-2xl font-bold text-green-400">
											{formatUsd($referralPerformance.projectedRewards)}
										</p>
										<p class="text-xs text-gray-400">Projected Rewards</p>
									</div>
								</div>
							</div>
						{/if}

						<!-- Info Box -->
						<div
							class="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-600 dark:text-blue-200"
						>
							<p>
								Your rewards are equal to 50% of the rewards received by wallets that sign up using
								your referral code.
							</p>
						</div>

						<!-- View Leaderboard Button -->
						<button
							on:click={openLeaderboard}
							class="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500/20 px-4 py-3 font-medium text-yellow-400 transition-colors hover:bg-yellow-500/30"
						>
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
								/>
							</svg>
							View Leaderboard
						</button>
					</div>
				{:else}
					<div class="py-8 text-center text-gray-400">
						<p>No referral profile found.</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
