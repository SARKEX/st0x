<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		tutorialActive,
		tutorialStep,
		nextTutorialStep,
		skipTutorial,
		completeTutorial,
		currentStepInfo,
		tutorialWantsTradePanel,
		type TutorialStep
	} from '$lib/stores/tutorialStore';
	import { globalPoolApy, fetchGlobalPoolApy } from '$lib/stores/rewardsStore';

	// Element positioning - support multiple target elements
	let targetRects: DOMRect[] = [];
	let tooltipPosition: {
		top: number;
		left: number;
		arrowPosition: 'top' | 'bottom' | 'left' | 'right';
	} = {
		top: 0,
		left: 0,
		arrowPosition: 'top'
	};

	// Step content configuration - targetSelectors can be a single selector or array
	const stepContent: Record<
		TutorialStep,
		{
			title: string;
			description: string;
			targetSelector?: string | string[];
			buttonText: string;
			isModal?: boolean;
			isPromo?: boolean;
		}
	> = {
		promo: {
			title: '',
			description: '',
			buttonText: '',
			isPromo: true
		},
		welcome: {
			title: 'Welcome to ST0x',
			description:
				'U.S. equities on-chain. Fully decentralised. Fully backed by real equities. 24/7 trading.',
			buttonText: 'Next',
			isModal: true
		},
		'boost-rewards': {
			title: 'Boost Rewards',
			description:
				'Earn monthly rewards for investing in real companies. Click this button to learn more.',
			targetSelector: '[data-tutorial="boost-rewards"]',
			buttonText: 'Next'
		},
		'token-list': {
			title: 'Tradeable Equities',
			description: 'Currently tradeable equities. More coming soon.',
			targetSelector: '[data-tutorial="token-list"]',
			buttonText: 'Next'
		},
		'navigate-trade': {
			title: 'Ready to Trade',
			description: "Let's explore the trading interface.",
			buttonText: 'Go to Trade',
			isModal: true
		},
		'buy-sell-panel': {
			title: 'Place Orders',
			description:
				'Click Buy or Sell to open the order panel. Choose between market orders, limit orders, and DCAs. All orders are against USDC on Base.',
			targetSelector: ['[data-tutorial="buy-sell-buttons"]', '[data-tutorial="trade-panel"]'],
			buttonText: 'Next'
		},
		tradingview: {
			title: 'Live Market Data',
			description: 'Live US exchange data on the underlying equity.',
			targetSelector: ['[data-tutorial="symbol-overview"]', '[data-tutorial="tradingview"]'],
			buttonText: 'Next'
		},
		'dex-activity': {
			title: 'DEX Activity',
			description: 'On-chain orderbook and transaction data, including your orders and holdings.',
			targetSelector: '[data-tutorial="dex-activity"]',
			buttonText: 'Next'
		},
		fundamentals: {
			title: 'Learn More',
			description: 'Explore the underlying equity details or token fundamentals.',
			targetSelector: '[data-tutorial="fundamentals"]',
			buttonText: 'Finish'
		},
		complete: {
			title: '',
			description: '',
			buttonText: ''
		}
	};

	// Find and position tooltip relative to target element(s)
	function updateTargetPosition() {
		if (!browser) return;

		const step = $tutorialStep;
		const content = stepContent[step];

		if (content.isModal || !content.targetSelector) {
			targetRects = [];
			return;
		}

		// Normalize to array of selectors
		const selectors = Array.isArray(content.targetSelector)
			? content.targetSelector
			: [content.targetSelector];

		const rects: DOMRect[] = [];
		for (const selector of selectors) {
			const target = document.querySelector(selector);
			if (target) {
				rects.push(target.getBoundingClientRect());
			}
		}

		if (rects.length > 0) {
			// Scroll to element if it's the fundamentals or dex-activity step
			if (step === 'fundamentals' || step === 'dex-activity') {
				const firstTarget = document.querySelector(selectors[0]);
				firstTarget?.scrollIntoView({ behavior: 'smooth', block: 'center' });
				// Wait for scroll to complete before getting position
				setTimeout(() => {
					const updatedRects: DOMRect[] = [];
					for (const selector of selectors) {
						const target = document.querySelector(selector);
						if (target) {
							updatedRects.push(target.getBoundingClientRect());
						}
					}
					targetRects = updatedRects;
					calculateTooltipPosition();
				}, 500);
			} else if (step === 'buy-sell-panel') {
				// Scroll down slightly to properly align the buy/sell button selection
				window.scrollTo({ top: 50, behavior: 'smooth' });
				// Wait for scroll to complete before getting position
				setTimeout(() => {
					const updatedRects: DOMRect[] = [];
					for (const selector of selectors) {
						const target = document.querySelector(selector);
						if (target) {
							updatedRects.push(target.getBoundingClientRect());
						}
					}
					targetRects = updatedRects;
					calculateTooltipPosition();
				}, 300);
			} else {
				targetRects = rects;
				calculateTooltipPosition();
			}
		} else {
			targetRects = [];
		}
	}

	function calculateTooltipPosition() {
		// Use first target rect for tooltip positioning
		const targetRect = targetRects[0];
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

	async function handleNext() {
		const step = $tutorialStep;

		// Special handling for navigation step
		if (step === 'navigate-trade') {
			// Navigate to trade page for tSPLG
			await goto('/trade/0x2289249984f1fa2ce86c4e8867e7eb819ea7df95');
			nextTutorialStep();
			// Wait for page to render before finding elements
			setTimeout(updateTargetPosition, 500);
			return;
		}

		const next = nextTutorialStep();
		if (next === 'complete') {
			// Navigate back to home page before completing
			await goto('/');
			completeTutorial();
		} else {
			// Wait a tick for any DOM updates
			setTimeout(updateTargetPosition, 100);
		}
	}

	function handleSkip() {
		skipTutorial();
	}

	// Update position on step change
	$: if (browser && $tutorialStep) {
		setTimeout(updateTargetPosition, 100);
	}

	// Control trade panel visibility based on tutorial step
	$: if (browser) {
		tutorialWantsTradePanel.set($tutorialStep === 'buy-sell-panel');
	}

	// Update position on resize/scroll
	onMount(() => {
		if (browser) {
			window.addEventListener('resize', updateTargetPosition);
			window.addEventListener('resize', updatePromoFontSize);
			window.addEventListener('scroll', updateTargetPosition, true);
			updateTargetPosition();
			// Fetch global pool APY for the promo step
			fetchGlobalPoolApy();
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('resize', updateTargetPosition);
			window.removeEventListener('resize', updatePromoFontSize);
			window.removeEventListener('scroll', updateTargetPosition, true);
		}
	});

	$: content = stepContent[$tutorialStep];
	$: isModal = content?.isModal || targetRects.length === 0;
	$: isPromo = content?.isPromo || false;
	$: showTutorial = $tutorialActive && $tutorialStep !== 'complete';

	// Format APY for display in promo (no truncation to K)
	$: promoApyText = $globalPoolApy ? `${Math.round($globalPoolApy)}%` : '300%';

	// Track promo image size for scaling text
	let promoImageEl: HTMLImageElement;
	let promoFontSize = '1rem';

	function updatePromoFontSize() {
		if (promoImageEl) {
			// Scale font size based on rendered image width
			// ~1.4rem (22px) looks good at ~400px width, so use 5.5% of width
			const scaledSize = promoImageEl.clientWidth * 0.045;
			promoFontSize = `${Math.max(14, scaledSize)}px`;
		}
	}
</script>

{#if showTutorial}
	<!-- Overlay -->
	<div class="fixed inset-0 z-[9000]" transition:fade={{ duration: 200 }}>
		<!-- Promo screen with image and dynamic APY -->
		{#if isPromo}
			<button
				type="button"
				class="absolute inset-0 flex items-center justify-center bg-black/75"
				on:click={handleNext}
				aria-label="Continue to tutorial"
			>
				<div class="relative max-h-[72vh] max-w-[72vw]">
					<img
						bind:this={promoImageEl}
						on:load={updatePromoFontSize}
						src="/images/promo-boost.png"
						alt="Boost Rewards Promo"
						class="max-h-[72vh] max-w-[72vw] object-contain"
					/>
					<!-- Dynamic APY overlay positioned after "CURRENT APY IS" -->
					<div
						class="absolute flex items-center justify-center"
						style="
							top: 52.2%;
							left: 68%;
							transform: translate(-50%, -50%);
							width: 100%;
						"
					>
						<span
							class="font-bold text-[#c084fc]"
							style="
								font-size: {promoFontSize};
								text-shadow: 0 0 20px rgba(192, 132, 252, 0.6);
								letter-spacing: 0.02em;
							"
						>
							{promoApyText}
						</span>
					</div>
				</div>
			</button>
			<!-- Dark overlay with cutout for target element(s) -->
		{:else if targetRects.length > 0 && !isModal}
			<svg class="absolute inset-0 h-full w-full">
				<defs>
					<mask id="tutorial-mask">
						<rect x="0" y="0" width="100%" height="100%" fill="white" />
						{#each targetRects as rect}
							<rect
								x={rect.left - 8}
								y={rect.top - 8}
								width={rect.width + 16}
								height={rect.height + 16}
								rx="8"
								fill="black"
							/>
						{/each}
					</mask>
				</defs>
				<rect
					x="0"
					y="0"
					width="100%"
					height="100%"
					fill="rgba(0, 0, 0, 0.75)"
					mask="url(#tutorial-mask)"
				/>
			</svg>

			<!-- Highlight border around each target -->
			{#each targetRects as rect}
				<div
					class="pointer-events-none absolute rounded-lg border-2 border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.3)]"
					style="
						left: {rect.left - 8}px;
						top: {rect.top - 8}px;
						width: {rect.width + 16}px;
						height: {rect.height + 16}px;
					"
				/>
			{/each}

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
						Skip tutorial
					</button>
					<div class="flex items-center gap-3">
						<span class="text-xs text-gray-500">
							{$currentStepInfo.index + 1} / {$currentStepInfo.total}
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
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/20"
					>
						<svg
							class="h-8 w-8 text-yellow-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 10V3L4 14h7v7l9-11h-7z"
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

				{#if $currentStepInfo.index > 0}
					<div class="mt-4 text-center text-xs text-gray-500">
						Step {$currentStepInfo.index + 1} of {$currentStepInfo.total}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}
