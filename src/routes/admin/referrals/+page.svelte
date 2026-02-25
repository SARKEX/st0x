<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { truncateAddress, formatPoints } from '$lib/utils/format';

	interface ReferralLeaderboardEntry {
		rank: number;
		nickname: string;
		referralCode: string;
		telegramHandle: string;
		walletAddress: string;
		walletsReferred: number;
		referredWallets: string[];
		totalPoints: number;
		projectedRewards: number;
		createdAt: string;
	}

	// State
	let loading = false;
	let error = '';
	let leaderboard: ReferralLeaderboardEntry[] = [];
	let totalParticipants = 0;
	let selectedMonth = getCurrentMonth();
	let availableMonths: string[] = [];
	let refreshing = false;
	let lastGenerated = '';
	let copiedAddress = '';

	// Add referrer form state
	let showAddForm = false;
	let addFormLoading = false;
	let addFormError = '';
	let addFormSuccess = '';
	let formWalletAddress = '';
	let formReferralCode = '';
	let formNickname = '';
	let formTelegramHandle = '';
	let formMigrateFromCode = '';

	async function copyAddress(address: string) {
		try {
			await navigator.clipboard.writeText(address);
			copiedAddress = address;
			setTimeout(() => (copiedAddress = ''), 2000);
		} catch {
			// Fallback for older browsers
			const textArea = document.createElement('textarea');
			textArea.value = address;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand('copy');
			document.body.removeChild(textArea);
			copiedAddress = address;
			setTimeout(() => (copiedAddress = ''), 2000);
		}
	}

	// Search/filter
	let searchQuery = '';
	$: filteredLeaderboard = leaderboard.filter((entry) => {
		if (!searchQuery) return true;
		const query = searchQuery.toLowerCase();
		return (
			entry.nickname.toLowerCase().includes(query) ||
			entry.referralCode.toLowerCase().includes(query) ||
			entry.telegramHandle.toLowerCase().includes(query) ||
			entry.walletAddress.toLowerCase().includes(query)
		);
	});

	// Generate month options (last 12 months) - use UTC to match server
	function generateMonthOptions(): string[] {
		const months: string[] = [];
		const now = new Date();
		for (let i = 0; i < 12; i++) {
			const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
			const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
			months.push(month);
		}
		return months;
	}

	function getCurrentMonth(): string {
		const now = new Date();
		return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
	}

	function formatMonth(monthStr: string): string {
		const [year, month] = monthStr.split('-');
		const date = new Date(parseInt(year), parseInt(month) - 1);
		return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
	}

	// Calculate number of snapshots for a month (2 per day)
	function getSnapshotCount(monthStr: string): number {
		const [year, month] = monthStr.split('-').map(Number);
		const daysInMonth = new Date(year, month, 0).getDate();
		return daysInMonth * 2;
	}

	// Calculate approx TVL boost from points
	function calcTvlBoost(points: number, snapshots: number): number {
		if (snapshots === 0) return 0;
		return points / snapshots / 100;
	}

	function formatTvl(amount: number): string {
		if (amount >= 1_000_000) {
			return '$' + (amount / 1_000_000).toFixed(2) + 'M';
		}
		if (amount >= 1_000) {
			return '$' + (amount / 1_000).toFixed(1) + 'K';
		}
		return '$' + amount.toFixed(0);
	}

	$: snapshotCount = getSnapshotCount(selectedMonth);

	async function fetchLeaderboard() {
		loading = true;
		error = '';

		try {
			const res = await fetch(`/api/admin/referral-programme/leaderboard?month=${selectedMonth}`);
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to fetch leaderboard');
			}

			leaderboard = data.leaderboard;
			totalParticipants = data.totalParticipants;
			lastGenerated = data.generatedAt;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
			leaderboard = [];
		} finally {
			loading = false;
		}
	}

	async function refreshCache() {
		refreshing = true;
		error = '';

		try {
			const res = await fetch(`/api/admin/referral-programme/refresh?month=${selectedMonth}`, {
				method: 'POST'
			});
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to refresh cache');
			}

			// Refetch after refresh
			await fetchLeaderboard();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			refreshing = false;
		}
	}

	function resetAddForm() {
		formWalletAddress = '';
		formReferralCode = '';
		formNickname = '';
		formTelegramHandle = '';
		formMigrateFromCode = '';
		addFormError = '';
		addFormSuccess = '';
	}

	async function handleAddReferrer() {
		addFormLoading = true;
		addFormError = '';
		addFormSuccess = '';

		try {
			const res = await fetch('/api/admin/referral-programme/migrate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					walletAddress: formWalletAddress.trim(),
					referralCode: formReferralCode.trim(),
					nickname: formNickname.trim(),
					telegramHandle: formTelegramHandle.trim(),
					migrateFromAccessCode: formMigrateFromCode.trim() || undefined
				})
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to add referrer');
			}

			const migratedMsg = data.migratedWallets
				? ` Migrated ${data.migratedWallets} wallet(s).`
				: '';
			const successMsg = `Referrer added successfully!${migratedMsg}`;
			resetAddForm();
			addFormSuccess = successMsg;

			// Refresh the leaderboard
			await refreshCache();
		} catch (err) {
			addFormError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			addFormLoading = false;
		}
	}

	$: isAddFormValid =
		formWalletAddress.trim() &&
		/^0x[a-fA-F0-9]{40}$/.test(formWalletAddress.trim()) &&
		formReferralCode.trim() &&
		formNickname.trim() &&
		/^[a-zA-Z0-9_]{3,20}$/.test(formNickname.trim()) &&
		formTelegramHandle.trim() &&
		/^@[a-zA-Z][a-zA-Z0-9_]{3,30}$/.test(formTelegramHandle.trim());

	function escapeCsvField(value: unknown): string {
		const str = value == null ? '' : String(value);
		// Escape fields containing commas, quotes, or newlines
		if (str.includes(',') || str.includes('"') || str.includes('\n')) {
			return '"' + str.replace(/"/g, '""') + '"';
		}
		return str;
	}

	function exportCsv() {
		if (leaderboard.length === 0) return;

		const headers = [
			'Rank',
			'Nickname',
			'Referral Code',
			'Telegram',
			'Wallet Address',
			'Wallets Referred',
			'Total Points',
			'Approx TVL Boost',
			'Wallet Rewards',
			'Referral Rewards',
			'Joined'
		];

		const rows = leaderboard.map((entry) =>
			[
				entry.rank,
				entry.nickname,
				entry.referralCode,
				entry.telegramHandle,
				entry.walletAddress,
				entry.walletsReferred,
				entry.totalPoints.toFixed(0),
				calcTvlBoost(entry.totalPoints, snapshotCount).toFixed(2),
				(entry.projectedRewards * 2).toFixed(2),
				entry.projectedRewards.toFixed(2),
				new Date(entry.createdAt).toLocaleDateString()
			].map(escapeCsvField)
		);

		const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `referral-leaderboard-${selectedMonth}.csv`;
		link.click();
	}

	function formatUsd(amount: number): string {
		return '$' + amount.toFixed(2);
	}

	onMount(() => {
		availableMonths = generateMonthOptions();
	});

	// Fetch when month changes (also triggers on initial mount since selectedMonth is initialized)
	$: if (selectedMonth) {
		fetchLeaderboard();
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-white">Referral Programme</h1>
			<p class="mt-1 text-sm text-gray-400">Manage and view referral programme statistics</p>
		</div>
		<Button on:click={() => (showAddForm = !showAddForm)} variant="primary">
			{#if showAddForm}
				Cancel
			{:else}
				<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4v16m8-8H4"
					/>
				</svg>
				Add Referrer
			{/if}
		</Button>
	</div>

	<!-- Add Referrer Form -->
	{#if showAddForm}
		<Card>
			<h3 class="mb-4 text-lg font-semibold text-white">Add / Migrate Referrer</h3>

			{#if addFormError}
				<div
					class="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
				>
					{addFormError}
				</div>
			{/if}

			{#if addFormSuccess}
				<div
					class="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
				>
					{addFormSuccess}
				</div>
			{/if}

			<div class="grid gap-4 md:grid-cols-2">
				<div>
					<label for="wallet-address" class="mb-1 block text-sm text-gray-400"
						>Wallet Address *</label
					>
					<input
						id="wallet-address"
						type="text"
						bind:value={formWalletAddress}
						placeholder="0x..."
						disabled={addFormLoading}
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none disabled:opacity-50"
					/>
				</div>

				<div>
					<label for="referral-code" class="mb-1 block text-sm text-gray-400">Referral Code *</label
					>
					<input
						id="referral-code"
						type="text"
						bind:value={formReferralCode}
						placeholder="ST0X-XXXX-XXXX or st0x-ref-xxxxxx"
						disabled={addFormLoading}
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none disabled:opacity-50"
					/>
				</div>

				<div>
					<label for="nickname" class="mb-1 block text-sm text-gray-400"
						>Nickname * <span class="text-gray-500">(3-20 chars, alphanumeric)</span></label
					>
					<input
						id="nickname"
						type="text"
						bind:value={formNickname}
						placeholder="LeaderboardName"
						disabled={addFormLoading}
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none disabled:opacity-50"
					/>
				</div>

				<div>
					<label for="telegram" class="mb-1 block text-sm text-gray-400">Telegram Handle *</label>
					<input
						id="telegram"
						type="text"
						bind:value={formTelegramHandle}
						placeholder="@username"
						disabled={addFormLoading}
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none disabled:opacity-50"
					/>
				</div>

				<div class="md:col-span-2">
					<label for="migrate-code" class="mb-1 block text-sm text-gray-400">
						Migrate from Access Code <span class="text-gray-500"
							>(optional - copies existing referred wallets)</span
						>
					</label>
					<input
						id="migrate-code"
						type="text"
						bind:value={formMigrateFromCode}
						placeholder="ST0X-XXXX-XXXX"
						disabled={addFormLoading}
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none disabled:opacity-50"
					/>
				</div>
			</div>

			<div class="mt-4 flex justify-end">
				<Button
					on:click={handleAddReferrer}
					variant="primary"
					disabled={!isAddFormValid || addFormLoading}
				>
					{#if addFormLoading}
						<span class="flex items-center gap-2">
							<span
								class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
							></span>
							Adding...
						</span>
					{:else}
						Add Referrer
					{/if}
				</Button>
			</div>
		</Card>
	{/if}

	<!-- Controls -->
	<Card>
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div class="flex items-center gap-4">
				<!-- Month selector -->
				<div class="flex items-center gap-2">
					<label for="month-select" class="text-sm text-gray-400">Month:</label>
					<select
						id="month-select"
						bind:value={selectedMonth}
						class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
					>
						{#each availableMonths as month}
							<option value={month}>{formatMonth(month)}</option>
						{/each}
					</select>
				</div>

				<!-- Search -->
				<div class="relative">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search nickname, code, telegram..."
						class="w-64 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 pl-9 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none"
					/>
					<svg
						class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<!-- Refresh button -->
				<Button on:click={refreshCache} variant="secondary" disabled={refreshing}>
					{#if refreshing}
						<span class="flex items-center gap-2">
							<span
								class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
							></span>
							Refreshing...
						</span>
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
						Refresh Cache
					{/if}
				</Button>

				<!-- Export button -->
				<Button on:click={exportCsv} variant="secondary" disabled={leaderboard.length === 0}>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
					Export CSV
				</Button>
			</div>
		</div>
	</Card>

	<!-- Stats Summary -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
		<Card>
			<div class="text-center">
				<p class="text-sm text-gray-400">Total Referrers</p>
				<p class="mt-1 text-2xl font-bold text-white">{totalParticipants}</p>
			</div>
		</Card>
		<Card>
			<div class="text-center">
				<p class="text-sm text-gray-400">Wallets Referred</p>
				<p class="mt-1 text-2xl font-bold text-yellow-400">
					{leaderboard.reduce((sum, e) => sum + e.walletsReferred, 0)}
				</p>
			</div>
		</Card>
		<Card>
			<div class="text-center">
				<p class="text-sm text-gray-400">Total Points</p>
				<p class="mt-1 text-2xl font-bold text-white">
					{formatPoints(leaderboard.reduce((sum, e) => sum + e.totalPoints, 0))}
				</p>
			</div>
		</Card>
		<Card>
			<div class="text-center">
				<p class="text-sm text-gray-400">Approx TVL Boost</p>
				<p class="mt-1 text-2xl font-bold text-blue-400">
					{formatTvl(
						calcTvlBoost(
							leaderboard.reduce((sum, e) => sum + e.totalPoints, 0),
							snapshotCount
						)
					)}
				</p>
			</div>
		</Card>
		<Card>
			<div class="text-center">
				<p class="text-sm text-gray-400">Wallet Rewards</p>
				<p class="mt-1 text-2xl font-bold text-white">
					{formatUsd(leaderboard.reduce((sum, e) => sum + e.projectedRewards * 2, 0))}
				</p>
			</div>
		</Card>
		<Card>
			<div class="text-center">
				<p class="text-sm text-gray-400">Referral Rewards</p>
				<p class="mt-1 text-2xl font-bold text-green-400">
					{formatUsd(leaderboard.reduce((sum, e) => sum + e.projectedRewards, 0))}
				</p>
			</div>
		</Card>
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="rounded-lg border border-red-900/40 bg-red-900/20 p-4 text-red-300">
			{error}
		</div>
	{/if}

	<!-- Leaderboard Table -->
	<Card>
		{#if loading}
			<div class="flex items-center justify-center py-12">
				<div
					class="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-yellow-400"
				></div>
			</div>
		{:else if filteredLeaderboard.length === 0}
			<div class="py-12 text-center text-gray-400">
				{#if searchQuery}
					No results matching "{searchQuery}"
				{:else}
					No referrers yet for {formatMonth(selectedMonth)}
				{/if}
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr class="border-b border-gray-700 text-left text-sm text-gray-400">
							<th class="px-4 py-3">Rank</th>
							<th class="px-4 py-3">Nickname</th>
							<th class="px-4 py-3">Referral Code</th>
							<th class="px-4 py-3">Telegram</th>
							<th class="px-4 py-3">Wallet</th>
							<th class="px-4 py-3 text-right">Refs</th>
							<th class="px-4 py-3 text-right">Points</th>
							<th class="px-4 py-3 text-right">TVL Boost</th>
							<th class="px-4 py-3 text-right">Wallet Rewards</th>
							<th class="px-4 py-3 text-right">Referral Rewards</th>
							<th class="px-4 py-3">Joined</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-700/50">
						{#each filteredLeaderboard as entry}
							<tr class="hover:bg-gray-700/30">
								<td class="px-4 py-3">
									{#if entry.rank <= 3}
										<span
											class="flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold
											{entry.rank === 1
												? 'bg-yellow-500 text-gray-900'
												: entry.rank === 2
													? 'bg-gray-300 text-gray-900'
													: 'bg-amber-600 text-white'}"
										>
											{entry.rank}
										</span>
									{:else}
										<span class="text-gray-400">#{entry.rank}</span>
									{/if}
								</td>
								<td class="px-4 py-3 font-medium text-white">{entry.nickname}</td>
								<td class="px-4 py-3">
									<code class="rounded bg-gray-700 px-2 py-1 text-xs text-yellow-400">
										{entry.referralCode}
									</code>
								</td>
								<td class="px-4 py-3 text-blue-400">
									<a
										href="https://t.me/{entry.telegramHandle.replace('@', '')}"
										target="_blank"
										rel="noopener noreferrer"
										class="hover:underline"
									>
										{entry.telegramHandle}
									</a>
								</td>
								<td class="px-4 py-3">
									<div class="flex items-center gap-1">
										<a
											href="https://basescan.org/address/{entry.walletAddress}"
											target="_blank"
											rel="noopener noreferrer"
											class="font-mono text-sm text-gray-400 hover:text-white hover:underline"
										>
											{truncateAddress(entry.walletAddress)}
										</a>
										<button
											on:click={() => copyAddress(entry.walletAddress)}
											class="rounded p-1 text-gray-500 transition-colors hover:bg-gray-700 hover:text-white"
											title="Copy full address"
										>
											{#if copiedAddress === entry.walletAddress}
												<svg
													class="h-3.5 w-3.5 text-green-400"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M5 13l4 4L19 7"
													/>
												</svg>
											{:else}
												<svg
													class="h-3.5 w-3.5"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
													/>
												</svg>
											{/if}
										</button>
									</div>
								</td>
								<td class="px-4 py-3 text-right text-white">{entry.walletsReferred}</td>
								<td
									class="px-4 py-3 text-right font-medium {entry.rank <= 3
										? 'text-yellow-400'
										: 'text-white'}"
								>
									{formatPoints(entry.totalPoints)}
								</td>
								<td class="px-4 py-3 text-right text-blue-400">
									{formatTvl(calcTvlBoost(entry.totalPoints, snapshotCount))}
								</td>
								<td class="px-4 py-3 text-right text-white">
									{formatUsd(entry.projectedRewards * 2)}
								</td>
								<td class="px-4 py-3 text-right text-green-400">
									{formatUsd(entry.projectedRewards)}
								</td>
								<td class="px-4 py-3 text-sm text-gray-400">
									{new Date(entry.createdAt).toLocaleDateString()}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if lastGenerated}
				<div class="mt-4 text-center text-xs text-gray-500">
					Last updated: {new Date(lastGenerated).toLocaleString()}
				</div>
			{/if}
		{/if}
	</Card>
</div>
