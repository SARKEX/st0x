<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	
	// Redirect to dashboard
	onMount(() => {
		goto('/dashboard', { replaceState: true });
	});
</script>

<div class="flex h-screen items-center justify-center">
	<p class="text-gray-400">Redirecting to dashboard...</p>
</div>