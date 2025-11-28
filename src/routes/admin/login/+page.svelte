<script lang="ts">
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { enhance } from '$app/forms';

	let username = '';
	let password = '';
	let error = '';
</script>

<svelte:head>
	<title>Admin Login | ST0X</title>
</svelte:head>

<div class="min-h-screen bg-gray-950 text-white">
	<PageContainer>
		<div class="mx-auto flex max-w-md flex-col gap-6 px-2 py-16 md:py-24">
			<div class="text-center">
				<img src="/images/logo-sidebar.svg" alt="ST0x Logo" class="mx-auto h-10 w-auto" />
				<h1 class="mt-6 text-2xl font-semibold">Admin Login</h1>
				<p class="mt-2 text-sm text-gray-400">Access the code management dashboard</p>
			</div>

			<Card>
				<form
					method="POST"
					use:enhance={() => {
						return async ({ result }) => {
							if (result.type === 'failure') {
								error = 'Invalid username or password.';
							} else if (result.type === 'redirect') {
								window.location.href = '/admin';
							}
						};
					}}
					class="space-y-4"
				>
					{#if error}
						<div class="rounded-md border border-red-900/40 bg-red-900/20 p-2 text-sm text-red-300">
							{error}
						</div>
					{/if}
					<div>
						<label for="username" class="mb-1 block text-sm text-gray-300">Username</label>
						<input
							id="username"
							name="username"
							bind:value={username}
							autocomplete="username"
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							placeholder="Enter username"
							required
						/>
					</div>
					<div>
						<label for="password" class="mb-1 block text-sm text-gray-300">Password</label>
						<input
							type="password"
							id="password"
							name="password"
							bind:value={password}
							autocomplete="current-password"
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							placeholder="Enter password"
							required
						/>
					</div>
					<Button type="submit" className="w-full" variant="primary">Login</Button>
				</form>
			</Card>
		</div>
	</PageContainer>

	<div class="pointer-events-none fixed inset-0 -z-10 opacity-15">
		<div
			class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-yellow-700/10 via-gray-900 to-gray-950"
		/>
	</div>
</div>
