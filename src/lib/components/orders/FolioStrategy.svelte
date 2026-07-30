<script lang="ts">
	import TokenSelect from '$lib/components/TokenSelect.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { CategorizedToken } from '$lib/config/network';
	import { createApiTokensQuery } from '$lib/queries/tokens';
	import { validateOverrideDepositAmount } from '$lib/utils/validation';
	import Input from '$lib/components/ui/Input.svelte';
	import VaultIdInput from '$lib/components/VaultIdInput.svelte';
	import type { Hex } from 'viem';
	import { formatUnits } from 'viem';
	import { isAuthenticated } from '$lib/stores/authStore';
	import transactionStore from '$lib/stores/transaction';
	import { hasMarketPrice } from '$lib/utils/derivations';
	import { currentNetwork } from '$lib/stores';
	import MarketPriceRow from '$lib/components/MarketPriceRow.svelte';
	import { containerStyles } from '$lib/styles/utils';
	import Button from '$lib/components/ui/Button.svelte';
	import { createPriceFeedsQuery } from '$lib/queries/priceFeeds';

	$: apiTokensQuery = createApiTokensQuery($currentNetwork?.chainId ?? $currentNetwork?.id);
	$: ALL_TOKENS = $apiTokensQuery.data ?? [];

	// Selected Tokens - initialize with first available tokens from current network, but preserve user selections if valid
	$: if (ALL_TOKENS.length > 0) {
		// Check if current selections are still valid for the new network
		const currentToken1 = selectedToken1;
		const currentToken2 = selectedToken2;
		const currentToken3 = selectedToken3;
		const currentToken4 = selectedToken4;
		const currentToken5 = selectedToken5;
		const currentToken6 = selectedToken6;
		const currentToken7 = selectedToken7;
		const token1StillValid =
			currentToken1 && ALL_TOKENS.some((token) => token.address === currentToken1.address);
		const token2StillValid =
			currentToken2 && ALL_TOKENS.some((token) => token.address === currentToken2.address);
		const token3StillValid =
			currentToken3 && ALL_TOKENS.some((token) => token.address === currentToken3.address);
		const token4StillValid =
			currentToken4 && ALL_TOKENS.some((token) => token.address === currentToken4.address);
		const token5StillValid =
			currentToken5 && ALL_TOKENS.some((token) => token.address === currentToken5.address);
		const token6StillValid =
			currentToken6 && ALL_TOKENS.some((token) => token.address === currentToken6.address);
		const token7StillValid =
			currentToken7 && ALL_TOKENS.some((token) => token.address === currentToken7.address);

		// Only reset if current selections are not valid for the new network
		if (!token1StillValid) {
			selectedToken1 = ALL_TOKENS[0];
		}
		if (!token2StillValid) {
			selectedToken2 = ALL_TOKENS[1] || ALL_TOKENS[0];
		}
		if (!token3StillValid) {
			selectedToken3 = ALL_TOKENS[2] || ALL_TOKENS[0];
		}
		if (!token4StillValid) {
			selectedToken4 = ALL_TOKENS[3] || ALL_TOKENS[0];
		}
		if (!token5StillValid) {
			selectedToken5 = ALL_TOKENS[4] || ALL_TOKENS[0];
		}
		if (!token6StillValid) {
			selectedToken6 = ALL_TOKENS[5] || ALL_TOKENS[0];
		}
		if (!token7StillValid) {
			selectedToken7 = ALL_TOKENS[6] || ALL_TOKENS[0];
		}
	}

	let selectedToken1: CategorizedToken | undefined;
	let selectedToken2: CategorizedToken | undefined;
	let selectedToken3: CategorizedToken | undefined;
	let selectedToken4: CategorizedToken | undefined;
	let selectedToken5: CategorizedToken | undefined;
	let selectedToken6: CategorizedToken | undefined;
	let selectedToken7: CategorizedToken | undefined;

	// Advanced Options
	let showAdvancedOptions = false;

	// Overrides Options
	let overrideThreshold: string | undefined;
	let overrideFee: string | undefined;
	let overrideDepositAmount1: bigint = 0n;
	let overrideDepositAmount2: bigint = 0n;
	let overrideDepositAmount3: bigint = 0n;
	let overrideDepositAmount4: bigint = 0n;
	let overrideDepositAmount5: bigint = 0n;
	let overrideDepositAmount6: bigint = 0n;
	let overrideDepositAmount7: bigint = 0n;
	let inputVaultId1: Hex | undefined;
	let inputVaultId2: Hex | undefined;
	let inputVaultId3: Hex | undefined;
	let inputVaultId4: Hex | undefined;
	let inputVaultId5: Hex | undefined;
	let inputVaultId6: Hex | undefined;
	let inputVaultId7: Hex | undefined;
	let outputVaultId1: Hex | undefined;
	let outputVaultId2: Hex | undefined;
	let outputVaultId3: Hex | undefined;
	let outputVaultId4: Hex | undefined;
	let outputVaultId5: Hex | undefined;
	let outputVaultId6: Hex | undefined;
	let outputVaultId7: Hex | undefined;
	let priceFeedsQuery = createPriceFeedsQuery($currentNetwork);
	$: priceFeedsQuery = createPriceFeedsQuery($currentNetwork);

	// errors
	let overrideDepositAmount1Error: boolean = false;
	let overrideDepositAmount2Error: boolean = false;
	let overrideDepositAmount3Error: boolean = false;
	let overrideDepositAmount4Error: boolean = false;
	let overrideDepositAmount5Error: boolean = false;
	let overrideDepositAmount6Error: boolean = false;
	let overrideDepositAmount7Error: boolean = false;
	let inputVaultId1Error: boolean = false;
	let inputVaultId2Error: boolean = false;
	let inputVaultId3Error: boolean = false;
	let inputVaultId4Error: boolean = false;
	let inputVaultId5Error: boolean = false;
	let inputVaultId6Error: boolean = false;
	let inputVaultId7Error: boolean = false;
	let outputVaultId1Error: boolean = false;
	let outputVaultId2Error: boolean = false;
	let outputVaultId3Error: boolean = false;
	let outputVaultId4Error: boolean = false;
	let outputVaultId5Error: boolean = false;
	let outputVaultId6Error: boolean = false;
	let outputVaultId7Error: boolean = false;
	let overrideThresholdError: boolean = false;
	let overrideFeeError: boolean = false;

	$: depositAmount1 = overrideDepositAmount1 ? overrideDepositAmount1 : 0n;
	$: depositAmount2 = overrideDepositAmount2 ? overrideDepositAmount2 : 0n;
	$: depositAmount3 = overrideDepositAmount3 ? overrideDepositAmount3 : 0n;
	$: depositAmount4 = overrideDepositAmount4 ? overrideDepositAmount4 : 0n;
	$: depositAmount5 = overrideDepositAmount5 ? overrideDepositAmount5 : 0n;
	$: depositAmount6 = overrideDepositAmount6 ? overrideDepositAmount6 : 0n;
	$: depositAmount7 = overrideDepositAmount7 ? overrideDepositAmount7 : 0n;

	$: disableDeploy =
		!selectedToken1 ||
		!selectedToken2 ||
		!selectedToken3 ||
		!selectedToken4 ||
		!selectedToken5 ||
		!selectedToken6 ||
		!selectedToken7 ||
		overrideThresholdError ||
		overrideFeeError ||
		overrideDepositAmount1Error ||
		overrideDepositAmount2Error ||
		overrideDepositAmount3Error ||
		overrideDepositAmount4Error ||
		overrideDepositAmount5Error ||
		overrideDepositAmount6Error ||
		overrideDepositAmount7Error ||
		inputVaultId1Error ||
		inputVaultId2Error ||
		inputVaultId3Error ||
		inputVaultId4Error ||
		inputVaultId5Error ||
		inputVaultId6Error ||
		inputVaultId7Error ||
		outputVaultId1Error ||
		outputVaultId2Error ||
		outputVaultId3Error ||
		outputVaultId4Error ||
		outputVaultId5Error ||
		outputVaultId6Error ||
		outputVaultId7Error;

	const handleFolioDeploy = () => {
		const tokens = [
			selectedToken1,
			selectedToken2,
			selectedToken3,
			selectedToken4,
			selectedToken5,
			selectedToken6,
			selectedToken7
		];
		if ($isAuthenticated && tokens.every(Boolean)) {
			transactionStore.handleFolioDeploy({
				selectedToken1: selectedToken1 as CategorizedToken,
				selectedToken2: selectedToken2 as CategorizedToken,
				selectedToken3: selectedToken3 as CategorizedToken,
				selectedToken4: selectedToken4 as CategorizedToken,
				selectedToken5: selectedToken5 as CategorizedToken,
				selectedToken6: selectedToken6 as CategorizedToken,
				selectedToken7: selectedToken7 as CategorizedToken,
				overrideThreshold: overrideThreshold,
				overrideFee: overrideFee,
				depositAmount1: depositAmount1,
				depositAmount2: depositAmount2,
				depositAmount3: depositAmount3,
				depositAmount4: depositAmount4,
				depositAmount5: depositAmount5,
				depositAmount6: depositAmount6,
				depositAmount7: depositAmount7,
				inputVaultId1: inputVaultId1,
				inputVaultId2: inputVaultId2,
				inputVaultId3: inputVaultId3,
				inputVaultId4: inputVaultId4,
				inputVaultId5: inputVaultId5,
				inputVaultId6: inputVaultId6,
				inputVaultId7: inputVaultId7,
				outputVaultId1: outputVaultId1,
				outputVaultId2: outputVaultId2,
				outputVaultId3: outputVaultId3,
				outputVaultId4: outputVaultId4,
				outputVaultId5: outputVaultId5,
				outputVaultId6: outputVaultId6,
				outputVaultId7: outputVaultId7
			});
		}
	};
</script>

<div class="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
	<div class="space-y-6 lg:col-span-2">
		<div>
			<h3 class="mb-4 text-lg font-semibold">Select Tokens</h3>
			<p class="mb-6 text-sm text-text-2">
				Select the tokens that you want to use in your portfolio.
			</p>
			<div class="grid grid-cols-1 gap-3 sm:gap-4">
				<div>
					<span class="mb-2 block text-sm font-medium text-text-2">Token 1</span>
					<TokenSelect options={ALL_TOKENS} bind:selected={selectedToken1} />
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-text-2">Token 2</span>
					<TokenSelect options={ALL_TOKENS} bind:selected={selectedToken2} />
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-text-2">Token 3</span>
					<TokenSelect options={ALL_TOKENS} bind:selected={selectedToken3} />
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-text-2">Token 4</span>
					<TokenSelect options={ALL_TOKENS} bind:selected={selectedToken4} />
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-text-2">Token 5</span>
					<TokenSelect options={ALL_TOKENS} bind:selected={selectedToken5} />
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-text-2">Token 6</span>
					<TokenSelect options={ALL_TOKENS} bind:selected={selectedToken6} />
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-text-2">Token 7</span>
					<TokenSelect options={ALL_TOKENS} bind:selected={selectedToken7} />
				</div>
			</div>
		</div>

		{#if selectedToken1 && selectedToken2 && selectedToken3 && selectedToken4 && selectedToken5 && selectedToken6 && selectedToken7}
			<div class="mb-6 flex items-center gap-3">
				<button
					on:click={() => (showAdvancedOptions = !showAdvancedOptions)}
					class="relative h-6 w-12 rounded-full transition-colors {showAdvancedOptions
						? 'bg-accent'
						: 'bg-text-muted'}"
				>
					<div
						class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform {showAdvancedOptions
							? 'translate-x-6'
							: 'translate-x-0.5'}"
					/>
				</button>
				<span class="text-sm font-medium">Show advanced options</span>
			</div>
			{#if showAdvancedOptions}
				<div class="space-y-4 rounded-xl border border-line bg-surface-2 p-4">
					<h4 class="text-sm font-medium text-text-2">Advanced Options</h4>
					<div class="grid grid-cols-1 gap-3 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Threshold</span>
						<Input
							type="text"
							placeholder="0.05"
							bind:value={overrideThreshold}
							bind:isError={overrideThresholdError}
						/>
					</div>
					<div class="grid grid-cols-1 gap-3 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Fee</span>
						<Input
							type="text"
							placeholder="0.003"
							bind:value={overrideFee}
							bind:isError={overrideFeeError}
						/>
					</div>

					<div class="grid grid-cols-1 gap-3 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 1 Deposit Amount</span>
						<TradeAmountInput
							amountToken={selectedToken1}
							bind:amount={overrideDepositAmount1}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount1Error}
						/>
					</div>
					<div class="grid grid-cols-1 gap-3 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 2 Deposit Amount</span>
						<TradeAmountInput
							amountToken={selectedToken2}
							bind:amount={overrideDepositAmount2}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount2Error}
						/>
					</div>
					<div class="grid grid-cols-1 gap-3 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 3 Deposit Amount</span>
						<TradeAmountInput
							amountToken={selectedToken3}
							bind:amount={overrideDepositAmount3}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount3Error}
						/>
					</div>
					<div class="grid grid-cols-1 gap-3 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 4 Deposit Amount</span>
						<TradeAmountInput
							amountToken={selectedToken4}
							bind:amount={overrideDepositAmount4}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount4Error}
						/>
					</div>
					<div class="grid grid-cols-1 gap-3 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 5 Deposit Amount</span>
						<TradeAmountInput
							amountToken={selectedToken5}
							bind:amount={overrideDepositAmount5}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount5Error}
						/>
					</div>
					<div class="grid grid-cols-1 gap-3 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 6 Deposit Amount</span>
						<TradeAmountInput
							amountToken={selectedToken6}
							bind:amount={overrideDepositAmount6}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount6Error}
						/>
					</div>
					<div class="grid grid-cols-1 gap-3 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 7 Deposit Amount</span>
						<TradeAmountInput
							amountToken={selectedToken7}
							bind:amount={overrideDepositAmount7}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount7Error}
						/>
					</div>
					<div class="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 1 Vault ID</span>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Input {selectedToken1.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={inputVaultId1} bind:isError={inputVaultId1Error} />
						</div>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Output {selectedToken1.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={outputVaultId1} bind:isError={outputVaultId1Error} />
						</div>
					</div>
					<div class="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 2 Vault ID</span>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Input {selectedToken2.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={inputVaultId2} bind:isError={inputVaultId2Error} />
						</div>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Output {selectedToken2.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={outputVaultId2} bind:isError={outputVaultId2Error} />
						</div>
					</div>
					<div class="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 3 Vault ID</span>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Input {selectedToken3.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={inputVaultId3} bind:isError={inputVaultId3Error} />
						</div>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Output {selectedToken3.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={outputVaultId3} bind:isError={outputVaultId3Error} />
						</div>
					</div>
					<div class="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 4 Vault ID</span>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Input {selectedToken4.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={inputVaultId4} bind:isError={inputVaultId4Error} />
						</div>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Output {selectedToken4.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={outputVaultId4} bind:isError={outputVaultId4Error} />
						</div>
					</div>
					<div class="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 5 Vault ID</span>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Input {selectedToken5.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={inputVaultId5} bind:isError={inputVaultId5Error} />
						</div>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Output {selectedToken5.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={outputVaultId5} bind:isError={outputVaultId5Error} />
						</div>
					</div>
					<div class="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 6 Vault ID</span>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Input {selectedToken6.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={inputVaultId6} bind:isError={inputVaultId6Error} />
						</div>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Output {selectedToken6.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={outputVaultId6} bind:isError={outputVaultId6Error} />
						</div>
					</div>
					<div class="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:gap-4">
						<span class="block text-sm font-medium text-text-2">Token 7 Vault ID</span>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Input {selectedToken7.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={inputVaultId7} bind:isError={inputVaultId7Error} />
						</div>
						<div class="flex flex-col gap-2">
							<span class="text-left text-sm font-medium text-text-2">
								Output {selectedToken7.symbol} Vault ID
							</span>
							<VaultIdInput bind:vaultId={outputVaultId7} bind:isError={outputVaultId7Error} />
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Order Summary and Button: always below form on mobile, side on desktop -->
	{#if selectedToken1 && selectedToken2 && selectedToken3 && selectedToken4 && selectedToken5 && selectedToken6 && selectedToken7}
		<div class="mt-4 space-y-4 lg:mt-0">
			<div class={containerStyles.cardBordered}>
				<h4 class="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-text-2">Prices</h4>
				<div class="overflow-x-auto">
					<table class="min-w-full text-sm text-text-2">
						<thead>
							<tr>
								<th
									class="px-2 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-text-3"
									>Token</th
								>
								<th
									class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
									>Mid Price</th
								>
								<th
									class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
									>Bid / Ask</th
								>
								<th
									class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
									>24h Change</th
								>
							</tr>
						</thead>
						<tbody>
							{#if hasMarketPrice(selectedToken1)}
								<MarketPriceRow token={selectedToken1} tokenQuotes={$priceFeedsQuery?.data ?? []} />
							{:else}
								<tr>
									<td class="px-2 py-1">{selectedToken1?.symbol ?? '-'}</td>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
								</tr>
							{/if}
							{#if hasMarketPrice(selectedToken2)}
								<MarketPriceRow token={selectedToken2} tokenQuotes={$priceFeedsQuery?.data ?? []} />
							{:else}
								<tr>
									<td class="px-2 py-1">{selectedToken2?.symbol ?? '-'}</td>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
								</tr>
							{/if}
							{#if hasMarketPrice(selectedToken3)}
								<MarketPriceRow token={selectedToken3} tokenQuotes={$priceFeedsQuery?.data ?? []} />
							{:else}
								<tr>
									<td class="px-2 py-1">{selectedToken3?.symbol ?? '-'}</td>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
								</tr>
							{/if}
							{#if hasMarketPrice(selectedToken4)}
								<MarketPriceRow token={selectedToken4} tokenQuotes={$priceFeedsQuery?.data ?? []} />
							{:else}
								<tr>
									<td class="px-2 py-1">{selectedToken4?.symbol ?? '-'}</td>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
								</tr>
							{/if}
							{#if hasMarketPrice(selectedToken5)}
								<MarketPriceRow token={selectedToken5} tokenQuotes={$priceFeedsQuery?.data ?? []} />
							{:else}
								<tr>
									<td class="px-2 py-1">{selectedToken5?.symbol ?? '-'}</td>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
								</tr>
							{/if}
							{#if hasMarketPrice(selectedToken6)}
								<MarketPriceRow token={selectedToken6} tokenQuotes={$priceFeedsQuery?.data ?? []} />
							{:else}
								<tr>
									<td class="px-2 py-1">{selectedToken6?.symbol ?? '-'}</td>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
								</tr>
							{/if}
							{#if hasMarketPrice(selectedToken7)}
								<MarketPriceRow token={selectedToken7} tokenQuotes={$priceFeedsQuery?.data ?? []} />
							{:else}
								<tr>
									<td class="px-2 py-1">{selectedToken7?.symbol ?? '-'}</td>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
									<td
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>-</td
									>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
				<!-- Removed mobile-only stacked cards; table above now scrolls on small screens -->
			</div>

			<div class={containerStyles.cardBordered}>
				<h4 class="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-text-2">
					Portfolio Order Summary
				</h4>
				<div class="space-y-2">
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Threshold</span>
						<span class="font-medium text-text">{overrideThreshold || '0.05'}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Fee</span>
						<span class="font-medium text-text">{overrideFee || '0.003'}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Selected Token 1</span>
						<span class="font-medium text-text">{selectedToken1.symbol}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Selected Token 2</span>
						<span class="font-medium text-text">{selectedToken2.symbol}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Selected Token 3</span>
						<span class="font-medium text-text">{selectedToken3.symbol}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Selected Token 4</span>
						<span class="font-medium text-text">{selectedToken4.symbol}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Selected Token 5</span>
						<span class="font-medium text-text">{selectedToken5.symbol}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Selected Token 6</span>
						<span class="font-medium text-text">{selectedToken6.symbol}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Selected Token 7</span>
						<span class="font-medium text-text">{selectedToken7.symbol}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Token 1 Deposit Amount</span>
						<span class="font-medium text-text"
							>{formatUnits(overrideDepositAmount1 ?? 0n, selectedToken1.decimals)}</span
						>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Token 2 Deposit Amount</span>
						<span class="font-medium text-text"
							>{formatUnits(overrideDepositAmount2 ?? 0n, selectedToken2.decimals)}</span
						>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Token 3 Deposit Amount</span>
						<span class="font-medium text-text"
							>{formatUnits(overrideDepositAmount3 ?? 0n, selectedToken3.decimals)}</span
						>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Token 4 Deposit Amount</span>
						<span class="font-medium text-text"
							>{formatUnits(overrideDepositAmount4 ?? 0n, selectedToken4.decimals)}</span
						>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Token 5 Deposit Amount</span>
						<span class="font-medium text-text"
							>{formatUnits(overrideDepositAmount5 ?? 0n, selectedToken5.decimals)}</span
						>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Token 6 Deposit Amount</span>
						<span class="font-medium text-text"
							>{formatUnits(overrideDepositAmount6 ?? 0n, selectedToken6.decimals)}</span
						>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Token 7 Deposit Amount</span>
						<span class="font-medium text-text"
							>{formatUnits(overrideDepositAmount7 ?? 0n, selectedToken7.decimals)}</span
						>
					</div>
				</div>
			</div>

			<Button
				variant="primary"
				size="lg"
				fullWidth={true}
				disabled={disableDeploy}
				on:click={handleFolioDeploy}
			>
				Deploy Order
			</Button>
		</div>
	{/if}
</div>
