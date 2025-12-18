<script lang="ts">
	/**
	 * Gas Payment Method Selector
	 *
	 * Allows users to choose how they want to pay for gas:
	 * - Native ETH (default)
	 * - ERC20 (pay with USDC, available on Base)
	 * - Sponsored (via Rhinestone paymaster, if configured)
	 */
	import { createEventDispatcher } from 'svelte';
	import { type SupportedNetworkId, getAAOrchestrator } from '$lib/services/account-abstraction';

	type GasMethod = 'native' | 'erc20' | 'sponsored';

	// Props
	export let chainId: SupportedNetworkId;
	export let selectedMethod: GasMethod = 'native';
	export let estimatedGasETH: bigint = 0n;
	export let estimatedGasUSDC: bigint = 0n;
	export let disabled: boolean = false;
	export let compact: boolean = false;

	const dispatch = createEventDispatcher<{
		change: { method: GasMethod; feeAsset?: string };
	}>();

	// Get available options
	$: orchestrator = getAAOrchestrator();
	$: options = orchestrator.getGasPaymentOptions(chainId);

	// Format gas estimates
	$: formattedGasETH =
		estimatedGasETH > 0n ? `${(Number(estimatedGasETH) / 1e18).toFixed(6)} ETH` : 'Calculating...';
	$: formattedGasUSDC =
		estimatedGasUSDC > 0n ? `${(Number(estimatedGasUSDC) / 1e6).toFixed(2)} USDC` : 'Calculating...';

	function selectMethod(method: GasMethod) {
		if (disabled) return;

		const option = options.find((o) => o.method === method);
		if (option && option.available) {
			selectedMethod = method;
			dispatch('change', { method, feeAsset: option.feeAsset });
		}
	}

	function getEstimate(method: GasMethod): string {
		switch (method) {
			case 'native':
				return formattedGasETH;
			case 'erc20':
				return formattedGasUSDC;
			case 'sponsored':
				return 'Free';
			default:
				return '';
		}
	}
</script>

<div class="gas-payment-selector" class:compact class:disabled>
	{#if !compact}
		<span class="section-label">Gas Payment</span>
	{/if}

	<div class="options" role="radiogroup" aria-label="Gas payment method">
		{#each options as option}
			<button
				type="button"
				class="option"
				class:selected={selectedMethod === option.method}
				class:unavailable={!option.available}
				on:click={() => selectMethod(option.method)}
				disabled={disabled || !option.available}
				role="radio"
				aria-checked={selectedMethod === option.method}
			>
				<!-- Icon -->
				<div class="option-icon">
					{#if option.method === 'native'}
						<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
							<path d="M10 1L3 10l7 4 7-4-7-9z" fill="currentColor" opacity="0.3" />
							<path d="M10 19l7-9-7 4-7-4 7 9z" fill="currentColor" />
						</svg>
					{:else if option.method === 'erc20'}
						<!-- USDC Dollar icon -->
						<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
							<circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5" />
							<path
								d="M10 5v10M12.5 7.5c0-1.1-1.1-2-2.5-2s-2.5.9-2.5 2c0 1.1 1.1 2 2.5 2s2.5.9 2.5 2c0 1.1-1.1 2-2.5 2s-2.5-.9-2.5-2"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					{:else if option.method === 'sponsored'}
						<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
							<path
								d="M10 2l2.5 5 5.5.8-4 3.9.9 5.3-4.9-2.6-4.9 2.6.9-5.3-4-3.9 5.5-.8L10 2z"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linejoin="round"
							/>
						</svg>
					{/if}
				</div>

				<!-- Content -->
				<div class="option-content">
					<span class="option-label">{option.label}</span>
					{#if !compact}
						<span class="option-desc">{option.description}</span>
					{/if}
				</div>

				<!-- Estimate -->
				{#if option.available && !compact}
					<span class="option-estimate">
						~{getEstimate(option.method)}
					</span>
				{/if}

				<!-- Unavailable badge -->
				{#if !option.available}
					<span class="unavailable-badge">Unavailable</span>
				{/if}

				<!-- Selected indicator -->
				{#if selectedMethod === option.method && option.available}
					<div class="selected-indicator">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
							<path
								d="M3 8l3 3 7-7"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</div>
				{/if}
			</button>
		{/each}
	</div>
</div>

<style>
	.gas-payment-selector {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.gas-payment-selector.disabled {
		opacity: 0.6;
		pointer-events: none;
	}

	.section-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-secondary, #9ca3af);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.compact .options {
		flex-direction: row;
		gap: 0.5rem;
	}

	.option {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--color-surface, #1a1a2e);
		border: 1px solid var(--color-border, #2d2d44);
		border-radius: 0.5rem;
		color: var(--color-text, #ffffff);
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}

	.compact .option {
		flex: 1;
		flex-direction: column;
		padding: 0.5rem;
		gap: 0.25rem;
	}

	.option:hover:not(:disabled) {
		border-color: var(--color-primary, #6366f1);
	}

	.option.selected {
		border-color: var(--color-primary, #6366f1);
		background: rgba(99, 102, 241, 0.1);
	}

	.option.unavailable {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.option:disabled {
		cursor: not-allowed;
	}

	.option-icon {
		color: var(--color-text-secondary, #9ca3af);
		flex-shrink: 0;
	}

	.option.selected .option-icon {
		color: var(--color-primary, #6366f1);
	}

	.option-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.compact .option-content {
		align-items: center;
	}

	.option-label {
		font-weight: 500;
		font-size: 0.9rem;
	}

	.compact .option-label {
		font-size: 0.75rem;
	}

	.option-desc {
		font-size: 0.75rem;
		color: var(--color-text-secondary, #9ca3af);
	}

	.option-estimate {
		font-size: 0.8rem;
		color: var(--color-text-secondary, #9ca3af);
		white-space: nowrap;
	}

	.unavailable-badge {
		font-size: 0.65rem;
		padding: 0.15rem 0.4rem;
		background: var(--color-border, #2d2d44);
		color: var(--color-text-secondary, #9ca3af);
		border-radius: 0.25rem;
		text-transform: uppercase;
		font-weight: 600;
	}

	.selected-indicator {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-primary, #6366f1);
		border-radius: 50%;
		color: white;
	}
</style>
