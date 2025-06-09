<script>
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import { onMount } from 'svelte';
	import Footer from '$lib/components/Footer.svelte';

	let activeTimeframe = '30D';
	let showNotification = true;
	const TIMEFRAME_OPTIONS = ['7D', '30D', '90D', 'ALL'];

	// Mock Data
	const PLATFORM_STATS = [
		{ label: 'Total Assets', value: '1', change: 'Live on arbitrum' },
		{ label: 'Tokens Minted', value: '10,000', change: 'TSTOX tokens' },
		{ label: 'Tokens Redeemed', value: '150', change: 'Recent activity' },
		{ label: 'Tokens Circulating', value: '9.85k', change: 'Current supply' },
		{ label: 'Token Holders', value: '2', change: 'Active addresses' },
		{ label: 'Total Audits', value: '1', change: 'Verified proofs' },
		{ label: 'Token Transfers', value: '1', change: 'Last 24 hours' },
		{ label: 'Total Events', value: '13', change: 'All transactions' }
	];

	const TRADE_SUMMARY_DATA = [
		{
			period: 'Last 24 Hours',
			volume: '$2,847,293',
			trades: 47,
			change: '+12.4%',
			isPositive: true
		},
		{
			period: 'Last Week',
			volume: '$18,392,847',
			trades: 312,
			change: '+8.7%',
			isPositive: true
		},
		{
			period: 'Last Month',
			volume: '$67,294,825',
			trades: 1248,
			change: '+24.3%',
			isPositive: true
		}
	];

	const RECENT_PROOFS = [
		{
			id: 'ERC1155',
			title: 'Deposit Receipt ID 1',
			status: 'Verified',
			timestamp: '2 hours ago',
			depositor: '0xd284...c165',
			amount: '10,000 TSTOX',
			receiptId: '#1'
		},
		{
			id: 'ERC1156',
			title: 'Deposit Receipt ID 2',
			status: 'Verified',
			timestamp: '4 hours ago',
			depositor: '0xa742...9841',
			amount: '5,000 TSTOX',
			receiptId: '#2'
		},
		{
			id: 'ERC1157',
			title: 'Deposit Receipt ID 3',
			status: 'Verified',
			timestamp: '1 day ago',
			depositor: '0x1b3f...2a87',
			amount: '15,000 TSTOX',
			receiptId: '#3'
		},
		{
			id: 'ERC1158',
			title: 'Deposit Receipt ID 4',
			status: 'Pending',
			timestamp: '2 days ago',
			depositor: '0x9c5e...4d12',
			amount: '8,500 TSTOX',
			receiptId: '#4'
		},
		{
			id: 'ERC1159',
			title: 'Deposit Receipt ID 5',
			status: 'Verified',
			timestamp: '3 days ago',
			depositor: '0x7f8a...6e93',
			amount: '12,000 TSTOX',
			receiptId: '#5'
		}
	];

	const DOCUMENTATION_ITEMS = [
		{
			question: 'What is ST0x?',
			answer: 'ST0x is an onchain equities platform that tokenizes real-world assets.',
			link: '/docs/what-is-st0x',
			isOpen: false
		},
		{
			question: 'How does proof of reserves work?',
			answer: 'All tokens are backed by verifiable real-world assets with immutable proofs.',
			link: '/docs/proof-of-reserves',
			isOpen: false
		},
		{
			question: 'How to mint tokens?',
			answer: 'Use our mint interface to create new tokens backed by verified deposits.',
			link: '/docs/how-to-mint',
			isOpen: false
		},
		{
			question: 'What are the risks?',
			answer: 'Review our comprehensive risk disclosures and legal framework.',
			link: '/docs/risks',
			isOpen: false
		}
	];


	// Utility Classes
	const CARD_BASE_CLASSES =
		'bg-gray-700/30 rounded-xl border border-white/5 relative overflow-hidden group hover:border-yellow-500/30 transition-all';
	const GRADIENT_HOVER_CLASSES =
		'absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity';
	const SECTION_CLASSES = 'bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10';

	function setTimeframe(timeframe) {
		activeTimeframe = timeframe;
	}

	function toggleDocumentation(index) {
		DOCUMENTATION_ITEMS[index].isOpen = !DOCUMENTATION_ITEMS[index].isOpen;
	}

	onMount(() => {
		const notifTimeout = setTimeout(() => (showNotification = false), 5000);
		return () => clearTimeout(notifTimeout);
	});
</script>

<!-- Main Content -->
<div>
	<!-- Header -->
	<div class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-6 py-4 backdrop-blur-lg">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<div>
					<h1 class="text-xl font-bold">Dashboard</h1>
					<p class="text-sm text-gray-400">Welcome to ST0x</p>
				</div>
			</div>

			<div class="flex items-center gap-4">
				<WalletConnect />
			</div>
		</div>
	</div>

	<!-- Dashboard Content -->
	<div class="space-y-8 p-6">
		<!-- Hero Section -->
		<div class="relative overflow-hidden rounded-2xl">
			<!-- Background with gradient and pattern -->
			<div
				class="absolute inset-0 bg-gradient-to-br from-purple-600 via-blue-600 to-yellow-500 opacity-90"
			/>
			<div class="absolute inset-0 bg-gradient-to-r from-blue-900/50 to-purple-900/50" />

			<!-- Content -->
			<div class="relative px-12 py-12 text-center">
				<h1 class="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl">
					Your gateway to onchain equities
				</h1>

				<p class="mx-auto mb-8 max-w-3xl text-lg leading-relaxed text-blue-100 md:text-xl">
					Trade tokenized stocks on-chain with full transparency, 24/7 availability, and fractional
					ownership. The future of equities trading is here.
				</p>

				<button
					class="rounded-xl border border-white/30 bg-white/20 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-black/20 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-white/30"
				>
					Trade now
				</button>
			</div>
		</div>

		<!-- Platform Overview -->
		<div class={SECTION_CLASSES}>
			<div class="mb-6 flex items-center justify-between">
				<h2
					class="bg-gradient-to-r from-yellow-500 to-blue-500 bg-clip-text text-2xl font-bold text-transparent"
				>
					Platform Overview
				</h2>
				<!-- Timeframe Selector -->
				<div class="flex rounded-lg bg-white/5 p-0.5">
					{#each TIMEFRAME_OPTIONS as period}
						<button
							on:click={() => setTimeframe(period)}
							class="rounded-md px-3 py-1.5 text-xs font-medium transition-all {activeTimeframe ===
							period
								? 'bg-yellow-500/20 text-yellow-500'
								: 'text-gray-400 hover:text-white'}"
						>
							{period}
						</button>
					{/each}
				</div>
			</div>
			<div class="grid grid-cols-4 gap-4">
				{#each PLATFORM_STATS as metric, index}
					<!-- Metric Card -->
					<div class="{CARD_BASE_CLASSES} p-5">
						<div class={GRADIENT_HOVER_CLASSES} />
						<div class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
							{metric.label}
						</div>
						<div class="mb-2">
							<span class="block text-2xl font-bold">{metric.value}</span>
						</div>
						<div class="flex items-center gap-1 text-sm font-medium text-yellow-500">
							<span>↗</span>
							{metric.change}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Trade Summary -->
		<div class={SECTION_CLASSES}>
			<div class="mb-6 flex items-center justify-between">
				<div>
					<h2 class="text-xl font-semibold">Trade Summary</h2>
					<p class="text-sm text-gray-400">Volume and trades across different time periods</p>
				</div>
			</div>
			<div class="grid grid-cols-3 gap-6">
				{#each TRADE_SUMMARY_DATA as data, index}
					<!-- Trade Summary Card -->
					<div class="{CARD_BASE_CLASSES} p-6">
						<div class={GRADIENT_HOVER_CLASSES} />
						<div class="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
							{data.period}
						</div>
						<div class="space-y-4">
							<div>
								<div class="mb-1 text-sm text-gray-400">Volume</div>
								<div class="text-2xl font-bold">{data.volume}</div>
							</div>
							<div>
								<div class="mb-1 text-sm text-gray-400">Trades</div>
								<div class="text-xl font-semibold">{data.trades.toLocaleString()}</div>
							</div>
							<div
								class="flex items-center gap-1 text-sm font-medium {data.isPositive
									? 'text-green-500'
									: 'text-red-500'}"
							>
								<span>{data.isPositive ? '↑' : '↓'}</span>
								{data.change}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Charts Grid -->
		<div class="grid grid-cols-2 gap-6">
			<!-- Token Transfers -->
			<div class={SECTION_CLASSES}>
				<h3 class="mb-4 text-lg font-semibold">Token Transfers</h3>
				<p class="mb-6 text-sm text-gray-400">
					Total value of daily token transfers over the last 30 days
				</p>

				<div class="mb-6 h-48">
					<!-- Transfer Chart SVG -->
					<svg class="h-full w-full" viewBox="0 0 400 200">
						<defs>
							<linearGradient id="transferGradient" x1="0%" y1="0%" x2="0%" y2="100%">
								<stop offset="0%" stop-color="#3B82F6" stop-opacity="0.3" />
								<stop offset="100%" stop-color="#3B82F6" stop-opacity="0" />
							</linearGradient>
						</defs>
						<path
							d="M0,180 L50,180 L100,180 L150,180 L200,180 L250,180 L300,180 L350,60 L400,60 L400,200 L0,200 Z"
							fill="url(#transferGradient)"
						/>
						<path
							d="M0,180 L50,180 L100,180 L150,180 L200,180 L250,180 L300,180 L350,60 L400,60"
							stroke="#3B82F6"
							fill="none"
							stroke-width="2"
						/>
						<circle cx="350" cy="60" r="4" fill="#3B82F6" class="animate-pulse" />
					</svg>
				</div>

				<div class="grid grid-cols-2 gap-4 text-center">
					<div>
						<div class="text-xl font-bold">1</div>
						<div class="text-xs text-gray-400">Total Transfers</div>
					</div>
					<div>
						<div class="text-xl font-bold">10</div>
						<div class="text-xs text-gray-400">Total Transfers Value</div>
					</div>
				</div>
			</div>

			<!-- Deposits and Withdrawals -->
			<div class={SECTION_CLASSES}>
				<h3 class="mb-4 text-lg font-semibold">Deposits and Withdrawals</h3>
				<p class="mb-6 text-sm text-gray-400">Number of deposit and withdrawal events</p>

				<div class="mb-6 h-48">
					<!-- Deposits Chart SVG -->
					<svg class="h-full w-full" viewBox="0 0 400 200">
						<path d="M0,180 L350,180 L400,60" stroke="#22C55E" fill="none" stroke-width="2" />
						<path d="M0,180 L350,180 L400,80" stroke="#EF4444" fill="none" stroke-width="2" />
						<circle cx="400" cy="60" r="4" fill="#22C55E" />
						<circle cx="400" cy="80" r="4" fill="#EF4444" />
						<text x="10" y="15" fill="#22C55E" font-size="12">Deposits</text>
						<text x="10" y="35" fill="#EF4444" font-size="12">Withdrawals</text>
					</svg>
				</div>

				<div class="grid grid-cols-2 gap-4 text-center">
					<div>
						<div class="text-xl font-bold">1</div>
						<div class="text-xs text-gray-400">Deposits</div>
					</div>
					<div>
						<div class="text-xl font-bold">1</div>
						<div class="text-xs text-gray-400">Withdrawals</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Latest Proofs -->
		<div
			class="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-blue-900/30 via-purple-900/30 to-yellow-900/20 p-6 backdrop-blur-sm"
		>
			<div class="mb-6 flex items-center justify-between">
				<div>
					<h2 class="text-xl font-semibold">Latest Proofs</h2>
					<p class="text-sm text-gray-400">Top 5 most recent proof verifications</p>
				</div>
				<button
					class="rounded-lg border border-yellow-500 bg-yellow-500/20 px-4 py-2 text-sm font-medium text-yellow-500 transition-all hover:bg-yellow-500 hover:text-gray-900"
				>
					View All Proofs
				</button>
			</div>
			<div class="space-y-3">
				{#each RECENT_PROOFS as proof, index}
					<!-- Proof Card -->
					<div
						class="rounded-xl border border-white/5 bg-black/30 p-4 transition-all hover:border-blue-500/30"
					>
						<div class="mb-2 flex items-center justify-between">
							<div>
								<h4 class="text-sm font-semibold">{proof.title} - {proof.amount}</h4>
								<p class="text-xs text-gray-400">
									Depositor: {proof.depositor} • {proof.timestamp}
								</p>
							</div>
							<div class="flex items-center gap-2">
								<div
									class="h-2 w-2 rounded-full {proof.status === 'Verified'
										? 'bg-green-500'
										: 'bg-yellow-500'}"
								/>
								<a href="#" class="text-xs text-blue-400 transition-colors hover:text-blue-300">
									View Details
								</a>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Documentation -->
		<div class={SECTION_CLASSES}>
			<div class="mb-6 flex items-center justify-between">
				<div>
					<h2 class="text-xl font-semibold">Documentation</h2>
					<p class="text-sm text-gray-400">Links to all ST0x website explainers</p>
				</div>
				<button
					class="rounded-lg border border-blue-500 bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-500 transition-all hover:bg-blue-500 hover:text-white"
				>
					View All Docs
				</button>
			</div>
			<div class="space-y-2">
				{#each DOCUMENTATION_ITEMS as item, index}
					<!-- Documentation Item -->
					<div class="overflow-hidden rounded-lg border border-white/10">
						<button
							on:click={() => toggleDocumentation(index)}
							class="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-white/5"
						>
							<span class="font-medium">{item.question}</span>
							<span class="transition-transform {item.isOpen ? 'rotate-180' : ''}"> ↓ </span>
						</button>
						{#if item.isOpen}
							<div class="border-t border-white/10 px-6 pb-4">
								<p class="mb-3 text-sm text-gray-400">{item.answer}</p>
								<a
									href={item.link}
									class="text-sm text-yellow-500 transition-colors hover:text-yellow-400"
								>
									Learn more →
								</a>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Footer -->
	<Footer />
</div>

<!-- Notification Toast
{#if showNotification}
    <div class="fixed bottom-6 right-6 bg-gray-800 border border-white/10 rounded-xl p-4 flex items-center gap-3 shadow-2xl z-50 animate-slideIn">
        <div class="w-10 h-10 bg-gradient-to-br from-yellow-500 to-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">
        ST0x
        </div>
        <div>
        <h4 class="font-semibold">Welcome to ST0x</h4>
        <p class="text-sm text-gray-400">Onchain equities platform is live!</p>
        </div>
    </div>
{/if}
<svelte:head>
<style>
    @keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
    }
    
    .animate-slideIn {
    animation: slideIn 0.3s ease-out;
    }
</style>
</svelte:head> -->
