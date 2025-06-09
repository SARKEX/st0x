<script lang="ts">
	import Button from "$lib/components/Button.svelte";
	import Input from "$lib/components/Input.svelte";
	import Select from "$lib/components/Select.svelte";
	import { createQuery } from '@tanstack/svelte-query';
	import { signerAddress } from 'svelte-wagmi';
	import { getVault } from "$lib/query";

    let activeTab = 0;
    const tabs = ['Initiate Transfer', 'Transfer History', 'Terms & Conditions'];
	let selectedTab = 'Initiate Transfer';
	let selectedStockSymbol = 'TSLA';
	let selectedBrokerage = 'Interactive Brokers';

	const address = "0x6696E32EbD293783bCb4b4f157Da02A65789e38e"
	const subgraphUrl = "https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-arbitrum-one/1.0.0/gn"

	$: vaultQuery = createQuery({
		queryKey: ['getVault', address, subgraphUrl],
		queryFn: () => {
			return getVault(address, subgraphUrl as string);
		}
	});

	$: console.log("test : ", $vaultQuery.data);
</script>

<div class="w-full max-w-8xl mx-auto px-4 py-8">
	<div class="bg-gray-800/95 rounded-lg p-6 shadow-lg">
		<div class="mb-8">
			<div class="flex flex-wrap gap-2 border-b border-gray-700">
				{#each tabs as tab}
					<button
						class="px-4 py-3 text-sm font-medium transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-gray-800 rounded-t-lg {selectedTab ===
						tab
							? 'text-yellow-400'
							: 'text-gray-400 hover:text-yellow-400'}"
						on:click={() => (selectedTab = tab)}
						data-testid={tab === 'Initiate Transfer'
							? 'tab-initiate-transfer'
							: tab === 'Transfer History'
								? 'tab-transfer-history'
								: tab === 'Terms & Conditions'
									? 'tab-terms-and-conditions'
									: undefined}
					>
						{tab}   
					</button>
				{/each}
			</div>
		</div>

		<!-- Content Sections -->
		<div class="mt-6">
			{#if selectedTab === 'Initiate Transfer'}
				<div class="space-y-6">
					<!-- Step Header -->
					<div class="flex items-center space-x-4">
						<div class="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-700 text-white font-bold text-lg">1</div>
						<div>
							<div class="text-xl font-semibold text-white">Initiate Share Transfer</div>
							<div class="text-gray-400 text-sm">Start the tokenization process</div>
						</div>
					</div>

					<!-- Transfer Process Description -->
					<div class="bg-blue-900/90 rounded-lg p-6 text-gray-200 text-sm space-y-2 border border-blue-800">
						<div class="font-semibold text-base text-white mb-1">Transfer Process Description</div>
						<ul class="list-disc list-inside space-y-1">
							<li>You initiate the transfer at your broker</li>
							<li>Shares are transferred to SARKEX custody account</li>
							<li>Transfer happens off-chain through traditional channels</li>
							<li>Processing time: 1-3 business days</li>
							<li><span class="font-bold text-white">Once processed, SARKEX will automatically transfer tokens to the wallet address you provide here</span></li>
							<li><span class="font-bold text-white">Nothing further required from you</span></li>
							<li>If the transfer fails, shares will be returned to your account</li>
							<li>For any issues, please contact SARKEX customer support</li>
						</ul>
					</div>

					<!-- Form Fields -->
					<div class="space-y-5">
						<div class="flex flex-col gap-2">
							<span class="block text-gray-300 text-sm mb-1">Stock Symbol</span>
							<Select
								options={['TSLA', 'AAPL', 'MSFT']}
								bind:selected={selectedStockSymbol}
								getOptionLabel={(option) => option}
							/>
						</div>
						<div class="flex flex-col gap-2">
							<span class="block text-gray-300 text-sm mb-1">Quantity</span>
							<Input
								type="number"
								class="h-8 w-full border-none bg-gray-800/95 text-white"
							/>
						</div>
						<div class="flex flex-col gap-2">
							<span class="block text-gray-300 text-sm mb-1">From Brokerage</span>
							<Select
								options={['Interactive Brokers', 'Charles Schwab', 'Fidelity']}
								bind:selected={selectedBrokerage}
								getOptionLabel={(option) => option}
							/>
						</div>
						<div class="flex flex-col gap-2">
							<span class="block text-gray-300 text-sm mb-1">Your Wallet Address : {$signerAddress}</span>
						</div>
						<button
							class="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold py-3 rounded mt-2 transition-colors duration-200"
						>
							Transfer
						</button>
					</div>
				</div>
			{/if}

			{#if selectedTab === 'Transfer History'}
				<div class="space-y-6">
					<h1 class="text-3xl font-bold text-white mb-6">Transfer History</h1>
					{#if $vaultQuery.isLoading}
						<div class="text-white">Loading...</div>
					{:else if $vaultQuery.isError}
						<div class="text-red-500">Error: {$vaultQuery.error.message}</div>
					{:else}
						{#each $vaultQuery.data.shareTransfers as transfer}
							<div class="bg-gray-800 rounded-lg shadow-lg p-6 mb-6 flex flex-col gap-4 relative border border-gray-700">
								<!-- Status Badge -->
								<div class="absolute top-4 right-4">
									{#if transfer.id}
										<span class="bg-gray-600 text-green-300 px-3 py-1 rounded-full text-xs font-semibold">Completed</span>
									{:else}
										<span class="bg-gray-600 text-yellow-300 px-3 py-1 rounded-full text-xs font-semibold">Processing</span>
									{/if}
								</div>
								<div class="flex items-center gap-4">
									<!-- Avatar -->
									<div class="w-12 h-12 rounded-lg bg-gray-700 flex items-center justify-center text-2xl font-bold text-gray-200">
										{$vaultQuery.data.symbol?.slice(0,2) ?? '??'}
									</div>
									<div>
										<div class="text-lg font-semibold text-white">{$vaultQuery.data.name}</div>
										<div class="text-gray-400 text-xs">Transfer ID: {transfer.id}</div>
									</div>
								</div>
								<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-2">
									<div>
										<div class="text-gray-400">From Brokerage</div>
										<div class="text-white">{transfer.from.address.slice(0, 6)}...{transfer.from.address.slice(-4)}</div>
									</div>
									<div>
										<div class="text-gray-400">Wallet Address</div>
										<div class="text-white">{transfer.to.address.slice(0, 6)}...{transfer.to.address.slice(-4)}</div>
									</div>
									<div>
										<div class="text-gray-400">Completed</div>
										<div class="text-white">{transfer.timestamp ? new Date(transfer.timestamp * 1000).toLocaleString() : 'Pending'}</div>
									</div>
								</div>
								<!-- Message Bar -->
								{#if transfer.id}
									<div class="bg-green-900 text-green-200 rounded px-4 py-2 mt-4 text-xs">
										Tokens Transferred TX: {transfer.id}
									</div>
								{:else}
									<div class="bg-blue-900 text-blue-200 rounded px-4 py-2 mt-4 text-xs">
										Transfer in progress. Tokens will be automatically sent to your wallet once shares are received.
									</div>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			{#if selectedTab === 'Terms & Conditions'}
				<div class="space-y-6">
					<h1 class="text-2xl font-bold text-white mb-2">Terms & Conditions - Share Transfer Process</h1>
					<div class="text-gray-400 text-sm mb-4">Legal framework governing the tokenization process</div>
					<div class="bg-yellow-900/80 border-l-4 border-yellow-400 p-4 mb-6 rounded">
						<div class="font-semibold text-yellow-300 mb-1">Important Legal Notice</div>
						<div class="text-yellow-100 text-sm">By initiating a share transfer, you agree to be bound by these terms and conditions. Please read carefully before proceeding.</div>
					</div>
					<div class="space-y-6 bg-gray-800/80 rounded-lg p-6 border border-gray-700">
						<div>
							<div class="font-bold text-white mb-1">1. Share Transfer Authorization and Process</div>
							<div class="text-gray-200 text-sm">When you initiate a share transfer through the SARKEX platform, you are authorizing SARKEX Financial Ltd. to act as your agent for the purposes of facilitating the transfer of eligible securities from your designated brokerage account to SARKEX's institutional custody account.</div>
						</div>
						<div>
							<div class="font-bold text-white mb-1">2. Custody and Safekeeping Arrangements</div>
							<div class="text-gray-200 text-sm">Upon successful receipt of your transferred shares, SARKEX will hold such securities in a segregated custody account maintained with qualified institutional custodians.</div>
						</div>
						<div>
							<div class="font-bold text-white mb-1">3. Token Issuance and Blockchain Settlement</div>
							<div class="text-gray-200 text-sm">Following confirmation of successful share receipt and custody, SARKEX will automatically issue corresponding digital tokens to the blockchain wallet address you have specified.</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>