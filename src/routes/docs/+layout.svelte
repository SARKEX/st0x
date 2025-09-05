<script lang="ts">
	import type { LayoutData } from './$types';
	import { wagmiConfig } from 'svelte-wagmi';
	import DocsSidebar from '$lib/components/DocsSidebar.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	export let data: LayoutData;

	let sidebarExpanded = true;
	let mobileSidebarOpen = false;

	// Prevent background scroll when mobile sidebar is open
	$: {
		if (mobileSidebarOpen) {
			document?.body?.classList.add('overflow-hidden');
		} else {
			document?.body?.classList.remove('overflow-hidden');
		}
	}
</script>

{#if $wagmiConfig}
	<div class="relative min-h-screen overflow-x-hidden bg-gray-900 text-white">
		<!-- Background Pattern -->
		<div class="pointer-events-none fixed inset-0 z-0 opacity-5">
			<div
				class="bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 2000 1000%27%3E%3Cpath d=%27M0,500 Q250,400 500,500 T1000,500 T1500,500 T2000,500%27 stroke=%27%23F3B13C%27 fill=%27none%27 stroke-width=%271%27 opacity=%270.3%27/%3E%3Cpath d=%27M0,400 Q250,300 500,400 T1000,400 T1500,400 T2000,400%27 stroke=%27%231A5C8E%27 fill=%27none%27 stroke-width=%271%27 opacity=%270.3%27/%3E%3Cpath d=%27M0,600 Q250,500 500,600 T1000,600 T1500,600 T2000,600%27 stroke=%27%2337134D%27 fill=%27none%27 stroke-width=%271%27 opacity=%270.3%27/%3E%3C/svg%3E')] h-full w-full bg-cover"
			/>
		</div>
		<!-- Always render for transition, pass visible prop -->
		<div class="lg:hidden">
			<DocsSidebar
				visible={mobileSidebarOpen}
				desktop={false}
				{data}
				on:close={() => (mobileSidebarOpen = false)}
			/>
		</div>
		<!-- Desktop sidebar -->
		<div class="fixed left-0 top-0 z-50 hidden h-full lg:block">
			<DocsSidebar visible={true} desktop={true} {data} />
		</div>

		<!-- Main Content -->
		<div
			class="transition-all duration-300"
			class:lg:ml-64={sidebarExpanded}
			class:lg:ml-16={!sidebarExpanded}
		>
			<!-- Mobile Header with Menu Button -->
			<div
				class="flex items-center justify-between border-b border-white/10 bg-gray-800/95 p-4 backdrop-blur-lg lg:hidden"
			>
				<Button
					variant="ghost"
					size="sm"
					className="rounded-lg border border-white/10 p-2 hover:bg-white/5"
					on:click={() => (mobileSidebarOpen = !mobileSidebarOpen)}
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6h16M4 12h16M4 18h16"
						/>
					</svg>
				</Button>
				<a href="/" aria-label="Go to home" class="flex items-center gap-2">
					<img
						src="https://st0x.io/_next/image?url=%2Fimages%2Flogo-circle.png&w=256&q=75"
						alt="ST0x Logo"
						class="h-8 w-8 rounded-full"
					/>
					<span
						class="bg-gradient-to-r from-yellow-400 via-blue-400 to-purple-500 bg-clip-text text-lg font-extrabold tracking-tight text-transparent"
					>
						ST0x
					</span>
				</a>
			</div>

			<!-- Header -->
			<Header title="Documentation" description="ST0x Platform Documentation" />

			<slot {sidebarExpanded} />

			<!-- Footer -->
			<Footer />
		</div>
	</div>
{:else}
	<LoadingSpinner variant="fullscreen" size="xl" text="Loading ST0x..." />
{/if}
