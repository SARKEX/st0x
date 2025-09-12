<script lang="ts">
  import PageContainer from '$lib/components/ui/PageContainer.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { enhance } from '$app/forms';
  export let data: { redirectTo: string };
  let username = '';
  let password = '';
  let error = '';
</script>

<div class="min-h-screen bg-gray-950 text-white">
  <PageContainer>
    <div class="mx-auto flex max-w-6xl flex-col gap-10 px-2 py-16 md:flex-row md:items-start md:gap-16 md:py-24">
      <div class="flex-1">
        <div class="mb-6">
          <img src="/images/logo-sidebar.svg" alt="ST0x Logo" class="h-10 w-auto" />
        </div>
        <h1 class="leading-tight tracking-[-0.02em] text-4xl font-semibold sm:text-6xl md:text-7xl">
          Your Gateway to
          <span class="bg-gradient-to-b from-[#f0c48b] to-[#e5b47a] bg-clip-text text-transparent">On-Chain</span>
          Equities
        </h1>
        <p class="mt-6 max-w-xl text-base text-gray-300 sm:text-lg">
          ST0x is the first blockchain-powered equities platform. 24/7 settlement. Built by pioneers.
        </p>
        <p class="mt-6 max-w-2xl text-sm text-gray-400">
          To comply with existing regulations, a login is required to access this page.
          Please contact us at
          <a class="text-[#e8be89] hover:underline" href="mailto:toby@st0x.io">toby@st0x.io</a>.
        </p>
      </div>

      <div class="w-full max-w-md md:pt-8">
        <Card>
          <form
            method="POST"
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === 'failure') {
                  error = 'Invalid username or password.';
                } else if (result.type === 'success' || result.type === 'redirect') {
                  window.location.href = data.redirectTo || '/';
                }
              };
            }}
            class="space-y-4"
          >
            <input type="hidden" name="redirectTo" value={data.redirectTo} />
            {#if error}
              <div class="rounded-md border border-red-900/40 bg-red-900/20 p-2 text-sm text-red-300">{error}</div>
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
            <Button type="submit" className="w-full" variant="primary">Sign in</Button>
          </form>
        </Card>
      </div>
    </div>
  </PageContainer>
  <div class="pointer-events-none fixed inset-0 -z-10 opacity-15">
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-yellow-700/10 via-gray-900 to-gray-950" />
  </div>
</div>
