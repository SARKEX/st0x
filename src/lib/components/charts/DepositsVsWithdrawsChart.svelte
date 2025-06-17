<script lang="ts">
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import DepositChart from './DepositChart.svelte';
	import WithdrawChart from './WithdrawChart.svelte';

	export let vaults: OffchainAssetReceiptVault[];
</script>

<div class="space-y-6">
	<DepositChart {vaults} />
	<WithdrawChart {vaults} />
</div>
