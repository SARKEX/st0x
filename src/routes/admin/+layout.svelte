<script lang="ts">
	import { page } from '$app/stores';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import type { LayoutData } from './$types';

	export let data: LayoutData;

	const navItems = [
		{ href: '/admin', label: 'On-chain Market' },
		{ href: '/admin/rewards', label: 'Rewards' },
		{ href: '/admin/referrals', label: 'Referrals' },
		{ href: '/admin/codes', label: 'Access Codes' }
	];
</script>

<svelte:head>
	<title>Admin | ST0X</title>
</svelte:head>

{#if data.authenticated}
	<div class="min-h-screen bg-gray-950 text-white">
		<!-- Admin Header -->
		<header class="border-b border-gray-800 bg-gray-900/50">
			<div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
				<div class="flex items-center gap-6">
					<a href="/admin" class="flex items-center gap-2">
						<img src="/images/logo-sidebar.svg" alt="ST0x Logo" class="h-8 w-auto" />
						<span class="text-sm font-medium text-gray-400">Admin</span>
					</a>
					<nav class="flex gap-1">
						{#each navItems as item}
							<a
								href={item.href}
								class="rounded-md px-3 py-2 text-sm transition-colors {$page.url.pathname ===
								item.href
									? 'bg-gray-800 text-white'
									: 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}"
							>
								{item.label}
							</a>
						{/each}
					</nav>
				</div>
				<form action="/admin/logout" method="POST">
					<button
						type="submit"
						class="rounded-md px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
					>
						Logout
					</button>
				</form>
			</div>
		</header>

		<!-- Main Content -->
		<main>
			<PageContainer>
				<slot />
			</PageContainer>
		</main>
	</div>
{:else}
	<slot />
{/if}
