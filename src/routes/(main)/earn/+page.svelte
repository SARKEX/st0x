<script lang="ts">
	// /earn — the Save & Earn (SGOV) marketing hub. Composes the ported earn
	// sections in the design-ref order.
	import Footer from '$lib/components/Footer.svelte';
	import EarnHero from '$lib/components/earn/EarnHero.svelte';
	import EarnPillars from '$lib/components/earn/EarnPillars.svelte';
	import TreasuryComparison from '$lib/components/earn/TreasuryComparison.svelte';
	import EarnCalculator from '$lib/components/earn/EarnCalculator.svelte';
	import ChooseYield from '$lib/components/earn/ChooseYield.svelte';
	import HowItWorks from '$lib/components/earn/HowItWorks.svelte';
	import FaqAccordion from '$lib/components/earn/FaqAccordion.svelte';
	import EarnCTA from '$lib/components/earn/EarnCTA.svelte';
</script>

<svelte:head>
	<title>Earn · st0x</title>
</svelte:head>

<div>
	<div class="pb-12">
		<EarnHero />
		<EarnPillars />
		<section id="earn-compare" class="mx-auto max-w-5xl px-6 py-6"><TreasuryComparison /></section>
		<section class="mx-auto max-w-5xl px-6 py-6"><EarnCalculator /></section>
		<section class="mx-auto max-w-5xl px-6 py-6"><ChooseYield /></section>
		<HowItWorks />
		<section class="mx-auto max-w-5xl px-6 py-8">
			<h2 class="mb-6 text-center text-xl font-semibold text-text">Questions, answered</h2>
			<FaqAccordion />
		</section>
		<EarnCTA />
	</div>
	<Footer />
</div>
