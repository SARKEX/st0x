<script lang="ts">
	import { page } from '$app/stores';
	import { navCollapsed, anySheetOpen } from '$lib/stores/uiStore';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/Icon.svelte';

	$: activePath = $page.url.pathname;

	type Tab = { href: string; label: string; icon: IconName; active: boolean };

	$: tabs = [
		{ href: '/', label: 'Home', icon: 'home', active: activePath === '/' },
		{
			href: '/markets',
			label: 'Markets',
			icon: 'blocks',
			active: activePath.startsWith('/markets')
		},
		{ href: '/dashboard', label: 'Wallet', icon: 'wallet', active: activePath === '/dashboard' },
		{
			href: '/platform-metrics',
			label: 'Metrics',
			icon: 'chart',
			active: activePath === '/platform-metrics'
		}
	] as Tab[];

	// The bottom bar is the primary nav once the header collapses. Hide it whenever
	// a bottom-sheet is up so the sheet's action button never sits behind it.
	$: show = $navCollapsed && !$anySheetOpen;
</script>

{#if show}
	<nav
		class="bg-bg/95 fixed inset-x-0 bottom-0 z-[9000] flex items-stretch justify-around border-t border-line backdrop-blur-xl"
		style="padding-bottom: env(safe-area-inset-bottom);"
		aria-label="Primary"
		data-sveltekit-preload-code="eager"
		data-sveltekit-preload-data="tap"
	>
		{#each tabs as tab}
			<a
				href={tab.href}
				aria-label={tab.label}
				aria-current={tab.active ? 'page' : undefined}
				class="relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors {tab.active
					? 'text-text'
					: 'text-text-3'}"
			>
				{#if tab.active}
					<span class="bg-text/70 absolute top-0 h-0.5 w-7 rounded-full"></span>
				{/if}
				<span>
					<Icon name={tab.icon} className="h-[22px] w-[22px]" stroke={tab.active ? 2 : 1.6} />
				</span>
				{tab.label}
			</a>
		{/each}
	</nav>
{/if}
