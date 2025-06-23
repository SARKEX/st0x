<script lang="ts">
    import WalletConnect from '$lib/components/WalletConnect.svelte';
    import { goto } from '$app/navigation';

    export let title: string;
    export let description: string;

</script>

<div
    class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-6 py-4 backdrop-blur-lg"
>
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
            <div>
                <h1 class="text-xl font-bold">{title}</h1>
                <p class="text-sm text-gray-400">{description}</p>
            </div>
        </div>

        <div class="flex items-center gap-4">
            <button
                class="rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-105"
                on:click={() => goto('/neworder')}
            >
                Trade now
            </button>
            <WalletConnect />
        </div>
    </div>
</div>