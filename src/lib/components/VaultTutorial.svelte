<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { fade, fly } from 'svelte/transition';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		vaultTutorialActive,
		vaultTutorialStep,
		nextVaultTutorialStep,
		skipVaultTutorial,
		completeVaultTutorial,
		currentVaultStepInfo,
		vaultTutorialHighlightDex,
		vaultTutorialDexTab,
		type VaultTutorialStep
	} from '$lib/stores/vaultTutorialStore';

	// Callback to change DEX activity tab
	export let onSelectDexTab: ((tab: 'orders' | 'vaults') => void) | undefined = undefined;

	// Element positioning for highlighting
	let targetRect: DOMRect | null = null;
	let tooltipPosition: {
		top: number;
		left: number;
		arrowPosition: 'top' | 'bottom' | 'left' | 'right';
	} = {
		top: 0,
		left: 0,
		arrowPosition: 'top'
	};

	// Step content configuration
	const stepContent: Record<
		VaultTutorialStep,
		{
			title: string;
			description: string;
			targetSelector?: string;
			buttonText: string;
			isModal?: boolean;
			highlightDex?: boolean;
			selectTab?: 'orders' | 'vaults';
		}
	> = {
		intro: {
			title: 'Understanding Vaults',
			description: 'Limit orders and DCAs make use of vaults. Click continue to learn more.',
			buttonText: 'Continue',
			isModal: true
		},
		'vault-deposit': {
			title: 'Vault Deposits',
			description:
				'When you deploy a limit order or DCA, your spending budget gets placed into a vault so that it is available for trades.',
			buttonText: 'Next',
			isModal: true
		},
		'cancel-order': {
			title: 'Withdrawing Unspent Funds',
			description:
				'To withdraw unspent funds from vaults, cancel the order and go through the signing steps to return the funds to your wallet.',
			targetSelector: '[data-tutorial="dex-activity"]',
			buttonText: 'Next',
			highlightDex: true,
			selectTab: 'orders'
		},
		receipts: {
			title: 'Trade Receipts',
			description:
				'Your receipts (tStocks if buying or USDC if selling) are also placed into a vault and need to be withdrawn as well.',
			buttonText: 'Next',
			isModal: true
		},
		holdings: {
			title: 'View Your Holdings',
			description: 'You can view your tStock holdings and withdraw from vaults here.',
			targetSelector: '[data-tutorial="dex-activity"]',
			buttonText: 'Next',
			highlightDex: true,
			selectTab: 'vaults'
		},
		dashboard: {
			title: 'Dashboard Management',
			description: 'Orders and vaults can also be managed directly in your dashboard.',
			buttonText: 'Got it!',
			isModal: true
		},
		complete: {
			title: '',
			description: '',
			buttonText: ''
		}
	};

	// Find and position tooltip relative to target element
	function updateTargetPosition() {
		if (!browser) return;

		const step = $vaultTutorialStep;
		const content = stepContent[step];

		if (content.isModal || !content.targetSelector) {
			targetRect = null;
			return;
		}

		const target = document.querySelector(content.targetSelector);
		if (target) {
			// Scroll to element
			target.scrollIntoView({ behavior: 'smooth', block: 'center' });
			// Wait for scroll to complete before getting position
			setTimeout(() => {
				const updatedTarget = document.querySelector(content.targetSelector!);
				if (updatedTarget) {
					targetRect = updatedTarget.getBoundingClientRect();
					calculateTooltipPosition();
				}
			}, 500);
		} else {
			targetRect = null;
		}
	}

	function calculateTooltipPosition() {
		if (!targetRect || !browser) return;

		const tooltipWidth = 320;
		const tooltipHeight = 150;
		const padding = 16;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let top = 0;
		let left = 0;
		let arrowPosition: 'top' | 'bottom' | 'left' | 'right' = 'top';

		// Try to position below the element
		if (targetRect.bottom + tooltipHeight + padding < viewportHeight) {
			top = targetRect.bottom + padding;
			left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
			arrowPosition = 'top';
		}
		// Try to position above
		else if (targetRect.top - tooltipHeight - padding > 0) {
			top = targetRect.top - tooltipHeight - padding;
			left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
			arrowPosition = 'bottom';
		}
		// Try to position to the right
		else if (targetRect.right + tooltipWidth + padding < viewportWidth) {
			top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
			left = targetRect.right + padding;
			arrowPosition = 'left';
		}
		// Position to the left
		else {
			top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
			left = targetRect.left - tooltipWidth - padding;
			arrowPosition = 'right';
		}

		// Keep within viewport bounds
		left = Math.max(padding, Math.min(left, viewportWidth - tooltipWidth - padding));
		top = Math.max(padding, Math.min(top, viewportHeight - tooltipHeight - padding));

		tooltipPosition = { top, left, arrowPosition };
	}

	function handleNext() {
		const next = nextVaultTutorialStep();
		if (next === 'complete') {
			completeVaultTutorial();
		} else {
			// Update highlighting and tab selection for next step
			const nextContent = stepContent[next];
			vaultTutorialHighlightDex.set(nextContent.highlightDex ?? false);
			if (nextContent.selectTab && onSelectDexTab) {
				vaultTutorialDexTab.set(nextContent.selectTab);
				onSelectDexTab(nextContent.selectTab);
			} else {
				vaultTutorialDexTab.set(null);
			}
			// Wait a tick for any DOM updates
			setTimeout(updateTargetPosition, 100);
		}
	}

	function handleSkip() {
		skipVaultTutorial();
	}

	// Update position on step change
	$: if (browser && $vaultTutorialStep) {
		const content = stepContent[$vaultTutorialStep];
		vaultTutorialHighlightDex.set(content.highlightDex ?? false);
		if (content.selectTab && onSelectDexTab) {
			vaultTutorialDexTab.set(content.selectTab);
			onSelectDexTab(content.selectTab);
		}
		setTimeout(updateTargetPosition, 100);
	}

	// Update position on resize/scroll
	onMount(() => {
		if (browser) {
			window.addEventListener('resize', updateTargetPosition);
			window.addEventListener('scroll', updateTargetPosition, true);
			updateTargetPosition();
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('resize', updateTargetPosition);
			window.removeEventListener('scroll', updateTargetPosition, true);
		}
	});

	$: content = stepContent[$vaultTutorialStep];
	$: isModal = content?.isModal || !targetRect;
	$: showTutorial = $vaultTutorialActive && $vaultTutorialStep !== 'complete';
</script>

{#if showTutorial}
	<!-- Overlay -->
	<div class="fixed inset-0 z-[9000]" transition:fade={{ duration: 200 }}>
		<!-- Dark overlay with cutout for target element -->
		{#if targetRect && !isModal}
			<svg class="absolute inset-0 h-full w-full">
				<defs>
					<mask id="vault-tutorial-mask">
						<rect x="0" y="0" width="100%" height="100%" fill="white" />
						<rect
							x={targetRect.left - 8}
							y={targetRect.top - 8}
							width={targetRect.width + 16}
							height={targetRect.height + 16}
							rx="8"
							fill="black"
						/>
					</mask>
				</defs>
				<rect
					x="0"
					y="0"
					width="100%"
					height="100%"
					fill="rgba(0, 0, 0, 0.75)"
					mask="url(#vault-tutorial-mask)"
				/>
			</svg>

			<!-- Highlight border around target -->
			<div
				class="pointer-events-none absolute rounded-lg border-2 border-brand-gold-500 shadow-[0_0_20px_rgba(234,179,8,0.3)]"
				style="
					left: {targetRect.left - 8}px;
					top: {targetRect.top - 8}px;
					width: {targetRect.width + 16}px;
					height: {targetRect.height + 16}px;
				"
			/>

			<!-- Tooltip -->
			<div
				class="absolute z-[9001] w-80 rounded-xl border border-white/10 bg-gray-800 p-4 shadow-2xl"
				style="left: {tooltipPosition.left}px; top: {tooltipPosition.top}px;"
				transition:fly={{ y: 10, duration: 200 }}
			>
				<!-- Arrow -->
				{#if tooltipPosition.arrowPosition === 'top'}
					<div
						class="absolute h-3 w-3 rotate-45 border-r border-t border-white/10 bg-gray-800"
						style="top: -6px; left: 50%; transform: translateX(-50%);"
					/>
				{:else if tooltipPosition.arrowPosition === 'bottom'}
					<div
						class="absolute h-3 w-3 rotate-45 border-b border-l border-white/10 bg-gray-800"
						style="bottom: -6px; left: 50%; transform: translateX(-50%);"
					/>
				{:else if tooltipPosition.arrowPosition === 'left'}
					<div
						class="absolute h-3 w-3 rotate-45 border-b border-r border-white/10 bg-gray-800"
						style="left: -6px; top: 50%; transform: translateY(-50%);"
					/>
				{:else}
					<div
						class="absolute h-3 w-3 rotate-45 border-l border-t border-white/10 bg-gray-800"
						style="right: -6px; top: 50%; transform: translateY(-50%);"
					/>
				{/if}

				<h3 class="mb-2 text-lg font-semibold text-white">{content.title}</h3>
				<p class="mb-4 text-sm text-gray-300">{content.description}</p>

				<div class="flex items-center justify-between">
					<button
						on:click={handleSkip}
						class="text-sm text-gray-400 transition-colors hover:text-white"
					>
						Skip
					</button>
					<div class="flex items-center gap-3">
						<span class="text-xs text-gray-400">
							{$currentVaultStepInfo.index + 1} / {$currentVaultStepInfo.total}
						</span>
						<Button on:click={handleNext} variant="primary" size="sm">
							{content.buttonText}
						</Button>
					</div>
				</div>
			</div>
		{:else}
			<!-- Full overlay for modal steps -->
			<button
				type="button"
				class="absolute inset-0 bg-black/75"
				on:click={handleSkip}
				aria-label="Skip tutorial"
			/>

			<!-- Centered modal -->
			<div
				class="absolute left-1/2 top-1/2 z-[9001] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-gray-800 p-6 shadow-2xl"
				transition:fly={{ y: 20, duration: 300 }}
			>
				<div class="mb-6 text-center">
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20"
					>
						<svg
							class="h-8 w-8 text-blue-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
							/>
						</svg>
					</div>
					<h2 class="mb-2 text-2xl font-bold text-white">{content.title}</h2>
					<p class="text-gray-300">{content.description}</p>
				</div>

				<div class="flex flex-col gap-3">
					<Button on:click={handleNext} variant="primary" fullWidth>
						{content.buttonText}
					</Button>
					<button
						on:click={handleSkip}
						class="text-sm text-gray-400 transition-colors hover:text-white"
					>
						Skip tutorial
					</button>
				</div>

				<div class="mt-4 text-center text-xs text-gray-400">
					Step {$currentVaultStepInfo.index + 1} of {$currentVaultStepInfo.total}
				</div>
			</div>
		{/if}
	</div>
{/if}
