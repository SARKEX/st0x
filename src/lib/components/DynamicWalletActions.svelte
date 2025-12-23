<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import {
		dynamicSession,
		isDynamicAuthenticated,
		openSendFundsModal,
		exportDynamicWallet,
		logoutDynamic
	} from '$lib/stores/dynamicStore';

	export let showLogout = true;
	export let compact = false;

	function handleSend() {
		openSendFundsModal();
	}

	function handleExport() {
		exportDynamicWallet();
	}

	function handleLogout() {
		logoutDynamic();
	}
</script>

{#if $isDynamicAuthenticated && $dynamicSession}
	<div class="flex items-center gap-2">
		{#if compact}
			<!-- Compact mode: icon buttons only -->
			<button
				type="button"
				on:click={handleSend}
				class="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"
				title="Send funds"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
					/>
				</svg>
			</button>

			<button
				type="button"
				on:click={handleExport}
				class="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"
				title="Export private key"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
					/>
				</svg>
			</button>

			{#if showLogout}
				<button
					type="button"
					on:click={handleLogout}
					class="rounded-lg p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400"
					title="Log out"
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
			{/if}
		{:else}
			<!-- Full mode: buttons with labels -->
			<Button on:click={handleSend} variant="secondary" size="sm">
				<span class="flex items-center gap-1.5">
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
						/>
					</svg>
					Send
				</span>
			</Button>

			<Button on:click={handleExport} variant="ghost" size="sm">
				<span class="flex items-center gap-1.5">
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
						/>
					</svg>
					Export Key
				</span>
			</Button>

			{#if showLogout}
				<Button on:click={handleLogout} variant="ghost" size="sm">
					<span class="flex items-center gap-1.5 text-red-400">
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
							/>
						</svg>
						Log out
					</span>
				</Button>
			{/if}
		{/if}
	</div>
{/if}
