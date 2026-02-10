<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import type { BlockSnapshot } from '$lib/server/snapshots/types';
	import { TOKENS } from '$lib/config/tokens';
	import { computeProjectedDailyPoints } from '$lib/utils/points';
	import { jsPDF } from 'jspdf';
	import autoTable from 'jspdf-autotable';

	// Tab management
	type Tab =
		| 'points'
		| 'snapshots'
		| 'preview'
		| 'excluded'
		| 'team'
		| 'pool'
		| 'referrals'
		| 'nansen';
	let activeTab: Tab = 'points';

	// Hide excluded wallets toggle (hidden by default)
	let hideExcluded = true;

	// ===== Points Tab State =====
	let pointsLoading = false;
	let pointsError = '';
	let availableMonths: string[] = [];
	let selectedMonth = '';
	let monthlyData: {
		month: string;
		snapshotCount: number;
		blockNumbers: number[];
		snapshotTotals: { blockNumber: number; totalPoints: number; totalPointsFiltered?: number }[];
		walletCount: number;
		wallets: Array<{
			address: string;
			totalPoints: number;
			tokenCount: number;
		}>;
		updatedAt: string;
	} | null = null;

	// Excluded wallets from the monthly data
	let excludedWalletsInData: Set<string> = new Set();

	// Recalculate state
	let recalculateLoading = false;
	let recalculateError = '';
	let recalculateResult: {
		snapshotCount: number;
		walletCount: number;
		totalPoints: number;
		tokensProcessed?: string[];
		blockNumbers?: number[];
		comparison?: {
			previousWalletCount: number;
			previousTotalPoints: number;
			walletsRemoved: number;
			pointsRemoved: number;
		};
		excludedWalletsApplied?: { address: string; pointsExcluded: number }[];
		totalExcludedPoints?: number;
		debug?: {
			blocksFound: number;
			totalBlobsInStorage: number;
			blobsMatchingMonth: number;
			excludedWalletsCount: number;
			targetBlockNumbers: number[];
			sampleBlobPaths?: string[];
			allBlobBlockNumbers?: number[];
		};
	} | null = null;

	// Regenerate snapshots state
	let regenerateLoading = false;
	let regenerateError = '';
	let regenerateConfirmText = '';
	let regenerateResult: {
		successful: number;
		failed: number;
		totalBlocks: number;
		results: Array<{
			blockNumber: number;
			date: string;
			tokensGenerated: number;
			success: boolean;
			error?: string;
		}>;
	} | null = null;

	// Pool config for current month (for reward calculations)
	// Reactively find pool config for selected month (avoids race condition on mount)
	$: currentMonthPool = poolConfigs.find((p) => p.month === selectedMonth) || null;

	// ===== Contract Check State =====
	// Contract type: null = EOA, 'v2' = V2 pool, 'v3' = V3 pool, 'unknown' = other contract
	let contractMap: Record<string, string | null> = {};
	let lastCheckedWallets: string[] = []; // Track which wallets we've checked

	// Auto-check contracts when wallet data changes
	$: if (monthlyData?.wallets && monthlyData.wallets.length > 0) {
		const currentAddresses = monthlyData.wallets.map((w) => w.address.toLowerCase()).sort();
		const lastAddresses = lastCheckedWallets.sort();
		// Only check if wallet list has changed
		if (JSON.stringify(currentAddresses) !== JSON.stringify(lastAddresses)) {
			checkContracts(monthlyData.wallets.map((w) => w.address));
		}
	}

	async function checkContracts(addresses: string[]) {
		if (addresses.length === 0) return;

		lastCheckedWallets = addresses.map((a) => a.toLowerCase());

		try {
			const res = await fetch('/api/admin/check-contracts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ addresses })
			});

			const data = await res.json();
			if (res.ok && data.success) {
				contractMap = data.contracts;
			}
		} catch {
			// Silently fail - contract check is not critical
		}
	}

	// ===== Airdrop CSV Modal State =====
	let airdropModalOpen = false;
	let airdropTokenAddress = '';
	let airdropTotalTokens = '';
	let airdropError = '';

	function openAirdropModal() {
		airdropTokenAddress = '';
		airdropTotalTokens = '';
		airdropError = '';
		airdropModalOpen = true;
	}

	function closeAirdropModal() {
		airdropModalOpen = false;
	}

	function generateAirdropCsv() {
		if (!monthlyData?.wallets || monthlyData.wallets.length === 0) {
			airdropError = 'No wallet data available for this month';
			return;
		}

		if (!airdropTokenAddress.trim()) {
			airdropError = 'Please enter a token contract address';
			return;
		}

		// Validate token address format (basic check)
		if (!/^0x[a-fA-F0-9]{40}$/.test(airdropTokenAddress.trim())) {
			airdropError = 'Invalid token address format';
			return;
		}

		const totalTokens = parseFloat(airdropTotalTokens);
		if (isNaN(totalTokens) || totalTokens <= 0) {
			airdropError = 'Please enter a valid number of tokens to distribute';
			return;
		}

		airdropError = '';

		// Calculate total points (excluding excluded wallets)
		const eligibleWallets = monthlyData.wallets.filter(
			(w) => !excludedWalletsInData.has(w.address.toLowerCase()) && w.totalPoints > 0
		);

		const totalPoints = eligibleWallets.reduce((sum, w) => sum + w.totalPoints, 0);

		if (totalPoints === 0) {
			airdropError = 'No eligible wallets with points found';
			return;
		}

		// Generate CSV rows
		const csvRows: string[] = ['token_type,token_address,receiver,amount,id'];

		for (const wallet of eligibleWallets) {
			const share = wallet.totalPoints / totalPoints;
			const amount = totalTokens * share;

			// Format amount with high precision (18 decimals for most ERC20 tokens)
			// Using toFixed to avoid scientific notation
			const formattedAmount = amount.toFixed(18).replace(/\.?0+$/, '');

			csvRows.push(`erc20,${airdropTokenAddress.trim()},${wallet.address},${formattedAmount},`);
		}

		// Create and download the CSV file
		const csvContent = csvRows.join('\n');
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.setAttribute('href', url);
		link.setAttribute('download', `airdrop-${selectedMonth}-${Date.now()}.csv`);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);

		closeAirdropModal();
	}

	// ===== Referrals Tab State =====
	interface ReferralCodeData {
		code: string;
		label: string | null;
		wallets: string[];
		createdAt: string;
	}
	let referralsLoading = false;
	let referralsError = '';
	let referralsData: ReferralCodeData[] = [];
	let selectedReferralCode: string | null = null;

	async function loadReferrals() {
		referralsLoading = true;
		referralsError = '';

		try {
			const res = await fetch('/api/admin/referrals');
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to load referrals');
			}

			referralsData = data.referrals || [];
			// Select first code by default if available
			if (referralsData.length > 0 && !selectedReferralCode) {
				selectedReferralCode = referralsData[0].code;
			}
		} catch (err) {
			referralsError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			referralsLoading = false;
		}
	}

	// ===== Nansen Tab State =====
	type NansenTier = 'green' | 'ice' | 'north' | 'star';

	const NANSEN_TIER_INFO: Record<NansenTier, { name: string; level: number; color: string }> = {
		green: { name: 'Green', level: 1, color: 'text-green-400' },
		ice: { name: 'Ice', level: 2, color: 'text-cyan-400' },
		north: { name: 'North', level: 3, color: 'text-blue-400' },
		star: { name: 'Star', level: 4, color: 'text-yellow-400' }
	};

	interface NansenWalletData {
		address: string;
		code: string;
		lifetimePurchaseUsdc: number;
		purchaseCount: number;
		nansenTier: NansenTier | null;
		nansenPoints: number | null;
		nansenRank: number | null;
	}

	interface NansenCodeData {
		code: string;
		label: string | null;
		wallets: NansenWalletData[];
		totalLifetimePurchaseUsdc: number;
		walletCount: number;
	}

	let nansenLoading = false;
	let nansenError = '';
	let nansenData: NansenCodeData[] = [];
	let nansenTotalUsdc = 0;
	let nansenTotalWallets = 0;
	let nansenCodeFilter: string = 'all';
	let nansenTierFilter: NansenTier | 'all' | 'none' = 'all';
	let nansenDataLoaded = false;

	// Flatten all Nansen wallets, apply filters, and sort by purchase value
	$: nansenAllWallets = nansenData.flatMap((code) => code.wallets);
	$: nansenFilteredWallets = nansenAllWallets
		.filter((w) => nansenCodeFilter === 'all' || w.code === nansenCodeFilter)
		.filter((w) => {
			if (nansenTierFilter === 'all') return true;
			if (nansenTierFilter === 'none') return w.nansenTier === null;
			return w.nansenTier === nansenTierFilter;
		})
		.toSorted((a, b) => b.lifetimePurchaseUsdc - a.lifetimePurchaseUsdc);
	$: nansenAvailableCodes = nansenData.map((c) => c.code).toSorted();

	async function loadNansenData() {
		nansenLoading = true;
		nansenError = '';

		try {
			const res = await fetch('/api/admin/nansen');
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to load Nansen data');
			}

			nansenData = data.codes || [];
			nansenTotalUsdc = data.totalLifetimePurchaseUsdc || 0;
			nansenTotalWallets = data.totalWallets || 0;
			nansenDataLoaded = true;
		} catch (err) {
			nansenError = err instanceof Error ? err.message : 'Unknown error';
			nansenDataLoaded = true;
		} finally {
			nansenLoading = false;
		}
	}

	// Calculate referral rewards by joining wallet data with referral codes
	$: referralRewardsData = (() => {
		if (!referralsData.length || !monthlyData?.wallets) return [];

		// Build wallet rewards lookup
		const walletRewards = new Map<string, { points: number; reward: number }>();
		const allPoints = monthlyData.wallets.reduce((sum, w) => sum + w.totalPoints, 0);
		const basePool = currentMonthPool?.poolAmount ?? 0;

		// Calculate achieved rocket boost
		const rocketBoostAmts = currentMonthPool?.rocketBoostAmounts ?? {
			tier25: 0,
			tier50: 0,
			tier75: 0,
			tier100: 0
		};
		const daysInMonth = selectedMonth ? getDaysInMonth(selectedMonth) : 30;
		const rocketBoostTarget = (currentMonthPool?.rocketBoostTvlTarget ?? 0) * 2 * daysInMonth * 100;
		const progressPct = rocketBoostTarget > 0 ? (allPoints / rocketBoostTarget) * 100 : 0;
		const achievedAmount =
			(progressPct >= 25 ? rocketBoostAmts.tier25 : 0) +
			(progressPct >= 50 ? rocketBoostAmts.tier50 : 0) +
			(progressPct >= 75 ? rocketBoostAmts.tier75 : 0) +
			(progressPct >= 100 ? rocketBoostAmts.tier100 : 0);
		const totalPool = basePool + achievedAmount;

		for (const wallet of monthlyData.wallets) {
			const isExcluded = excludedWalletsInData.has(wallet.address.toLowerCase());
			if (!isExcluded && wallet.totalPoints > 0) {
				const share = allPoints > 0 ? wallet.totalPoints / allPoints : 0;
				walletRewards.set(wallet.address.toLowerCase(), {
					points: wallet.totalPoints,
					reward: share * totalPool
				});
			}
		}

		// Aggregate by referral code
		return referralsData
			.map((ref) => {
				const walletDetails = ref.wallets.map((addr) => {
					const data = walletRewards.get(addr.toLowerCase());
					return {
						address: addr,
						points: data?.points ?? 0,
						reward: data?.reward ?? 0
					};
				});

				// Sort by reward descending
				walletDetails.sort((a, b) => b.reward - a.reward);

				const totalPoints = walletDetails.reduce((sum, w) => sum + w.points, 0);
				const totalReward = walletDetails.reduce((sum, w) => sum + w.reward, 0);

				return {
					code: ref.code,
					label: ref.label,
					wallets: walletDetails,
					totalPoints,
					totalReward,
					walletCount: ref.wallets.length
				};
			})
			.sort((a, b) => b.totalReward - a.totalReward);
	})();

	// ===== Statement Modal State =====
	interface WalletTokenHolding {
		symbol: string;
		quantity: number;
		price: number;
		usdValue: number;
		points: number;
	}

	interface SnapshotWalletData {
		address: string;
		holdings: WalletTokenHolding[];
		totalUsdValue: number;
		totalPoints: number;
	}

	interface SnapshotData {
		blockNumber: number;
		timestamp: number;
		date: string;
		wallets: SnapshotWalletData[];
		totalUsdValue: number;
		totalPoints: number;
	}

	interface WalletSummary {
		address: string;
		totalUsdValue: number;
		totalPoints: number;
		snapshotCount: number;
		avgUsdValue: number;
	}

	interface StatementData {
		code: string;
		month: string;
		walletSummary: WalletSummary[];
		snapshots: SnapshotData[];
		totals: {
			totalUsdValue: number;
			totalPoints: number;
			snapshotCount: number;
			walletCount: number;
		};
	}

	let statementModalOpen = false;
	let statementLoading = false;
	let statementError = '';
	let statementData: StatementData | null = null;
	let statementCode = '';

	async function generateStatement(code: string) {
		if (!selectedMonth) {
			statementError = 'Please select a month first';
			return;
		}

		statementCode = code;
		statementModalOpen = true;
		statementLoading = true;
		statementError = '';
		statementData = null;

		try {
			const res = await fetch(
				`/api/admin/referrals/statement?code=${encodeURIComponent(code)}&month=${encodeURIComponent(
					selectedMonth
				)}`
			);
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to generate statement');
			}

			statementData = data;
		} catch (err) {
			statementError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			statementLoading = false;
		}
	}

	function closeStatementModal() {
		statementModalOpen = false;
		statementData = null;
		statementError = '';
	}

	function exportReferralStatementCSV() {
		if (!statementData) return;

		const lines: string[] = [];

		// Header info
		lines.push(`Referral Code Statement`);
		lines.push(`Code,${statementData.code}`);
		lines.push(`Month,${statementData.month}`);
		lines.push(`Total Wallets,${statementData.totals.walletCount}`);
		lines.push(`Total Snapshots,${statementData.totals.snapshotCount}`);
		lines.push(`Total USD Value,${statementData.totals.totalUsdValue.toFixed(2)}`);
		lines.push(`Total Points,${statementData.totals.totalPoints.toFixed(0)}`);
		lines.push('');

		// Wallet Summary
		lines.push('=== Wallet Summary ===');
		lines.push('Rank,Wallet,Snapshots,Avg USD Value,Total USD Value,Total Points');
		statementData.walletSummary.forEach((wallet, i) => {
			lines.push(
				`${i + 1},${wallet.address},${wallet.snapshotCount},${wallet.avgUsdValue.toFixed(
					2
				)},${wallet.totalUsdValue.toFixed(2)},${wallet.totalPoints.toFixed(0)}`
			);
		});
		lines.push('');

		// Snapshot Summary
		lines.push('=== Snapshot Summary ===');
		lines.push('Rank,Date,Block Number,Wallets,USD Value,Points');
		statementData.snapshots.forEach((snapshot, i) => {
			lines.push(
				`${i + 1},${snapshot.date},${snapshot.blockNumber},${
					snapshot.wallets.length
				},${snapshot.totalUsdValue.toFixed(2)},${snapshot.totalPoints.toFixed(0)}`
			);
		});
		lines.push('');

		// Detailed Breakdown
		lines.push('=== Detailed Breakdown ===');
		lines.push('Date,Block Number,Wallet,Token,Quantity,Pyth Price,USD Value,Points');
		statementData.snapshots.forEach((snapshot) => {
			snapshot.wallets.forEach((wallet) => {
				wallet.holdings.forEach((holding) => {
					lines.push(
						`${snapshot.date},${snapshot.blockNumber},${wallet.address},${holding.symbol},${
							holding.quantity
						},${holding.price.toFixed(2)},${holding.usdValue.toFixed(2)},${holding.points.toFixed(
							0
						)}`
					);
				});
			});
		});

		const csv = lines.join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `referral-statement-${statementData.code}-${statementData.month}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportReferralStatementPDF() {
		if (!statementData) return;

		const doc = new jsPDF();
		let y = 20;

		// Title
		doc.setFontSize(18);
		doc.text('Referral Code Points Statement', 14, y);
		y += 10;

		// Header info
		doc.setFontSize(10);
		doc.text(`Code: ${statementData.code}`, 14, y);
		doc.text(`Month: ${statementData.month}`, 100, y);
		y += 6;
		doc.text(`Wallets: ${statementData.totals.walletCount}`, 14, y);
		doc.text(`Snapshots: ${statementData.totals.snapshotCount}`, 100, y);
		y += 6;
		doc.text(`Total USD Value: $${statementData.totals.totalUsdValue.toFixed(2)}`, 14, y);
		doc.text(`Total Points: ${statementData.totals.totalPoints.toLocaleString()}`, 100, y);
		y += 12;

		// Wallet Summary Table
		doc.setFontSize(12);
		doc.text('1. Summary by Wallet', 14, y);
		y += 4;

		autoTable(doc, {
			startY: y,
			head: [['#', 'Wallet', 'Snapshots', 'Avg USD', 'Total USD', 'Points']],
			body: statementData.walletSummary.map((w, i) => [
				i + 1,
				w.address.slice(0, 6) + '...' + w.address.slice(-4),
				w.snapshotCount,
				'$' + w.avgUsdValue.toFixed(2),
				'$' + w.totalUsdValue.toFixed(2),
				w.totalPoints.toLocaleString()
			]),
			styles: { fontSize: 8 },
			headStyles: { fillColor: [232, 190, 137] }
		});

		y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

		// Check if need new page
		if (y > 250) {
			doc.addPage();
			y = 20;
		}

		// Snapshot Summary Table
		doc.setFontSize(12);
		doc.text('2. Summary by Snapshot', 14, y);
		y += 4;

		autoTable(doc, {
			startY: y,
			head: [['#', 'Date', 'Block', 'Wallets', 'USD Value', 'Points']],
			body: statementData.snapshots.map((s, i) => [
				i + 1,
				s.date,
				s.blockNumber.toLocaleString(),
				s.wallets.length,
				'$' + s.totalUsdValue.toFixed(2),
				s.totalPoints.toLocaleString()
			]),
			styles: { fontSize: 8 },
			headStyles: { fillColor: [232, 190, 137] }
		});

		y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

		// Detailed breakdown (new page)
		doc.addPage();
		y = 20;
		doc.setFontSize(12);
		doc.text('3. Detailed Breakdown', 14, y);
		y += 8;

		statementData.snapshots.forEach((snapshot) => {
			if (y > 250) {
				doc.addPage();
				y = 20;
			}

			doc.setFontSize(10);
			doc.text(`${snapshot.date} - Block #${snapshot.blockNumber.toLocaleString()}`, 14, y);
			y += 4;

			const detailRows: (string | number)[][] = [];
			snapshot.wallets.forEach((wallet) => {
				wallet.holdings.forEach((holding) => {
					detailRows.push([
						wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4),
						holding.symbol,
						holding.quantity.toFixed(4),
						'$' + holding.price.toFixed(2),
						'$' + holding.usdValue.toFixed(2),
						holding.points.toLocaleString()
					]);
				});
			});

			if (detailRows.length > 0) {
				autoTable(doc, {
					startY: y,
					head: [['Wallet', 'Token', 'Quantity', 'Price', 'USD Value', 'Points']],
					body: detailRows,
					styles: { fontSize: 7 },
					headStyles: { fillColor: [100, 100, 100] }
				});
				y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
			}
		});

		// Footer
		doc.setFontSize(8);
		doc.text('Points = (Token Quantity × Pyth Price) × 100', 14, y + 5);

		doc.save(`referral-statement-${statementData.code}-${statementData.month}.pdf`);
	}

	// ===== Snapshots Tab State =====
	interface SnapshotBlockRecord {
		blockNumber: number;
		timestamp: number;
		date: string;
		generatedAt: string;
	}
	let snapshotsLoading = false;
	let snapshotsError = '';
	let canonicalBlocks: SnapshotBlockRecord[] = [];
	let selectedCanonicalBlock: number | null = null;
	let selectedSnapshotToken: string = '';
	let snapshotData: BlockSnapshot | null = null;
	let snapshotDataLoading = false;

	// Aggregated wallet data across all tokens for the selected block
	interface AggregatedWalletData {
		address: string;
		totalPoints: number;
		totalValue: number;
		isExcluded: boolean;
		tokens: { symbol: string; balance: number; value: number; points: number }[];
	}
	let aggregatedWalletData: AggregatedWalletData[] = [];
	let aggregatedDataLoading = false;

	// Single block regeneration state
	let regeneratingBlockNumber: number | null = null;

	// Derived: wallet points from current snapshot
	// Uses current KV excluded wallets list instead of snapshot file's list
	$: snapshotWalletPoints = (() => {
		if (!snapshotData) return [];
		const price = snapshotData.price?.price ?? 0;

		return Object.entries(snapshotData.balances)
			.map(([address, balanceStr]) => {
				const balance = parseFloat(balanceStr) / 1e18;
				// Skip negative balances (can occur from transfer replay ordering issues)
				if (balance <= 0) return null;
				const value = balance * price;
				const isExcluded = excludedWalletsInData.has(address.toLowerCase());
				const points = isExcluded ? 0 : value * 100; // 100 points per $1

				return {
					address,
					balance,
					value,
					points,
					isExcluded
				};
			})
			.filter((w): w is NonNullable<typeof w> => w !== null)
			.sort((a, b) => b.value - a.value);
	})();

	// Manual trigger state
	let manualTriggerDate = '';
	let manualTriggerLoading = false;
	let manualTriggerError = '';
	let manualTriggerResult: {
		success: boolean;
		date: string;
		blocks: SnapshotBlockRecord[];
		blobsStored: number;
	} | null = null;
	let showTriggerConfirmModal = false;
	let triggerConfirmText = '';

	// ===== Preview Tab State =====
	let blockNumber = '';
	let previewLoading = false;
	let previewError = '';
	let previewProgress: {
		step: number;
		total: number;
		message: string;
		tokenIndex?: number;
		totalTokens?: number;
		tokenSymbol?: string;
	} | null = null;
	let previewResult: {
		success: boolean;
		blockNumber: number;
		timestamp: number;
		blockDate: string;
		transfersProcessed: number;
		tokensProcessed: number;
		walletCount: number;
		excludedCount: number;
		wallets: Array<{
			address: string;
			totalValue: number;
			totalPoints: number;
			tokens: Array<{
				symbol: string;
				address: string;
				balance: string;
				value: number;
				points: number;
			}>;
			isExcluded: boolean;
		}>;
		tokenSummary: Array<{
			token: string;
			tokenAddress: string;
			holders: number;
			totalSupply: string;
			price: number | null;
			priceConfidence: number | null;
		}>;
		snapshots: BlockSnapshot[];
	} | null = null;
	let selectedWallet: string | null = null;
	let selectedTokenFilter: string = ''; // token symbol (defaults to first token)

	// ===== Excluded Wallets Tab State =====
	let excludedLoading = false;
	let excludedError = '';
	let excludedWallets: string[] = [];
	let newWalletAddress = '';
	let addingWallet = false;

	// ===== Team Wallets Tab State =====
	let teamLoading = false;
	let teamError = '';
	let teamWallets: string[] = [];
	let newTeamWalletAddress = '';
	let addingTeamWallet = false;

	// ===== Rewards Pool Tab State =====
	interface RocketBoostTiers {
		tier25: number;
		tier50: number;
		tier75: number;
		tier100: number;
	}
	interface RewardsPoolConfig {
		month: string;
		poolAmount: number;
		rocketBoostAmounts: RocketBoostTiers;
		rocketBoostTvlTarget: number;
		notes: string;
		updatedAt: string;
	}
	let poolLoading = false;
	let poolError = '';
	let poolConfigs: RewardsPoolConfig[] = [];
	let editingPool: RewardsPoolConfig | null = null;
	let savingPool = false;

	// Form state for new/edit pool
	let poolFormMonth = '';
	let poolFormAmount = 0;
	let poolFormRocketBoostTier25 = 0;
	let poolFormRocketBoostTier50 = 0;
	let poolFormRocketBoostTier75 = 0;
	let poolFormRocketBoostTier100 = 0;
	let poolFormRocketBoostTarget = 0;
	let poolFormNotes = '';

	// Helper to get total RocketBoost amount
	$: totalRocketBoostAmount =
		poolFormRocketBoostTier25 +
		poolFormRocketBoostTier50 +
		poolFormRocketBoostTier75 +
		poolFormRocketBoostTier100;

	// Token list for snapshots tab
	const tokenSymbols = TOKENS.map((t) => t.symbol);

	onMount(() => {
		loadAvailableMonths();
		loadExcludedWallets();
		loadTeamWallets();
		loadCanonicalBlocks();
		loadPoolConfigs();
		loadReferrals();
	});

	// ===== Points Functions =====
	async function loadAvailableMonths() {
		try {
			const res = await fetch('/api/snapshots/points');
			const data = await res.json();
			if (data.availableMonths) {
				availableMonths = data.availableMonths;
				if (availableMonths.length > 0 && !selectedMonth) {
					selectedMonth = availableMonths[availableMonths.length - 1]; // Most recent month
					await loadMonthlyData();
				}
			}
		} catch (err) {
			console.error('Failed to load available months:', err);
		}
	}

	async function loadMonthlyData() {
		if (!selectedMonth) return;

		pointsLoading = true;
		pointsError = '';
		recalculateResult = null;

		try {
			const res = await fetch(`/api/snapshots/points?month=${selectedMonth}`);
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to load monthly data');
			}

			monthlyData = data;

			// Update excluded wallets set
			excludedWalletsInData = new Set(excludedWallets.map((w) => w.toLowerCase()));
		} catch (err) {
			pointsError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			pointsLoading = false;
		}
	}

	async function recalculatePoints() {
		if (!selectedMonth) return;

		recalculateLoading = true;
		recalculateError = '';
		recalculateResult = null;

		try {
			const res = await fetch('/api/admin/snapshots/recalculate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ month: selectedMonth })
			});

			const data = await res.json();

			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to recalculate points');
			}

			recalculateResult = {
				snapshotCount: data.snapshotCount,
				walletCount: data.walletCount,
				totalPoints: data.totalPoints,
				tokensProcessed: data.tokensProcessed,
				blockNumbers: data.blockNumbers,
				comparison: data.comparison,
				excludedWalletsApplied: data.excludedWalletsApplied,
				totalExcludedPoints: data.totalExcludedPoints,
				debug: data.debug
			};

			// Reload the monthly data
			await loadMonthlyData();
		} catch (err) {
			recalculateError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			recalculateLoading = false;
		}
	}

	async function regenerateSnapshots() {
		if (!selectedMonth) return;
		if (regenerateConfirmText !== 'REGENERATE') {
			regenerateError = 'Please type REGENERATE to confirm';
			return;
		}

		regenerateLoading = true;
		regenerateError = '';
		regenerateResult = null;

		try {
			const res = await fetch('/api/admin/snapshots/regenerate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					confirmText: regenerateConfirmText,
					month: selectedMonth
				})
			});

			const data = await res.json();

			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to regenerate snapshots');
			}

			regenerateResult = {
				successful: data.successful,
				failed: data.failed,
				totalBlocks: data.totalBlocks,
				results: data.results
			};

			// Clear confirm text
			regenerateConfirmText = '';

			// Show message to run recalculate points
			alert(
				`Regenerated ${data.successful} snapshots (${data.failed} failed). Please click "Recalculate Points" to update monthly points data.`
			);
		} catch (err) {
			regenerateError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			regenerateLoading = false;
		}
	}

	async function regenerateSingleBlock(blockNumber: number) {
		if (regeneratingBlockNumber !== null) return; // Already regenerating

		regeneratingBlockNumber = blockNumber;

		try {
			const res = await fetch('/api/admin/snapshots/regenerate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ blockNumber })
			});

			const data = await res.json();

			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to regenerate snapshot');
			}

			// Check if the individual block result was successful
			const blockResult = data.results?.[0];
			if (blockResult && !blockResult.success) {
				throw new Error(blockResult.error || 'Block regeneration failed');
			}

			if (!blockResult || blockResult.tokensGenerated === 0) {
				alert(
					`Warning: Block ${blockNumber} regeneration returned 0 tokens. This may indicate an issue. Check server logs for details.`
				);
			} else {
				alert(
					`Block ${blockNumber} regenerated successfully (${blockResult.tokensGenerated} tokens). Use "Recalculate Points" to update monthly data.`
				);
			}

			// Reload the snapshot data if this block is currently selected
			if (selectedCanonicalBlock === blockNumber) {
				await loadAggregatedData();
			}
		} catch (err) {
			alert(
				`Error regenerating block ${blockNumber}: ${
					err instanceof Error ? err.message : 'Unknown error'
				}`
			);
		} finally {
			regeneratingBlockNumber = null;
		}
	}

	/* eslint-disable @typescript-eslint/no-unused-vars */
	// Parameters are used to force Svelte to track dependencies
	function getWalletRows(
		_monthlyData: typeof monthlyData,
		_hideExcluded: boolean,
		_excludedWalletsInData: Set<string>,
		_currentMonthPool: typeof currentMonthPool
	) {
		/* eslint-enable @typescript-eslint/no-unused-vars */
		if (!monthlyData?.wallets) {
			return [];
		}

		// Calculate total points for share calculation (excluding excluded wallets)
		const allPoints = monthlyData.wallets
			.filter((w) => !excludedWalletsInData.has(w.address.toLowerCase()))
			.reduce((sum, w) => sum + w.totalPoints, 0);

		// Calculate total RocketBoost amount available
		const rocketBoostAmts = currentMonthPool?.rocketBoostAmounts ?? {
			tier25: 0,
			tier50: 0,
			tier75: 0,
			tier100: 0
		};
		const maxRocketBoostAmount =
			rocketBoostAmts.tier25 +
			rocketBoostAmts.tier50 +
			rocketBoostAmts.tier75 +
			rocketBoostAmts.tier100;

		// Calculate progress and achieved amount locally to avoid circular dependency
		const daysInMonth = selectedMonth ? getDaysInMonth(selectedMonth) : 30;
		const rocketBoostTarget = (currentMonthPool?.rocketBoostTvlTarget ?? 0) * 2 * daysInMonth * 100;
		const progressPct = rocketBoostTarget > 0 ? (allPoints / rocketBoostTarget) * 100 : 0;
		const achievedAmount =
			(progressPct >= 25 ? rocketBoostAmts.tier25 : 0) +
			(progressPct >= 50 ? rocketBoostAmts.tier50 : 0) +
			(progressPct >= 75 ? rocketBoostAmts.tier75 : 0) +
			(progressPct >= 100 ? rocketBoostAmts.tier100 : 0);

		const rows = monthlyData.wallets.map((wallet) => {
			const isExcluded = excludedWalletsInData.has(wallet.address.toLowerCase());
			// Excluded wallets get 0 share since they don't receive rewards
			const share = isExcluded ? 0 : allPoints > 0 ? wallet.totalPoints / allPoints : 0;

			// Calculate rewards
			const basePool = currentMonthPool?.poolAmount ?? 0;
			const rewardBase = share * basePool;
			const rewardWithRocketBoost = share * (basePool + maxRocketBoostAmount);

			return {
				...wallet,
				isExcluded,
				share,
				rewardBase,
				rewardWithRocketBoost,
				rewardActual: share * (basePool + achievedAmount)
			};
		});

		// Filter if hiding excluded
		const filtered = hideExcluded ? rows.filter((r) => !r.isExcluded) : rows;

		// Already sorted by API (by totalPoints descending)
		return filtered;
	}

	// Calculate RocketBoost target in points and progress
	function getDaysInMonth(monthStr: string): number {
		if (!monthStr || !monthStr.includes('-')) return 30; // Default fallback
		const [year, month] = monthStr.split('-').map(Number);
		if (isNaN(year) || isNaN(month)) return 30; // Default fallback
		return new Date(year, month, 0).getDate();
	}

	$: rocketBoostTargetPoints =
		currentMonthPool && currentMonthPool.rocketBoostTvlTarget
			? currentMonthPool.rocketBoostTvlTarget * 2 * getDaysInMonth(selectedMonth) * 100
			: 0;

	$: rocketBoostProgressPercent =
		rocketBoostTargetPoints > 0 ? (totalPoints / rocketBoostTargetPoints) * 100 : 0;

	// Calculate achieved RocketBoost amount based on progress
	$: achievedRocketBoostAmount = currentMonthPool
		? (rocketBoostProgressPercent >= 25 ? currentMonthPool.rocketBoostAmounts.tier25 : 0) +
			(rocketBoostProgressPercent >= 50 ? currentMonthPool.rocketBoostAmounts.tier50 : 0) +
			(rocketBoostProgressPercent >= 75 ? currentMonthPool.rocketBoostAmounts.tier75 : 0) +
			(rocketBoostProgressPercent >= 100 ? currentMonthPool.rocketBoostAmounts.tier100 : 0)
		: 0;

	// Calculate effective pool amount (currently achieved)
	$: effectivePoolAmount = currentMonthPool
		? currentMonthPool.poolAmount + achievedRocketBoostAmount
		: 0;

	// Calculate PROJECTED pool (extrapolate last 3 days' rate to end of month)
	$: daysElapsedInMonth = monthlyData ? Math.max(1, Math.floor(monthlyData.snapshotCount / 2)) : 1;
	$: daysInSelectedMonth = selectedMonth ? getDaysInMonth(selectedMonth) : 30;
	$: daysRemainingInMonth = Math.max(0, daysInSelectedMonth - daysElapsedInMonth);
	$: avgDailyPoints = computeProjectedDailyPoints(
		totalPoints,
		daysElapsedInMonth,
		monthlyData?.snapshotTotals ?? []
	);
	$: projectedTotalPoints = totalPoints + avgDailyPoints * daysRemainingInMonth;
	$: projectedProgressPercent =
		rocketBoostTargetPoints > 0 ? (projectedTotalPoints / rocketBoostTargetPoints) * 100 : 0;
	$: projectedRocketBoostAmount = currentMonthPool
		? (projectedProgressPercent >= 25 ? currentMonthPool.rocketBoostAmounts.tier25 : 0) +
			(projectedProgressPercent >= 50 ? currentMonthPool.rocketBoostAmounts.tier50 : 0) +
			(projectedProgressPercent >= 75 ? currentMonthPool.rocketBoostAmounts.tier75 : 0) +
			(projectedProgressPercent >= 100 ? currentMonthPool.rocketBoostAmounts.tier100 : 0)
		: 0;
	$: projectedPoolAmount = currentMonthPool
		? currentMonthPool.poolAmount + projectedRocketBoostAmount
		: 0;

	// Calculate pool APY (compound): ((1 + monthlyReturn) ^ 12 - 1) * 100
	// avgTvl = totalPoints / snapshotCount / 100
	$: poolApy = (() => {
		if (!monthlyData || !effectivePoolAmount || totalPoints <= 0 || monthlyData.snapshotCount <= 0)
			return null;
		const avgTvl = totalPoints / monthlyData.snapshotCount / 100;
		if (avgTvl <= 0) return null;
		const monthlyReturn = effectivePoolAmount / avgTvl;
		return (Math.pow(1 + monthlyReturn, 12) - 1) * 100;
	})();

	function formatApy(apy: number | null): string {
		if (apy === null) return '-';
		if (apy >= 1000) return (apy / 1000).toFixed(1) + 'K%';
		if (apy >= 100) return Math.round(apy) + '%';
		return apy.toFixed(1) + '%';
	}

	// ===== Snapshots Functions =====
	async function loadCanonicalBlocks() {
		snapshotsLoading = true;
		snapshotsError = '';

		try {
			const res = await fetch('/api/snapshots/blocks?limit=200');
			const data = await res.json();

			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to load snapshot blocks');
			}

			canonicalBlocks = data.blocks || [];

			// Default to first block and first token
			if (canonicalBlocks.length > 0 && !selectedCanonicalBlock) {
				selectedCanonicalBlock = canonicalBlocks[0].blockNumber;
			}
			if (tokenSymbols.length > 0 && !selectedSnapshotToken) {
				selectedSnapshotToken = tokenSymbols[0];
			}

			// Load snapshot data for default selection
			if (selectedCanonicalBlock && selectedSnapshotToken) {
				await loadSnapshotData();
				await loadAggregatedData();
			}
		} catch (err) {
			snapshotsError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			snapshotsLoading = false;
		}
	}

	async function loadSnapshotData() {
		if (!selectedCanonicalBlock || !selectedSnapshotToken) return;

		snapshotDataLoading = true;
		snapshotData = null;

		try {
			const res = await fetch(
				`/api/snapshots/get?block=${selectedCanonicalBlock}&token=${selectedSnapshotToken}`
			);
			const data = await res.json();

			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Snapshot not found');
			}

			snapshotData = data.snapshot;
		} catch (err) {
			snapshotsError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			snapshotDataLoading = false;
		}
	}

	// Load all token snapshots for a block and aggregate wallet data
	async function loadAggregatedData() {
		if (!selectedCanonicalBlock) return;

		aggregatedDataLoading = true;
		aggregatedWalletData = [];

		try {
			// Load all tokens for this block (no token param = all tokens)
			const res = await fetch(`/api/snapshots/get?block=${selectedCanonicalBlock}`);
			const data = await res.json();

			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to load snapshots');
			}

			// Aggregate wallet data across all tokens
			const walletMap = new Map<string, AggregatedWalletData>();

			for (const { token, snapshot } of data.snapshots) {
				if (!snapshot) continue;

				const price = snapshot.price?.price ?? 0;

				for (const [address, balanceStr] of Object.entries(snapshot.balances)) {
					const balance = parseFloat(balanceStr as string) / 1e18;
					// Skip negative balances (can occur from transfer replay ordering issues)
					if (balance <= 0) continue;
					const value = balance * price;
					// Use current KV excluded wallets list instead of snapshot file's list
					const isExcluded = excludedWalletsInData.has(address.toLowerCase());
					const points = isExcluded ? 0 : value * 100;

					const existing = walletMap.get(address.toLowerCase());
					if (existing) {
						existing.totalPoints += points;
						existing.totalValue += value;
						existing.isExcluded = existing.isExcluded || isExcluded;
						existing.tokens.push({ symbol: token, balance, value, points });
					} else {
						walletMap.set(address.toLowerCase(), {
							address,
							totalPoints: points,
							totalValue: value,
							isExcluded,
							tokens: [{ symbol: token, balance, value, points }]
						});
					}
				}
			}

			// Convert to array and sort by total points
			aggregatedWalletData = Array.from(walletMap.values()).sort(
				(a, b) => b.totalPoints - a.totalPoints
			);
		} catch (err) {
			snapshotsError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			aggregatedDataLoading = false;
		}
	}

	function selectCanonicalBlock(block: number) {
		selectedCanonicalBlock = block;
		loadSnapshotData();
		loadAggregatedData();
	}

	// Open confirmation modal for manual trigger
	function openTriggerConfirmModal() {
		if (!manualTriggerDate) {
			manualTriggerError = 'Please select a date';
			return;
		}
		manualTriggerError = '';
		triggerConfirmText = '';
		showTriggerConfirmModal = true;
	}

	// Close confirmation modal
	function closeTriggerConfirmModal() {
		showTriggerConfirmModal = false;
		triggerConfirmText = '';
	}

	// Execute manual trigger after confirmation
	async function executeManualTrigger() {
		if (triggerConfirmText !== 'CONFIRM') {
			manualTriggerError = 'Please type CONFIRM to proceed';
			return;
		}

		// Capture values before closing modal (which resets triggerConfirmText)
		const dateToTrigger = manualTriggerDate;
		const confirmValue = triggerConfirmText;

		closeTriggerConfirmModal();
		manualTriggerLoading = true;
		manualTriggerError = '';
		manualTriggerResult = null;

		try {
			const res = await fetch('/api/admin/snapshots/trigger', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					date: dateToTrigger,
					confirmText: confirmValue
				})
			});

			const data = await res.json();

			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to trigger snapshot');
			}

			manualTriggerResult = data;
			// Reload the canonical blocks list
			await loadCanonicalBlocks();
		} catch (err) {
			manualTriggerError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			manualTriggerLoading = false;
		}
	}

	// ===== Preview Functions =====
	async function generatePreview() {
		if (!blockNumber.trim()) {
			previewError = 'Please enter a block number';
			return;
		}

		previewLoading = true;
		previewError = '';
		previewResult = null;
		previewProgress = null;
		selectedWallet = null;
		selectedTokenFilter = '';

		try {
			// Use EventSource for streaming progress updates
			const eventSource = new EventSource(
				`/api/snapshots/preview-stream?block=${blockNumber.trim()}`
			);

			eventSource.addEventListener('progress', (event) => {
				const data = JSON.parse(event.data);
				previewProgress = {
					step: data.step,
					total: data.total,
					message: data.message
				};
			});

			eventSource.addEventListener('token-progress', (event) => {
				const data = JSON.parse(event.data);
				previewProgress = {
					step: 5,
					total: 6,
					message: `Processing ${data.tokenSymbol}...`,
					tokenIndex: data.tokenIndex,
					totalTokens: data.totalTokens,
					tokenSymbol: data.tokenSymbol
				};
			});

			eventSource.addEventListener('complete', (event) => {
				const data = JSON.parse(event.data);
				previewResult = data;
				previewProgress = null;
				previewLoading = false;
				eventSource.close();

				// Default to first token
				if (data.tokenSummary?.length > 0) {
					selectedTokenFilter = data.tokenSummary[0].token;
				}
			});

			eventSource.addEventListener('error', (event) => {
				try {
					const data = JSON.parse((event as MessageEvent).data);
					previewError = data.message || 'Unknown error';
				} catch {
					previewError = 'Connection error';
				}
				previewProgress = null;
				previewLoading = false;
				eventSource.close();
			});

			eventSource.onerror = () => {
				previewError = 'Connection lost';
				previewProgress = null;
				previewLoading = false;
				eventSource.close();
			};
		} catch (err) {
			previewError = err instanceof Error ? err.message : 'Unknown error';
			previewProgress = null;
			previewLoading = false;
		}
	}

	// Get filtered preview wallets for selected token (respecting hideExcluded toggle)
	$: previewWallets = (() => {
		if (!previewResult?.wallets || !selectedTokenFilter) return [];

		// Filter to only wallets holding the selected token
		let wallets = previewResult.wallets
			.map((w) => {
				const tokenData = w.tokens.find((t) => t.symbol === selectedTokenFilter);
				if (!tokenData) return null;
				return {
					...w,
					tokens: [tokenData],
					totalValue: tokenData.value,
					totalPoints: tokenData.points
				};
			})
			.filter((w): w is NonNullable<typeof w> => w !== null);

		// Filter excluded if toggle is on
		if (hideExcluded) {
			wallets = wallets.filter((w) => !w.isExcluded);
		}

		// Sort by value
		return wallets.sort((a, b) => b.totalValue - a.totalValue);
	})();

	// Get selected wallet details
	$: selectedWalletData = previewWallets.find((w) => w.address === selectedWallet) || null;

	// Get the actual BlockSnapshot for the selected token (what would be stored to blob)
	$: selectedTokenSnapshot =
		previewResult?.snapshots.find((s) => s.tokenSymbol === selectedTokenFilter) || null;

	// ===== Excluded Wallets Functions =====
	async function loadExcludedWallets() {
		excludedLoading = true;
		excludedError = '';

		try {
			const res = await fetch('/api/admin/excluded-wallets');
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to load excluded wallets');
			}

			excludedWallets = data.wallets || [];
			excludedWalletsInData = new Set(excludedWallets.map((w) => w.toLowerCase()));
		} catch (err) {
			excludedError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			excludedLoading = false;
		}
	}

	async function addExcludedWallet() {
		if (!newWalletAddress.trim()) return;

		// Basic validation
		const address = newWalletAddress.trim().toLowerCase();
		if (!/^0x[a-f0-9]{40}$/i.test(address)) {
			excludedError = 'Invalid Ethereum address';
			return;
		}

		if (excludedWallets.includes(address)) {
			excludedError = 'Address already in excluded list';
			return;
		}

		addingWallet = true;
		excludedError = '';

		try {
			const res = await fetch('/api/admin/excluded-wallets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'add', address })
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to add wallet');
			}

			excludedWallets = data.wallets || [];
			excludedWalletsInData = new Set(excludedWallets.map((w) => w.toLowerCase()));
			newWalletAddress = '';
		} catch (err) {
			excludedError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			addingWallet = false;
		}
	}

	async function removeExcludedWallet(address: string) {
		try {
			const res = await fetch('/api/admin/excluded-wallets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'remove', address })
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to remove wallet');
			}

			excludedWallets = data.wallets || [];
			excludedWalletsInData = new Set(excludedWallets.map((w) => w.toLowerCase()));
		} catch (err) {
			excludedError = err instanceof Error ? err.message : 'Unknown error';
		}
	}

	// ===== Team Wallets Functions =====
	async function loadTeamWallets() {
		teamLoading = true;
		teamError = '';

		try {
			const res = await fetch('/api/admin/team-wallets');
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to load team wallets');
			}

			teamWallets = data.wallets || [];
		} catch (err) {
			teamError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			teamLoading = false;
		}
	}

	async function addTeamWallet() {
		if (!newTeamWalletAddress.trim()) return;

		// Basic validation
		const address = newTeamWalletAddress.trim().toLowerCase();
		if (!/^0x[a-f0-9]{40}$/i.test(address)) {
			teamError = 'Invalid Ethereum address';
			return;
		}

		if (teamWallets.includes(address)) {
			teamError = 'Address already in team wallets list';
			return;
		}

		addingTeamWallet = true;
		teamError = '';

		try {
			const res = await fetch('/api/admin/team-wallets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'add', address })
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to add wallet');
			}

			teamWallets = data.wallets || [];
			newTeamWalletAddress = '';
		} catch (err) {
			teamError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			addingTeamWallet = false;
		}
	}

	async function removeTeamWallet(address: string) {
		try {
			const res = await fetch('/api/admin/team-wallets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'remove', address })
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to remove wallet');
			}

			teamWallets = data.wallets || [];
		} catch (err) {
			teamError = err instanceof Error ? err.message : 'Unknown error';
		}
	}

	// ===== Rewards Pool Functions =====
	async function loadPoolConfigs() {
		poolLoading = true;
		poolError = '';

		try {
			const res = await fetch('/api/admin/rewards-pool');
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to load pool configs');
			}

			poolConfigs = data.pools || [];
		} catch (err) {
			poolError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			poolLoading = false;
		}
	}

	function startNewPool() {
		// Default to current month
		const now = new Date();
		const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

		poolFormMonth = currentMonth;
		poolFormAmount = 0;
		poolFormRocketBoostTier25 = 0;
		poolFormRocketBoostTier50 = 0;
		poolFormRocketBoostTier75 = 0;
		poolFormRocketBoostTier100 = 0;
		poolFormRocketBoostTarget = 0;
		poolFormNotes = '';
		editingPool = null;
	}

	function editPool(config: RewardsPoolConfig) {
		poolFormMonth = config.month;
		poolFormAmount = config.poolAmount;
		poolFormRocketBoostTier25 = config.rocketBoostAmounts?.tier25 ?? 0;
		poolFormRocketBoostTier50 = config.rocketBoostAmounts?.tier50 ?? 0;
		poolFormRocketBoostTier75 = config.rocketBoostAmounts?.tier75 ?? 0;
		poolFormRocketBoostTier100 = config.rocketBoostAmounts?.tier100 ?? 0;
		poolFormRocketBoostTarget = config.rocketBoostTvlTarget;
		poolFormNotes = config.notes;
		editingPool = config;
	}

	function cancelPoolEdit() {
		editingPool = null;
		poolFormMonth = '';
	}

	async function savePool() {
		if (!poolFormMonth) {
			poolError = 'Month is required';
			return;
		}

		savingPool = true;
		poolError = '';

		try {
			const res = await fetch('/api/admin/rewards-pool', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					month: poolFormMonth,
					poolAmount: poolFormAmount,
					rocketBoostAmounts: {
						tier25: poolFormRocketBoostTier25,
						tier50: poolFormRocketBoostTier50,
						tier75: poolFormRocketBoostTier75,
						tier100: poolFormRocketBoostTier100
					},
					rocketBoostTvlTarget: poolFormRocketBoostTarget,
					notes: poolFormNotes
				})
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to save pool config');
			}

			// Reload configs
			await loadPoolConfigs();

			// Clear form
			editingPool = null;
			poolFormMonth = '';
		} catch (err) {
			poolError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			savingPool = false;
		}
	}

	async function deletePool(month: string) {
		if (!confirm(`Delete rewards pool config for ${month}?`)) return;

		try {
			const res = await fetch(`/api/admin/rewards-pool?month=${month}`, {
				method: 'DELETE'
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to delete pool config');
			}

			// Reload configs
			await loadPoolConfigs();
		} catch (err) {
			poolError = err instanceof Error ? err.message : 'Unknown error';
		}
	}

	// ===== Utility Functions =====
	function formatNumber(value: string | number, decimals = 18): string {
		const num = typeof value === 'string' ? parseFloat(value) / Math.pow(10, decimals) : value;
		if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
		if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
		return num.toFixed(4);
	}

	function formatUsd(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}

	function formatPrice(price: number | null): string {
		if (price === null) return 'N/A';
		return '$' + price.toFixed(2);
	}

	function formatAddress(address: string): string {
		return address.slice(0, 6) + '...' + address.slice(-4);
	}

	// ===== Wallet Search & Filter =====
	let walletSearchQuery = '';

	// Pass dependencies as parameters so Svelte tracks them for reactivity
	$: walletRows = getWalletRows(monthlyData, hideExcluded, excludedWalletsInData, currentMonthPool);
	$: totalPoints = walletRows.reduce((sum, r) => sum + r.totalPoints, 0);

	// Filter wallets by search query (case-insensitive partial match)
	$: filteredWalletRows = walletSearchQuery.trim()
		? walletRows.filter((row) =>
				row.address.toLowerCase().includes(walletSearchQuery.trim().toLowerCase())
			)
		: walletRows;

	// ===== Wallet Statement Modal =====
	interface WalletTokenHolding {
		symbol: string;
		quantity: number;
		price: number;
		usdValue: number;
		points: number;
	}

	interface WalletSnapshotData {
		blockNumber: number;
		timestamp: number;
		date: string;
		holdings: WalletTokenHolding[];
		totalUsdValue: number;
		totalPoints: number;
	}

	interface WalletStatementData {
		wallet: string;
		month: string;
		snapshots: WalletSnapshotData[];
		totals: {
			totalUsdValue: number;
			totalPoints: number;
			avgUsdValue: number;
			snapshotCount: number;
		};
	}

	let walletStatementModalOpen = false;
	let walletStatementLoading = false;
	let walletStatementError = '';
	let walletStatementData: WalletStatementData | null = null;
	let walletStatementAddress = '';

	async function generateWalletStatement(walletAddress: string) {
		if (!selectedMonth) {
			walletStatementError = 'Please select a month first';
			return;
		}

		walletStatementAddress = walletAddress;
		walletStatementModalOpen = true;
		walletStatementLoading = true;
		walletStatementError = '';
		walletStatementData = null;

		try {
			const res = await fetch(
				`/api/admin/wallet/statement?wallet=${encodeURIComponent(
					walletAddress
				)}&month=${encodeURIComponent(selectedMonth)}`
			);
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to generate wallet statement');
			}

			walletStatementData = data;
		} catch (err) {
			walletStatementError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			walletStatementLoading = false;
		}
	}

	function closeWalletStatementModal() {
		walletStatementModalOpen = false;
		walletStatementData = null;
		walletStatementError = '';
	}

	function exportWalletStatementCSV() {
		if (!walletStatementData) return;

		const lines: string[] = [];

		// Header info
		lines.push(`Wallet Points Statement`);
		lines.push(`Wallet,${walletStatementData.wallet}`);
		lines.push(`Month,${walletStatementData.month}`);
		lines.push(`Total Snapshots,${walletStatementData.totals.snapshotCount}`);
		lines.push(`Avg USD Value,${walletStatementData.totals.avgUsdValue.toFixed(2)}`);
		lines.push(`End of month USD value,${walletStatementData.totals.totalUsdValue.toFixed(2)}`);
		lines.push(`Total Points,${walletStatementData.totals.totalPoints.toFixed(0)}`);
		lines.push('');

		// Detailed by Snapshot
		lines.push('=== Holdings by Snapshot ===');
		lines.push('Date,Block Number,Token,Quantity,Pyth Price,USD Value,Points');
		walletStatementData.snapshots.forEach((snapshot) => {
			snapshot.holdings.forEach((holding) => {
				lines.push(
					`${snapshot.date},${snapshot.blockNumber},${holding.symbol},${
						holding.quantity
					},${holding.price.toFixed(2)},${holding.usdValue.toFixed(2)},${holding.points.toFixed(0)}`
				);
			});
			// Add snapshot subtotal
			lines.push(
				`${snapshot.date},${snapshot.blockNumber},SUBTOTAL,,,${snapshot.totalUsdValue.toFixed(
					2
				)},${snapshot.totalPoints.toFixed(0)}`
			);
		});

		const csv = lines.join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `wallet-statement-${walletStatementData.wallet.slice(0, 8)}-${
			walletStatementData.month
		}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportWalletStatementPDF() {
		if (!walletStatementData) return;

		const doc = new jsPDF();
		let y = 20;

		// Title
		doc.setFontSize(18);
		doc.text('Wallet Points Statement', 14, y);
		y += 10;

		// Header info
		doc.setFontSize(10);
		doc.text(
			`Wallet: ${walletStatementData.wallet.slice(0, 6)}...${walletStatementData.wallet.slice(-4)}`,
			14,
			y
		);
		doc.text(`Month: ${walletStatementData.month}`, 120, y);
		y += 6;
		doc.text(`Total Snapshots: ${walletStatementData.totals.snapshotCount}`, 14, y);
		doc.text(`Avg USD Value: $${walletStatementData.totals.avgUsdValue.toFixed(2)}`, 120, y);
		y += 6;
		doc.text(
			`End of month USD value: $${walletStatementData.totals.totalUsdValue.toFixed(2)}`,
			14,
			y
		);
		doc.text(`Total Points: ${walletStatementData.totals.totalPoints.toLocaleString()}`, 120, y);
		y += 12;

		// Holdings by Snapshot
		doc.setFontSize(12);
		doc.text('Holdings by Snapshot', 14, y);
		y += 8;

		walletStatementData.snapshots.forEach((snapshot) => {
			if (y > 250) {
				doc.addPage();
				y = 20;
			}

			doc.setFontSize(10);
			doc.text(`${snapshot.date} - Block #${snapshot.blockNumber.toLocaleString()}`, 14, y);
			doc.setFontSize(8);
			doc.text(
				`Total: $${snapshot.totalUsdValue.toFixed(
					2
				)} | ${snapshot.totalPoints.toLocaleString()} pts`,
				140,
				y
			);
			y += 4;

			if (snapshot.holdings.length > 0) {
				autoTable(doc, {
					startY: y,
					head: [['Token', 'Quantity', 'Pyth Price', 'USD Value', 'Points']],
					body: snapshot.holdings.map((h) => [
						h.symbol,
						h.quantity.toFixed(4),
						'$' + h.price.toFixed(2),
						'$' + h.usdValue.toFixed(2),
						h.points.toLocaleString()
					]),
					styles: { fontSize: 8 },
					headStyles: { fillColor: [232, 190, 137] }
				});
				y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
			}
		});

		// Footer
		doc.setFontSize(8);
		doc.text('Points = (Token Quantity × Pyth Price) × 100', 14, y + 5);

		doc.save(
			`wallet-statement-${walletStatementData.wallet.slice(0, 8)}-${walletStatementData.month}.pdf`
		);
	}
</script>

<svelte:head>
	<title>Rewards | Admin</title>
</svelte:head>

<div class="py-8">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold">Rewards</h1>
		<p class="mt-1 text-sm text-gray-400">
			Manage snapshots, points tracking, and excluded wallets
		</p>
	</div>

	<!-- Tab Navigation -->
	<div class="mb-6 border-b border-gray-700">
		<nav class="-mb-px flex gap-6">
			<button
				on:click={() => (activeTab = 'points')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'points'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Monthly Points
			</button>
			<button
				on:click={() => (activeTab = 'snapshots')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'snapshots'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Snapshots
			</button>
			<button
				on:click={() => (activeTab = 'preview')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'preview'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Snapshot Tester
			</button>
			<button
				on:click={() => (activeTab = 'excluded')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'excluded'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Excluded Wallets
			</button>
			<button
				on:click={() => (activeTab = 'team')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'team'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Team Wallets
			</button>
			<button
				on:click={() => (activeTab = 'pool')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'pool'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Rewards Pool
			</button>
			<button
				on:click={() => (activeTab = 'referrals')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'referrals'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Referrals
			</button>
			<button
				on:click={() => {
					activeTab = 'nansen';
					if (!nansenDataLoaded && !nansenLoading) {
						loadNansenData();
					}
				}}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'nansen'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Nansen
			</button>
		</nav>
	</div>

	<!-- Hide Excluded Toggle (shown on Points and Preview tabs) -->
	{#if activeTab === 'points' || activeTab === 'preview'}
		<div class="mb-4">
			<label class="flex items-center gap-2 text-sm text-gray-300">
				<input
					type="checkbox"
					bind:checked={hideExcluded}
					class="h-4 w-4 rounded border-gray-600 bg-gray-800 text-[#e8be89] focus:ring-[#e8be89]"
				/>
				Hide excluded wallets
			</label>
		</div>
	{/if}

	<!-- Points Tab -->
	{#if activeTab === 'points'}
		<div class="space-y-6">
			<!-- Month Selector and Recalculate -->
			<Card>
				<div class="flex flex-wrap items-center justify-between gap-4">
					<div class="flex flex-wrap items-center gap-4">
						<span class="text-sm font-medium text-gray-400">Month:</span>
						<select
							bind:value={selectedMonth}
							on:change={() => loadMonthlyData()}
							class="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-[#e8be89] focus:outline-none"
						>
							{#each availableMonths as month}
								<option value={month}>{month}</option>
							{/each}
						</select>
						{#if monthlyData}
							<span class="text-sm text-gray-500">
								{monthlyData.snapshotCount} snapshots &middot; Last updated: {new Date(
									monthlyData.updatedAt
								).toLocaleString()}
							</span>
						{/if}
					</div>
					<div class="flex gap-2">
						<button
							on:click={recalculatePoints}
							disabled={recalculateLoading || !selectedMonth}
							class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if recalculateLoading}
								<span class="flex items-center gap-2">
									<div
										class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
									></div>
									Recalculating...
								</span>
							{:else}
								Recalculate Points
							{/if}
						</button>
						<button
							on:click={openAirdropModal}
							disabled={!selectedMonth || !monthlyData?.wallets?.length}
							class="rounded-md bg-[#e8be89] px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-[#d4a876] disabled:cursor-not-allowed disabled:opacity-50"
						>
							Generate Airdrop CSV
						</button>
					</div>
				</div>

				{#if recalculateError}
					<p class="mt-3 text-sm text-red-400">{recalculateError}</p>
				{/if}

				{#if recalculateResult}
					<div class="mt-3 rounded-md bg-green-900/30 p-3 text-sm">
						<p class="font-medium text-green-400">Points recalculated successfully!</p>
						<p class="mt-1 text-gray-300">
							{recalculateResult.snapshotCount} snapshots processed &middot;
							{recalculateResult.walletCount} wallets &middot;
							{recalculateResult.totalPoints.toLocaleString()} total points
						</p>
						{#if recalculateResult.tokensProcessed}
							<p class="mt-1 text-xs text-gray-400">
								Tokens: {recalculateResult.tokensProcessed.join(', ') || 'none'}
							</p>
						{/if}
						{#if recalculateResult.blockNumbers}
							<p class="mt-1 text-xs text-gray-400">
								Blocks: {recalculateResult.blockNumbers.join(', ') || 'none'}
							</p>
						{/if}
						{#if recalculateResult.comparison}
							<div class="mt-2 rounded bg-yellow-900/30 p-2 text-xs">
								<p class="font-medium text-yellow-400">Changes Applied:</p>
								<ul class="mt-1 space-y-0.5 text-gray-300">
									<li>
										Wallets: {recalculateResult.comparison.previousWalletCount} → {recalculateResult.walletCount}
										{#if recalculateResult.comparison.walletsRemoved > 0}
											<span class="text-red-400"
												>(-{recalculateResult.comparison.walletsRemoved} excluded)</span
											>
										{:else if recalculateResult.comparison.walletsRemoved < 0}
											<span class="text-green-400"
												>(+{Math.abs(recalculateResult.comparison.walletsRemoved)} added)</span
											>
										{:else}
											<span class="text-gray-500">(no change)</span>
										{/if}
									</li>
									<li>
										Points: {recalculateResult.comparison.previousTotalPoints.toLocaleString()} → {recalculateResult.totalPoints.toLocaleString()}
										{#if recalculateResult.comparison.pointsRemoved > 0}
											<span class="text-red-400"
												>(-{recalculateResult.comparison.pointsRemoved.toLocaleString()} removed)</span
											>
										{:else if recalculateResult.comparison.pointsRemoved < 0}
											<span class="text-green-400"
												>(+{Math.abs(recalculateResult.comparison.pointsRemoved).toLocaleString()} added)</span
											>
										{:else}
											<span class="text-gray-500">(no change)</span>
										{/if}
									</li>
								</ul>
							</div>
						{/if}
						{#if recalculateResult.excludedWalletsApplied && recalculateResult.excludedWalletsApplied.length > 0}
							<div class="mt-2 rounded bg-red-900/30 p-2 text-xs">
								<p class="font-medium text-red-400">
									Excluded Wallets ({recalculateResult.excludedWalletsApplied.length}):
									<span class="font-normal text-gray-300">
										{recalculateResult.totalExcludedPoints?.toLocaleString() || 0} points removed
									</span>
								</p>
								<ul class="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-gray-400">
									{#each recalculateResult.excludedWalletsApplied as excluded}
										<li class="font-mono">
											{excluded.address.slice(0, 10)}...{excluded.address.slice(-8)}
											<span class="text-red-400"
												>-{excluded.pointsExcluded.toLocaleString()} pts</span
											>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
						{#if recalculateResult.debug}
							<div class="mt-2 rounded bg-gray-800/50 p-2 text-xs text-gray-400">
								<p class="font-medium text-gray-300">Debug Info:</p>
								<ul class="mt-1 space-y-0.5">
									<li>KV blocks found for month: {recalculateResult.debug.blocksFound}</li>
									<li>
										Target block numbers: {recalculateResult.debug.targetBlockNumbers?.join(', ') ||
											'none'}
									</li>
									<li>Total blobs in storage: {recalculateResult.debug.totalBlobsInStorage}</li>
									<li>
										Blobs matching target blocks: {recalculateResult.debug.blobsMatchingMonth}
									</li>
									<li>Excluded wallets: {recalculateResult.debug.excludedWalletsCount}</li>
									{#if recalculateResult.debug.sampleBlobPaths?.length}
										<li class="mt-2">
											<span class="text-gray-300">Sample blob paths:</span>
											<ul class="ml-4 mt-1">
												{#each recalculateResult.debug.sampleBlobPaths as path}
													<li class="font-mono text-[10px]">{path}</li>
												{/each}
											</ul>
										</li>
									{/if}
									{#if recalculateResult.debug.allBlobBlockNumbers?.length}
										<li class="mt-2">
											Blob block numbers (first 10): {recalculateResult.debug.allBlobBlockNumbers.join(
												', '
											)}
										</li>
									{/if}
								</ul>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Regenerate Snapshots Section -->
				<details class="mt-4 rounded-md border border-yellow-600/50 bg-yellow-900/10">
					<summary class="cursor-pointer px-4 py-3 text-sm font-medium text-yellow-400">
						Advanced: Regenerate Snapshots for {selectedMonth || 'selected month'}
					</summary>
					<div class="border-t border-yellow-600/30 p-4">
						<p class="mb-3 text-xs text-gray-400">
							This will regenerate all snapshot data for the selected month using the current code.
							Use this if snapshot generation logic has been fixed/improved (e.g., vault attribution
							fixes).
							<strong class="text-yellow-400"
								>After regenerating, click "Recalculate Points" to update the points data.</strong
							>
						</p>
						{#if !selectedMonth}
							<p class="text-sm text-yellow-400">
								Please select a month above to enable regeneration.
							</p>
						{:else}
							<div class="flex flex-wrap items-center gap-3">
								<input
									type="text"
									bind:value={regenerateConfirmText}
									placeholder="Type REGENERATE to confirm"
									class="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none"
								/>
								<button
									on:click={regenerateSnapshots}
									disabled={regenerateLoading || regenerateConfirmText !== 'REGENERATE'}
									class="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-yellow-700 disabled:cursor-not-allowed disabled:opacity-50"
								>
									{#if regenerateLoading}
										<span class="flex items-center gap-2">
											<div
												class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
											></div>
											Regenerating...
										</span>
									{:else}
										Regenerate Snapshots
									{/if}
								</button>
							</div>
						{/if}
						{#if regenerateError}
							<p class="mt-3 text-sm text-red-400">{regenerateError}</p>
						{/if}
						{#if regenerateResult}
							<div class="mt-3 rounded-md bg-green-900/30 p-3 text-sm">
								<p class="font-medium text-green-400">Regeneration complete!</p>
								<p class="mt-1 text-gray-300">
									{regenerateResult.successful} successful, {regenerateResult.failed} failed out of {regenerateResult.totalBlocks}
									blocks
								</p>
								{#if regenerateResult.failed > 0}
									<div class="mt-2 rounded bg-red-900/30 p-2 text-xs">
										<p class="font-medium text-red-400">Failed blocks:</p>
										<ul class="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-gray-400">
											{#each regenerateResult.results.filter((r) => !r.success) as failed}
												<li class="font-mono">
													Block {failed.blockNumber} ({failed.date}): {failed.error}
												</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</details>
			</Card>

			<!-- Pool Config Info -->
			{#if currentMonthPool}
				<Card>
					<h3 class="mb-3 text-sm font-semibold text-gray-300">Rewards Pool for {selectedMonth}</h3>
					<div class="grid gap-4 text-sm sm:grid-cols-3">
						<div>
							<p class="text-gray-400">Base Pool</p>
							<p class="font-mono text-white">{formatUsd(currentMonthPool.poolAmount)}</p>
						</div>
						<div>
							<p class="text-gray-400">RocketBoost Progress</p>
							<p
								class="font-mono {rocketBoostProgressPercent >= 100
									? 'text-green-400'
									: 'text-yellow-400'}"
							>
								{rocketBoostProgressPercent.toFixed(1)}%
							</p>
						</div>
						<div>
							<p class="text-gray-400">Effective Pool</p>
							<p class="font-mono font-semibold text-[#e8be89]">{formatUsd(effectivePoolAmount)}</p>
						</div>
					</div>
					<!-- RocketBoost Progress Bar -->
					<div class="mt-4">
						<div class="relative">
							<!-- Progress bar background -->
							<div class="h-4 overflow-hidden rounded-full bg-gray-700">
								<!-- Projected progress (lighter background) -->
								{#if projectedProgressPercent > rocketBoostProgressPercent}
									<div
										class="absolute h-full bg-yellow-500/30 transition-all duration-500"
										style="width: {Math.min(100, projectedProgressPercent)}%"
									/>
								{/if}
								<!-- Current progress (solid foreground) -->
								<div
									class="relative h-full transition-all duration-500 {rocketBoostProgressPercent >=
									100
										? 'bg-green-500'
										: 'bg-yellow-500'}"
									style="width: {Math.min(100, rocketBoostProgressPercent)}%"
								/>
							</div>
							<!-- Projected progress marker (dashed line) -->
							{#if projectedProgressPercent > rocketBoostProgressPercent && projectedProgressPercent < 100}
								<div
									class="absolute top-0 h-4 w-0.5 border-l-2 border-dashed border-yellow-300/70"
									style="left: {Math.min(100, projectedProgressPercent)}%"
									title="Projected: {projectedProgressPercent.toFixed(0)}%"
								/>
							{/if}
							<!-- Milestone markers -->
							{#each [{ pct: 25, amount: currentMonthPool.rocketBoostAmounts?.tier25 ?? 0 }, { pct: 50, amount: currentMonthPool.rocketBoostAmounts?.tier50 ?? 0 }, { pct: 75, amount: currentMonthPool.rocketBoostAmounts?.tier75 ?? 0 }, { pct: 100, amount: currentMonthPool.rocketBoostAmounts?.tier100 ?? 0 }] as { pct, amount } (pct)}
								{@const achieved = rocketBoostProgressPercent >= pct}
								{@const projected = projectedProgressPercent >= pct}
								<div
									class="absolute top-0 flex h-4 flex-col items-center"
									style="left: {pct}%; transform: translateX(-50%)"
								>
									<div
										class="h-4 w-0.5 {achieved
											? 'bg-green-400'
											: projected
												? 'bg-yellow-400/50'
												: 'bg-gray-500'}"
									></div>
								</div>
								<!-- Label below -->
								<div
									class="absolute top-5 flex flex-col items-center text-xs"
									style="left: {pct}%; transform: translateX(-50%)"
								>
									<span
										class={achieved
											? 'text-green-400'
											: projected
												? 'text-yellow-400'
												: 'text-gray-500'}>{pct}%</span
									>
									<span
										class={achieved
											? 'text-green-300'
											: projected
												? 'text-yellow-300/70'
												: 'text-gray-600'}>+{formatUsd(amount)}</span
									>
								</div>
							{/each}
						</div>
						<!-- Progress legend and stats -->
						<div class="mt-10 flex items-center justify-between text-sm">
							<div class="flex items-center gap-4">
								<div class="flex items-center gap-1.5">
									<span class="inline-block h-2 w-4 rounded bg-yellow-500"></span>
									<span class="text-gray-400"
										>Current: <span class="text-white"
											>{rocketBoostProgressPercent.toFixed(0)}%</span
										></span
									>
								</div>
								{#if projectedProgressPercent > rocketBoostProgressPercent}
									<div class="flex items-center gap-1.5">
										<span
											class="inline-block h-2 w-4 rounded border border-dashed border-yellow-300/50 bg-yellow-500/30"
										></span>
										<span class="text-gray-400"
											>Projected: <span class="text-yellow-300"
												>{projectedProgressPercent.toFixed(0)}%</span
											></span
										>
									</div>
								{/if}
							</div>
							<div class="text-gray-400">
								Achieved: <span class="font-medium text-green-400"
									>+{formatUsd(achievedRocketBoostAmount)}</span
								>
								{#if projectedRocketBoostAmount > achievedRocketBoostAmount}
									<span class="text-yellow-300/70">→ +{formatUsd(projectedRocketBoostAmount)}</span>
								{/if}
								<span class="text-gray-500"
									>/ {formatUsd(
										(currentMonthPool.rocketBoostAmounts?.tier25 ?? 0) +
											(currentMonthPool.rocketBoostAmounts?.tier50 ?? 0) +
											(currentMonthPool.rocketBoostAmounts?.tier75 ?? 0) +
											(currentMonthPool.rocketBoostAmounts?.tier100 ?? 0)
									)}</span
								>
							</div>
						</div>
					</div>
				</Card>
			{:else if selectedMonth}
				<div
					class="rounded-md border border-yellow-900/40 bg-yellow-900/20 p-3 text-sm text-yellow-300"
				>
					No pool config for {selectedMonth}.
					<a href="#pool" on:click={() => (activeTab = 'pool')} class="underline"
						>Configure rewards pool</a
					> to see reward calculations.
				</div>
			{/if}

			{#if pointsError}
				<div class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
					{pointsError}
				</div>
			{/if}

			{#if pointsLoading}
				<Card>
					<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
						></div>
						Loading monthly data...
					</div>
				</Card>
			{:else if monthlyData}
				<!-- Points Summary -->
				<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
					<Card>
						<div class="text-center">
							<p class="text-3xl font-bold text-[#e8be89]">{totalPoints.toLocaleString()}</p>
							<p class="mt-1 text-sm text-gray-400">
								Total Points {hideExcluded ? '(excl. excluded)' : '(all wallets)'}
							</p>
						</div>
					</Card>
					<Card>
						<div class="text-center">
							<p class="text-3xl font-bold text-[#e8be89]">{walletRows.length}</p>
							<p class="mt-1 text-sm text-gray-400">
								Wallets {hideExcluded ? '(excl. excluded)' : '(total)'}
							</p>
						</div>
					</Card>
					<Card>
						<div class="text-center">
							<p class="text-3xl font-bold text-[#e8be89]">{monthlyData.snapshotCount}</p>
							<p class="mt-1 text-sm text-gray-400">Snapshots this month</p>
						</div>
					</Card>
					<Card>
						<div class="text-center">
							<p class="text-3xl font-bold text-green-400">{formatUsd(projectedPoolAmount)}</p>
							<p class="mt-1 text-sm text-gray-400">
								Projected Pool
								<span class="text-xs text-gray-500">({projectedProgressPercent.toFixed(0)}%)</span>
							</p>
						</div>
					</Card>
					<Card>
						<div class="text-center">
							<p class="text-3xl font-bold text-green-400">{formatApy(poolApy)}</p>
							<p class="mt-1 text-sm text-gray-400">Rewards APY</p>
						</div>
					</Card>
				</div>

				<!-- Wallet Points Table -->
				<Card>
					<div class="mb-4 flex flex-wrap items-center justify-between gap-4">
						<div>
							<h2 class="text-lg font-semibold text-white">Wallet Points Rankings</h2>
							<p class="mt-1 text-sm text-gray-400">
								Points = 100 per $1 USD of holdings at each snapshot
							</p>
						</div>
						<!-- Search Input -->
						<div class="relative">
							<input
								type="text"
								bind:value={walletSearchQuery}
								placeholder="Search wallet address..."
								class="w-64 rounded-lg border border-gray-600 bg-gray-800 py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none"
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
							{#if walletSearchQuery}
								<button
									on:click={() => (walletSearchQuery = '')}
									class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</button>
							{/if}
						</div>
					</div>

					{#if walletSearchQuery && filteredWalletRows.length !== walletRows.length}
						<p class="mb-3 text-sm text-gray-400">
							Showing {filteredWalletRows.length} of {walletRows.length} wallets matching "{walletSearchQuery}"
						</p>
					{/if}

					{#if walletRows.length === 0}
						<div class="py-8 text-center">
							<p class="text-gray-400">No wallet data available</p>
							{#if monthlyData && monthlyData.snapshotCount > 0}
								<p class="mt-2 text-sm text-yellow-400">
									{monthlyData.snapshotCount} snapshots recorded but no wallet points.
									<button on:click={recalculatePoints} class="underline hover:text-yellow-300">
										Click to recalculate
									</button>
								</p>
							{/if}
						</div>
					{:else if filteredWalletRows.length === 0}
						<div class="py-8 text-center">
							<p class="text-gray-400">No wallets match your search</p>
						</div>
					{:else}
						<!-- Scroll indicator container -->
						<div class="relative">
							<div
								class="max-h-[500px] overflow-x-auto overflow-y-auto rounded-lg border border-gray-700"
								style="scrollbar-gutter: stable;"
							>
								<table class="w-full text-left text-sm">
									<thead
										class="sticky top-0 z-10 border-b border-gray-700 bg-gray-900 text-gray-400"
									>
										<tr>
											<th class="whitespace-nowrap px-3 py-3">#</th>
											<th class="whitespace-nowrap px-3 py-3">Wallet</th>
											<th class="whitespace-nowrap px-3 py-3 text-right">Points</th>
											<th class="whitespace-nowrap px-3 py-3 text-right">Share</th>
											{#if currentMonthPool}
												<th class="whitespace-nowrap px-3 py-3 text-right">Reward</th>
											{:else}
												<th class="whitespace-nowrap px-3 py-3 text-right">Tokens</th>
											{/if}
											<th class="whitespace-nowrap px-3 py-3 text-right">Actions</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-800">
										{#each filteredWalletRows.slice(0, 100) as row, i}
											<tr class="hover:bg-gray-800/30 {row.isExcluded ? 'bg-yellow-900/10' : ''}">
												<td class="px-3 py-2 text-gray-500">{i + 1}</td>
												<td class="px-3 py-2">
													<div class="flex items-center gap-2">
														<a
															href="https://basescan.org/address/{row.address}"
															target="_blank"
															rel="noopener noreferrer"
															class="font-mono text-blue-400 hover:underline"
														>
															{formatAddress(row.address)}
														</a>
														{#if row.isExcluded}
															<span
																class="rounded bg-yellow-900/50 px-1.5 py-0.5 text-xs text-yellow-400"
															>
																excluded
															</span>
														{/if}
														{#if contractMap[row.address.toLowerCase()] === 'v2'}
															<span
																class="rounded bg-purple-900/50 px-1.5 py-0.5 text-xs text-purple-400"
															>
																v2 pool
															</span>
														{:else if contractMap[row.address.toLowerCase()] === 'v3'}
															<span
																class="rounded bg-purple-900/50 px-1.5 py-0.5 text-xs text-purple-400"
															>
																v3 pool
															</span>
														{:else if contractMap[row.address.toLowerCase()] === 'unknown'}
															<span
																class="rounded bg-purple-900/50 px-1.5 py-0.5 text-xs text-purple-400"
															>
																contract
															</span>
														{/if}
													</div>
												</td>
												<td class="px-3 py-2 text-right font-mono text-white">
													{row.totalPoints.toLocaleString()}
												</td>
												<td class="px-3 py-2 text-right font-mono text-gray-300">
													{(row.share * 100).toFixed(2)}%
												</td>
												{#if currentMonthPool}
													<td class="px-3 py-2 text-right font-mono font-semibold text-[#e8be89]">
														{formatUsd(row.rewardActual)}
													</td>
												{:else}
													<td class="px-3 py-2 text-right text-gray-400">
														{row.tokenCount}
													</td>
												{/if}
												<td class="px-3 py-2 text-right">
													<button
														on:click={() => generateWalletStatement(row.address)}
														class="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600 hover:text-white"
													>
														Statement
													</button>
												</td>
											</tr>
										{/each}
									</tbody>
									{#if currentMonthPool}
										<tfoot class="border-t border-gray-600 bg-gray-800/50">
											<tr>
												<td class="py-3 pr-4"></td>
												<td class="py-3 pr-4 font-semibold text-white">Total</td>
												<td class="py-3 pr-4 text-right font-mono font-semibold text-white">
													{totalPoints.toLocaleString()}
												</td>
												<td class="py-3 pr-4 text-right font-mono text-gray-300">100%</td>
												<td class="py-3 pr-4 text-right font-mono font-semibold text-[#e8be89]">
													{formatUsd(effectivePoolAmount)}
												</td>
												<td class="py-3 pr-4"></td>
											</tr>
										</tfoot>
									{/if}
								</table>
								{#if filteredWalletRows.length > 100}
									<p class="mt-4 text-center text-sm text-gray-500">
										Showing top 100 of {filteredWalletRows.length} wallets
										{#if walletSearchQuery && filteredWalletRows.length !== walletRows.length}
											(filtered from {walletRows.length} total)
										{/if}
									</p>
								{/if}
							</div>
						</div>
					{/if}
				</Card>
			{:else if availableMonths.length === 0}
				<Card>
					<p class="py-8 text-center text-gray-400">
						No snapshot data available yet. Run the cron job to generate snapshots.
					</p>
				</Card>
			{/if}
		</div>
	{/if}

	<!-- Snapshots Tab -->
	{#if activeTab === 'snapshots'}
		<div class="flex gap-6">
			<!-- Left Panel: Block List -->
			<div class="w-[420px] flex-shrink-0">
				<Card>
					<h2 class="mb-4 text-lg font-semibold text-white">Canonical Blocks</h2>
					<p class="mb-4 text-xs text-gray-400">
						Blocks selected by the daily cron job for rewards calculation
					</p>

					{#if snapshotsLoading}
						<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
							<div
								class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
							></div>
							Loading...
						</div>
					{:else if canonicalBlocks.length === 0}
						<p class="py-4 text-center text-sm text-gray-400">
							No canonical blocks yet. Run the cron job to generate snapshots.
						</p>
					{:else}
						<div class="max-h-[500px] overflow-y-auto">
							<table class="w-full text-left text-sm">
								<thead class="sticky top-0 border-b border-gray-700 bg-gray-900 text-gray-400">
									<tr>
										<th class="pb-2 pr-3">Date</th>
										<th class="pb-2 pr-3">Time</th>
										<th class="pb-2 pr-3">Block</th>
										<th class="pb-2 text-right">Actions</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-800">
									{#each canonicalBlocks as block}
										<tr
											class="cursor-pointer transition-colors {selectedCanonicalBlock ===
											block.blockNumber
												? 'bg-[#e8be89]/20'
												: 'hover:bg-gray-800/50'}"
											on:click={() => selectCanonicalBlock(block.blockNumber)}
										>
											<td class="py-2 pr-3 text-gray-300">{block.date}</td>
											<td class="py-2 pr-3 text-gray-300">
												{new Date(block.timestamp * 1000).toLocaleTimeString('en-US', {
													timeZone: 'America/New_York',
													hour: '2-digit',
													minute: '2-digit'
												})}
											</td>
											<td
												class="py-2 pr-3 font-mono {selectedCanonicalBlock === block.blockNumber
													? 'text-[#e8be89]'
													: 'text-white'}"
											>
												{block.blockNumber}
											</td>
											<td class="py-2 text-right">
												<button
													on:click|stopPropagation={() => regenerateSingleBlock(block.blockNumber)}
													disabled={regeneratingBlockNumber !== null}
													class="rounded px-2 py-1 text-xs font-medium transition-colors {regeneratingBlockNumber ===
													block.blockNumber
														? 'cursor-wait bg-yellow-600/50 text-yellow-200'
														: 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40'} disabled:opacity-50"
													title="Regenerate this snapshot"
												>
													{#if regeneratingBlockNumber === block.blockNumber}
														<span class="flex items-center gap-1">
															<div
																class="h-3 w-3 animate-spin rounded-full border border-yellow-400/30 border-t-yellow-400"
															></div>
															Regenerating...
														</span>
													{:else}
														Regenerate
													{/if}
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</Card>

				<!-- Manual Trigger Section -->
				<Card className="mt-4">
					<h2 class="mb-2 text-lg font-semibold text-white">Manual Trigger</h2>
					<p class="mb-4 text-xs text-gray-400">
						Generate snapshots for a specific date. This will overwrite any existing data.
					</p>

					<div class="space-y-3">
						<div>
							<label for="triggerDate" class="mb-1 block text-sm text-gray-400">Date</label>
							<input
								type="date"
								id="triggerDate"
								bind:value={manualTriggerDate}
								max={new Date(Date.now() - 86400000).toISOString().split('T')[0]}
								class="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-[#e8be89] focus:outline-none"
							/>
						</div>

						<button
							on:click={openTriggerConfirmModal}
							disabled={manualTriggerLoading || !manualTriggerDate}
							class="w-full rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if manualTriggerLoading}
								<span class="flex items-center justify-center gap-2">
									<div
										class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
									></div>
									Generating...
								</span>
							{:else}
								Trigger Snapshot
							{/if}
						</button>

						{#if manualTriggerError}
							<p class="text-sm text-red-400">{manualTriggerError}</p>
						{/if}

						{#if manualTriggerResult}
							<div class="rounded-md bg-green-900/30 p-3 text-sm">
								<p class="font-medium text-green-400">Snapshots generated successfully!</p>
								<p class="mt-1 text-gray-300">
									Date: {manualTriggerResult.date}<br />
									Blocks: {manualTriggerResult.blocks.map((b) => b.blockNumber).join(', ')}<br />
									Files stored: {manualTriggerResult.blobsStored}
								</p>
							</div>
						{/if}
					</div>
				</Card>
			</div>

			<!-- Right Panel: Snapshot Data -->
			<div class="flex-1">
				<Card>
					<div class="mb-4 flex items-center justify-between">
						<h2 class="text-lg font-semibold text-white">Snapshot Data</h2>
						<div class="flex items-center gap-2">
							<label for="snapshotToken" class="text-sm text-gray-400">Token:</label>
							<select
								id="snapshotToken"
								bind:value={selectedSnapshotToken}
								on:change={() => loadSnapshotData()}
								class="rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-[#e8be89] focus:outline-none"
							>
								{#each tokenSymbols as token}
									<option value={token}>{token}</option>
								{/each}
							</select>
						</div>
					</div>

					{#if snapshotsError}
						<div
							class="mb-4 rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300"
						>
							{snapshotsError}
						</div>
					{/if}

					{#if !selectedCanonicalBlock}
						<p class="py-8 text-center text-gray-400">Select a block to view its snapshot data</p>
					{:else if snapshotDataLoading}
						<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
							<div
								class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
							></div>
							Loading snapshot...
						</div>
					{:else if snapshotData}
						<!-- Snapshot Summary -->
						<div class="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
							<div class="rounded-lg bg-gray-800/50 p-3 text-center">
								<p class="text-lg font-bold text-[#e8be89]">
									{Object.keys(snapshotData.balances).length}
								</p>
								<p class="text-xs text-gray-400">Holders</p>
							</div>
							<div class="rounded-lg bg-gray-800/50 p-3 text-center">
								<p class="text-lg font-bold text-[#e8be89]">
									{snapshotData.price?.price ? '$' + snapshotData.price.price.toFixed(2) : 'N/A'}
								</p>
								<p class="text-xs text-gray-400">Price</p>
							</div>
							<div class="rounded-lg bg-gray-800/50 p-3 text-center">
								<p class="text-lg font-bold text-[#e8be89]">
									{snapshotWalletPoints.filter((w) => w.isExcluded).length}
								</p>
								<p class="text-xs text-gray-400">Excluded</p>
							</div>
							<div class="rounded-lg bg-gray-800/50 p-3 text-center">
								<p class="font-mono text-sm text-[#e8be89]">
									{snapshotData.priceTimestamp
										? new Date(snapshotData.priceTimestamp * 1000).toLocaleString()
										: 'N/A'}
								</p>
								<p class="text-xs text-gray-400">Price Timestamp</p>
							</div>
						</div>

						<!-- Wallet Points Table -->
						<div class="mb-4">
							<h3 class="mb-3 text-sm font-semibold text-gray-300">
								Wallet Points (this snapshot)
							</h3>
							<div class="max-h-[400px] overflow-y-auto rounded-lg border border-gray-700">
								<table class="w-full text-left text-sm">
									<thead class="sticky top-0 border-b border-gray-700 bg-gray-800 text-gray-400">
										<tr>
											<th class="px-3 py-2">#</th>
											<th class="px-3 py-2">Wallet</th>
											<th class="px-3 py-2 text-right">Balance</th>
											<th class="px-3 py-2 text-right">Value</th>
											<th class="px-3 py-2 text-right">Points</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-700/50">
										{#each snapshotWalletPoints.slice(0, 100) as wallet, i}
											<tr class={wallet.isExcluded ? 'bg-yellow-900/10' : ''}>
												<td class="px-3 py-2 text-gray-500">{i + 1}</td>
												<td class="px-3 py-2">
													<div class="flex items-center gap-2">
														<a
															href="https://basescan.org/address/{wallet.address}"
															target="_blank"
															rel="noopener noreferrer"
															class="font-mono text-xs text-blue-400 hover:underline"
														>
															{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
														</a>
														{#if wallet.isExcluded}
															<span
																class="rounded bg-yellow-600/30 px-1.5 py-0.5 text-[10px] text-yellow-400"
															>
																Excluded
															</span>
														{/if}
													</div>
												</td>
												<td class="px-3 py-2 text-right font-mono text-gray-300">
													{wallet.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
												</td>
												<td class="px-3 py-2 text-right font-mono text-gray-300">
													{formatUsd(wallet.value)}
												</td>
												<td
													class="px-3 py-2 text-right font-mono {wallet.isExcluded
														? 'text-gray-500'
														: 'text-[#e8be89]'}"
												>
													{Math.round(wallet.points).toLocaleString()}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							{#if snapshotWalletPoints.length > 100}
								<p class="mt-2 text-center text-xs text-gray-500">
									Showing top 100 of {snapshotWalletPoints.length} wallets
								</p>
							{/if}
							<div class="mt-3 flex justify-between rounded-lg bg-gray-800/50 px-3 py-2 text-sm">
								<span class="text-gray-400">Total Points (this snapshot)</span>
								<span class="font-mono font-semibold text-[#e8be89]">
									{Math.round(
										snapshotWalletPoints.reduce((sum, w) => sum + w.points, 0)
									).toLocaleString()}
								</span>
							</div>
						</div>

						<!-- Raw JSON -->
						<details>
							<summary class="cursor-pointer text-sm font-medium text-gray-300 hover:text-white">
								View Raw JSON (balances + points)
							</summary>
							<pre
								class="mt-2 max-h-96 overflow-auto rounded-lg bg-gray-800/50 p-4 text-xs text-gray-300">{JSON.stringify(
									{
										...snapshotData,
										walletPoints: snapshotWalletPoints.map((w) => ({
											address: w.address,
											balance: w.balance,
											value: w.value,
											points: Math.round(w.points),
											isExcluded: w.isExcluded
										}))
									},
									null,
									2
								)}</pre>
						</details>
					{:else}
						<p class="py-8 text-center text-gray-400">
							Snapshot not found for {selectedSnapshotToken} at block {selectedCanonicalBlock}
						</p>
					{/if}
				</Card>

				<!-- Aggregated Wallet Points (All Tokens) -->
				<Card className="mt-4">
					<h2 class="mb-4 text-lg font-semibold text-white">
						All Tokens - Aggregated Wallet Points
					</h2>
					<p class="mb-4 text-xs text-gray-400">
						Combined points across all tokens for block {selectedCanonicalBlock}
					</p>

					{#if aggregatedDataLoading}
						<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
							<div
								class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
							></div>
							Loading aggregated data...
						</div>
					{:else if aggregatedWalletData.length === 0}
						<p class="py-4 text-center text-sm text-gray-400">
							No aggregated wallet data available
						</p>
					{:else}
						<div class="max-h-[500px] overflow-y-auto rounded-lg border border-gray-700">
							<table class="w-full text-left text-sm">
								<thead class="sticky top-0 border-b border-gray-700 bg-gray-800 text-gray-400">
									<tr>
										<th class="px-3 py-2">#</th>
										<th class="px-3 py-2">Wallet</th>
										<th class="px-3 py-2 text-right">Total Value</th>
										<th class="px-3 py-2 text-right">Total Points</th>
										<th class="px-3 py-2">Token Breakdown</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-700/50">
									{#each aggregatedWalletData.slice(0, 100) as wallet, i}
										<tr class={wallet.isExcluded ? 'bg-yellow-900/10' : ''}>
											<td class="px-3 py-2 text-gray-500">{i + 1}</td>
											<td class="px-3 py-2">
												<div class="flex items-center gap-2">
													<a
														href="https://basescan.org/address/{wallet.address}"
														target="_blank"
														rel="noopener noreferrer"
														class="font-mono text-xs text-blue-400 hover:underline"
													>
														{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
													</a>
													{#if wallet.isExcluded}
														<span
															class="rounded bg-yellow-600/30 px-1.5 py-0.5 text-[10px] text-yellow-400"
														>
															Excluded
														</span>
													{/if}
												</div>
											</td>
											<td class="px-3 py-2 text-right font-mono text-gray-300">
												{formatUsd(wallet.totalValue)}
											</td>
											<td
												class="px-3 py-2 text-right font-mono {wallet.isExcluded
													? 'text-gray-500'
													: 'text-[#e8be89]'}"
											>
												{Math.round(wallet.totalPoints).toLocaleString()}
											</td>
											<td class="px-3 py-2">
												<div class="flex flex-wrap gap-1">
													{#each wallet.tokens.sort((a, b) => b.points - a.points) as token}
														<span
															class="inline-flex items-center gap-1 rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px]"
															title="{token.symbol}: {formatUsd(token.value)} ({Math.round(
																token.points
															).toLocaleString()} pts)"
														>
															<span class="text-gray-300">{token.symbol}</span>
															<span class="text-[#e8be89]"
																>{Math.round(token.points).toLocaleString()}</span
															>
														</span>
													{/each}
												</div>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						{#if aggregatedWalletData.length > 100}
							<p class="mt-2 text-center text-xs text-gray-500">
								Showing top 100 of {aggregatedWalletData.length} wallets
							</p>
						{/if}
						<div class="mt-3 flex justify-between rounded-lg bg-gray-800/50 px-3 py-2 text-sm">
							<span class="text-gray-400">Total Points (all tokens, this block)</span>
							<span class="font-mono font-semibold text-[#e8be89]">
								{Math.round(
									aggregatedWalletData.reduce((sum, w) => sum + w.totalPoints, 0)
								).toLocaleString()}
							</span>
						</div>
					{/if}
				</Card>
			</div>
		</div>
	{/if}

	<!-- Preview Tab -->
	{#if activeTab === 'preview'}
		<div class="space-y-6">
			<!-- Input Section -->
			<Card>
				<div class="flex flex-col gap-4 sm:flex-row sm:items-end">
					<div class="flex-1">
						<label for="blockNumber" class="mb-2 block text-sm font-medium text-gray-300">
							Block Number
						</label>
						<input
							id="blockNumber"
							type="text"
							bind:value={blockNumber}
							placeholder="Enter block number (e.g., 23456789)"
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							on:keydown={(e) => e.key === 'Enter' && generatePreview()}
						/>
					</div>
					<button
						on:click={generatePreview}
						disabled={previewLoading}
						class="rounded-lg bg-[#e8be89] px-6 py-2.5 font-medium text-black transition-colors hover:bg-[#d4a875] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{previewLoading ? 'Generating...' : 'Generate Preview'}
					</button>
				</div>
			</Card>

			{#if previewError}
				<div class="rounded-lg border border-red-900/40 bg-red-900/20 p-4 text-red-300">
					{previewError}
				</div>
			{/if}

			{#if previewLoading}
				<Card>
					<div class="py-8">
						<div class="mb-4 flex items-center justify-center gap-3 text-gray-400">
							<div
								class="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
							></div>
							<span>Generating snapshot preview...</span>
						</div>

						{#if previewProgress}
							<div class="mx-auto max-w-md space-y-3">
								<!-- Overall progress bar -->
								<div class="h-2 w-full overflow-hidden rounded-full bg-gray-700">
									<div
										class="h-full bg-[#e8be89] transition-all duration-300"
										style="width: {(previewProgress.step / previewProgress.total) * 100}%"
									></div>
								</div>

								<!-- Step info -->
								<div class="text-center text-sm text-gray-400">
									Step {previewProgress.step}/{previewProgress.total}: {previewProgress.message}
								</div>

								<!-- Token progress -->
								{#if previewProgress.tokenIndex !== undefined && previewProgress.totalTokens}
									<div class="mt-2 text-center text-xs text-gray-500">
										Token {previewProgress.tokenIndex + 1}/{previewProgress.totalTokens}
									</div>
									<div class="h-1 w-full overflow-hidden rounded-full bg-gray-800">
										<div
											class="h-full bg-[#e8be89]/50 transition-all duration-300"
											style="width: {((previewProgress.tokenIndex + 1) /
												previewProgress.totalTokens) *
												100}%"
										></div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</Card>
			{/if}

			{#if previewResult && !previewLoading}
				<!-- Summary Stats -->
				<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
					<Card>
						<div class="text-center">
							<p class="text-2xl font-bold text-[#e8be89]">
								{previewResult.blockNumber.toLocaleString()}
							</p>
							<p class="mt-1 text-sm text-gray-400">Block Number</p>
						</div>
					</Card>
					<Card>
						<div class="text-center">
							<p class="text-2xl font-bold text-[#e8be89]">{previewWallets.length}</p>
							<p class="mt-1 text-sm text-gray-400">
								Wallets {hideExcluded ? `(${previewResult.excludedCount} excluded)` : ''}
							</p>
						</div>
					</Card>
					<Card>
						<div class="text-center">
							<p class="text-2xl font-bold text-[#e8be89]">
								{formatUsd(previewWallets.reduce((sum, w) => sum + w.totalValue, 0))}
							</p>
							<p class="mt-1 text-sm text-gray-400">Total Value</p>
						</div>
					</Card>
					<Card>
						<div class="text-center">
							<p class="text-2xl font-bold text-[#e8be89]">
								{Math.round(
									previewWallets.reduce((sum, w) => sum + w.totalPoints, 0)
								).toLocaleString()}
							</p>
							<p class="mt-1 text-sm text-gray-400">Points (this snapshot)</p>
						</div>
					</Card>
				</div>

				<!-- Wallet Rankings (Main View) -->
				<Card>
					<div class="mb-4 flex flex-wrap items-center justify-between gap-4">
						<h2 class="text-lg font-semibold text-white">Wallet Rankings</h2>
						<div class="flex items-center gap-4">
							<div class="flex items-center gap-2">
								<label for="tokenFilter" class="text-sm text-gray-400">Token:</label>
								<select
									id="tokenFilter"
									bind:value={selectedTokenFilter}
									on:change={() => (selectedWallet = null)}
									class="rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-[#e8be89] focus:outline-none"
								>
									{#each previewResult.tokenSummary as token}
										<option value={token.token}>{token.token}</option>
									{/each}
								</select>
							</div>
							<span class="text-sm text-gray-400">{previewResult.blockDate}</span>
						</div>
					</div>
					<p class="mb-4 text-sm text-gray-400">
						Wallets ranked by {selectedTokenFilter} holdings at block {previewResult.blockNumber.toLocaleString()}
					</p>
					{#if previewWallets.length === 0}
						<p class="py-4 text-center text-gray-400">No wallet data available</p>
					{:else}
						<div class="max-h-[500px] overflow-y-auto">
							<table class="w-full text-left text-sm">
								<thead class="sticky top-0 border-b border-gray-700 bg-gray-900 text-gray-400">
									<tr>
										<th class="pb-3 pr-4">#</th>
										<th class="pb-3 pr-4">Wallet</th>
										<th class="pb-3 pr-4 text-right">Balance</th>
										<th class="pb-3 pr-4 text-right">Value</th>
										<th class="pb-3 text-right">Points</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-800">
									{#each previewWallets.slice(0, 100) as wallet, i}
										<tr
											class="cursor-pointer transition-colors hover:bg-gray-800/30 {wallet.isExcluded
												? 'bg-yellow-900/10'
												: ''} {selectedWallet === wallet.address ? 'bg-gray-800' : ''}"
											on:click={() =>
												(selectedWallet =
													selectedWallet === wallet.address ? null : wallet.address)}
										>
											<td class="py-2 pr-4 text-gray-500">{i + 1}</td>
											<td class="py-2 pr-4">
												<div class="flex items-center gap-2">
													<a
														href="https://basescan.org/address/{wallet.address}"
														target="_blank"
														rel="noopener noreferrer"
														class="font-mono text-blue-400 hover:underline"
														on:click|stopPropagation
													>
														{formatAddress(wallet.address)}
													</a>
													{#if wallet.isExcluded}
														<span
															class="rounded bg-yellow-900/50 px-1.5 py-0.5 text-xs text-yellow-400"
														>
															excluded
														</span>
													{/if}
												</div>
											</td>
											<td class="py-2 pr-4 text-right font-mono text-white">
												{formatNumber(wallet.tokens[0]?.balance ?? '0')}
											</td>
											<td class="py-2 pr-4 text-right font-mono text-white">
												{formatUsd(wallet.totalValue)}
											</td>
											<td class="py-2 text-right font-mono text-gray-300">
												{Math.round(wallet.totalPoints).toLocaleString()}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
							{#if previewWallets.length > 100}
								<p class="mt-4 text-center text-sm text-gray-500">
									Showing top 100 of {previewWallets.length} wallets
								</p>
							{/if}
						</div>
					{/if}
				</Card>

				<!-- Selected Wallet Details -->
				{#if selectedWalletData}
					<Card>
						<div class="mb-4 flex items-center justify-between">
							<h2 class="text-lg font-semibold text-white">Wallet Details</h2>
							<button
								on:click={() => (selectedWallet = null)}
								class="text-sm text-gray-400 hover:text-white"
							>
								Close
							</button>
						</div>
						<div class="rounded-lg bg-gray-800/50 p-4">
							<a
								href="https://basescan.org/address/{selectedWalletData.address}"
								target="_blank"
								rel="noopener noreferrer"
								class="font-mono text-sm text-blue-400 hover:underline"
							>
								{selectedWalletData.address}
							</a>
							<div class="mt-3 grid gap-4 sm:grid-cols-4">
								<div>
									<p class="text-sm text-gray-400">Token</p>
									<p class="font-medium text-[#e8be89]">{selectedTokenFilter}</p>
								</div>
								<div>
									<p class="text-sm text-gray-400">Balance</p>
									<p class="font-mono text-white">
										{formatNumber(selectedWalletData.tokens[0]?.balance ?? '0')}
									</p>
								</div>
								<div>
									<p class="text-sm text-gray-400">Value</p>
									<p class="font-mono text-white">{formatUsd(selectedWalletData.totalValue)}</p>
								</div>
								<div>
									<p class="text-sm text-gray-400">Points</p>
									<p class="font-mono text-white">
										{Math.round(selectedWalletData.totalPoints).toLocaleString()}
									</p>
								</div>
							</div>
						</div>
					</Card>
				{/if}

				<!-- Tools Section (Collapsible) -->
				<details class="mt-6">
					<summary class="cursor-pointer text-sm font-medium text-gray-300 hover:text-white">
						Tools: Token Summary & Raw Data
					</summary>
					<div class="mt-4 space-y-4">
						<!-- Token Summary -->
						<Card>
							<h3 class="mb-4 text-lg font-semibold text-white">Token Summary</h3>
							<div class="overflow-x-auto">
								<table class="w-full text-left text-sm">
									<thead class="border-b border-gray-700 text-gray-400">
										<tr>
											<th class="pb-3 pr-4">Token</th>
											<th class="pb-3 pr-4 text-right">Holders</th>
											<th class="pb-3 pr-4 text-right">Total Supply</th>
											<th class="pb-3 pr-4 text-right">Price</th>
											<th class="pb-3 text-right">Confidence</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-800">
										{#each previewResult.tokenSummary as token}
											<tr>
												<td class="py-3 pr-4">
													<span class="font-medium text-[#e8be89]">{token.token}</span>
												</td>
												<td class="py-3 pr-4 text-right text-white">{token.holders}</td>
												<td class="py-3 pr-4 text-right font-mono text-white">
													{formatNumber(token.totalSupply)}
												</td>
												<td class="py-3 pr-4 text-right text-white">
													{formatPrice(token.price)}
												</td>
												<td class="py-3 text-right text-gray-400">
													{token.priceConfidence !== null
														? '±$' + token.priceConfidence.toFixed(4)
														: '-'}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</Card>

						<!-- Raw Snapshot JSON (what would be stored) -->
						<Card>
							<h3 class="mb-4 text-lg font-semibold text-white">
								Raw Snapshot: {selectedTokenFilter}
							</h3>
							<p class="mb-2 text-sm text-gray-400">
								This is the exact JSON that would be stored at: <code class="text-[#e8be89]"
									>snapshots/{selectedTokenFilter}/{previewResult.blockNumber}.json</code
								>
							</p>
							<pre class="max-h-96 overflow-auto text-xs text-gray-300">{JSON.stringify(
									selectedTokenSnapshot,
									null,
									2
								)}</pre>
						</Card>
					</div>
				</details>
			{/if}
		</div>
	{/if}

	<!-- Excluded Wallets Tab -->
	{#if activeTab === 'excluded'}
		<div class="space-y-6">
			<!-- Add Wallet Form -->
			<Card>
				<h2 class="mb-4 text-lg font-semibold text-white">Add Excluded Wallet</h2>
				<div class="flex flex-col gap-4 sm:flex-row sm:items-end">
					<div class="flex-1">
						<label for="newWallet" class="mb-2 block text-sm font-medium text-gray-300">
							Wallet Address
						</label>
						<input
							id="newWallet"
							type="text"
							bind:value={newWalletAddress}
							placeholder="0x..."
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 font-mono text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							on:keydown={(e) => e.key === 'Enter' && addExcludedWallet()}
						/>
					</div>
					<button
						on:click={addExcludedWallet}
						disabled={addingWallet}
						class="rounded-lg bg-[#e8be89] px-6 py-2.5 font-medium text-black transition-colors hover:bg-[#d4a875] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{addingWallet ? 'Adding...' : 'Add Wallet'}
					</button>
				</div>
				<p class="mt-2 text-sm text-gray-500">
					Excluded wallets will be marked but still included in snapshots. They can be hidden from
					TVL calculations using the toggle.
				</p>
			</Card>

			{#if excludedError}
				<div class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
					{excludedError}
				</div>
			{/if}

			<!-- Excluded Wallets List -->
			<Card>
				<h2 class="mb-4 text-lg font-semibold text-white">Excluded Wallets</h2>
				{#if excludedLoading}
					<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
						></div>
						Loading...
					</div>
				{:else if excludedWallets.length === 0}
					<p class="py-4 text-center text-gray-400">No excluded wallets configured</p>
				{:else}
					<div class="space-y-2">
						{#each excludedWallets as wallet}
							<div class="flex items-center justify-between rounded-lg bg-gray-800/50 px-4 py-3">
								<a
									href="https://basescan.org/address/{wallet}"
									target="_blank"
									rel="noopener noreferrer"
									class="font-mono text-blue-400 hover:underline"
								>
									{wallet}
								</a>
								<button
									on:click={() => removeExcludedWallet(wallet)}
									class="rounded px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-900/30"
								>
									Remove
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</Card>
		</div>
	{/if}

	<!-- Team Wallets Tab -->
	{#if activeTab === 'team'}
		<div class="space-y-6">
			<!-- Add Wallet Form -->
			<Card>
				<h2 class="mb-4 text-lg font-semibold text-white">Add Team Wallet</h2>
				<div class="flex flex-col gap-4 sm:flex-row sm:items-end">
					<div class="flex-1">
						<label for="newTeamWallet" class="mb-2 block text-sm font-medium text-gray-300">
							Wallet Address
						</label>
						<input
							id="newTeamWallet"
							type="text"
							bind:value={newTeamWalletAddress}
							placeholder="0x..."
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 font-mono text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							on:keydown={(e) => e.key === 'Enter' && addTeamWallet()}
						/>
					</div>
					<button
						on:click={addTeamWallet}
						disabled={addingTeamWallet}
						class="rounded-lg bg-[#e8be89] px-6 py-2.5 font-medium text-black transition-colors hover:bg-[#d4a875] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{addingTeamWallet ? 'Adding...' : 'Add Wallet'}
					</button>
				</div>
				<p class="mt-2 text-sm text-gray-500">
					Team wallets are excluded from "TVL Excluding Team" stats but are still eligible for
					rewards (unlike excluded wallets which are not eligible).
				</p>
			</Card>

			{#if teamError}
				<div class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
					{teamError}
				</div>
			{/if}

			<!-- Team Wallets List -->
			<Card>
				<h2 class="mb-4 text-lg font-semibold text-white">Team Wallets</h2>
				{#if teamLoading}
					<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
						></div>
						Loading...
					</div>
				{:else if teamWallets.length === 0}
					<p class="py-4 text-center text-gray-400">No team wallets configured</p>
				{:else}
					<div class="space-y-2">
						{#each teamWallets as wallet}
							<div class="flex items-center justify-between rounded-lg bg-gray-800/50 px-4 py-3">
								<a
									href="https://basescan.org/address/{wallet}"
									target="_blank"
									rel="noopener noreferrer"
									class="font-mono text-blue-400 hover:underline"
								>
									{wallet}
								</a>
								<button
									on:click={() => removeTeamWallet(wallet)}
									class="rounded px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-900/30"
								>
									Remove
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</Card>
		</div>
	{/if}

	<!-- Rewards Pool Tab -->
	{#if activeTab === 'pool'}
		<div class="space-y-6">
			{#if poolError}
				<div class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
					{poolError}
				</div>
			{/if}

			<!-- Add/Edit Form -->
			{#if poolFormMonth || editingPool}
				<Card>
					<h2 class="mb-4 text-lg font-semibold text-white">
						{editingPool ? 'Edit Pool Config' : 'New Pool Config'}
					</h2>
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<div>
							<label for="poolMonth" class="mb-2 block text-sm font-medium text-gray-300">
								Month (YYYY-MM)
							</label>
							<input
								id="poolMonth"
								type="text"
								bind:value={poolFormMonth}
								placeholder="2024-01"
								disabled={!!editingPool}
								class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89] disabled:opacity-50"
							/>
						</div>
						<div>
							<label for="poolAmount" class="mb-2 block text-sm font-medium text-gray-300">
								Pool Amount (USD)
							</label>
							<input
								id="poolAmount"
								type="number"
								bind:value={poolFormAmount}
								min="0"
								step="100"
								class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							/>
						</div>
						<div>
							<label for="rocketBoostTarget" class="mb-2 block text-sm font-medium text-gray-300">
								RocketBoost TVL Target (USD)
							</label>
							<input
								id="rocketBoostTarget"
								type="number"
								bind:value={poolFormRocketBoostTarget}
								min="0"
								step="1000"
								class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							/>
						</div>
						<!-- RocketBoost Tier Amounts -->
						<div class="sm:col-span-2 lg:col-span-3">
							<span class="mb-2 block text-sm font-medium text-gray-300">
								RocketBoost Tier Bonuses (USD)
							</span>
							<div class="grid grid-cols-4 gap-2">
								<div>
									<label for="rocketBoostTier25" class="mb-1 block text-xs text-gray-400">25%</label
									>
									<input
										id="rocketBoostTier25"
										type="number"
										bind:value={poolFormRocketBoostTier25}
										min="0"
										step="10"
										class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
									/>
								</div>
								<div>
									<label for="rocketBoostTier50" class="mb-1 block text-xs text-gray-400">50%</label
									>
									<input
										id="rocketBoostTier50"
										type="number"
										bind:value={poolFormRocketBoostTier50}
										min="0"
										step="10"
										class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
									/>
								</div>
								<div>
									<label for="rocketBoostTier75" class="mb-1 block text-xs text-gray-400">75%</label
									>
									<input
										id="rocketBoostTier75"
										type="number"
										bind:value={poolFormRocketBoostTier75}
										min="0"
										step="10"
										class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
									/>
								</div>
								<div>
									<label for="rocketBoostTier100" class="mb-1 block text-xs text-gray-400"
										>100%</label
									>
									<input
										id="rocketBoostTier100"
										type="number"
										bind:value={poolFormRocketBoostTier100}
										min="0"
										step="10"
										class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
									/>
								</div>
							</div>
							<p class="mt-1 text-xs text-gray-500">
								Total RocketBoost: {formatUsd(totalRocketBoostAmount)}
							</p>
						</div>
						<div class="sm:col-span-2 lg:col-span-3">
							<label for="poolNotes" class="mb-2 block text-sm font-medium text-gray-300">
								Notes
							</label>
							<textarea
								id="poolNotes"
								bind:value={poolFormNotes}
								rows="2"
								placeholder="Optional notes..."
								class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							></textarea>
						</div>
					</div>
					<div class="mt-4 flex gap-3">
						<button
							on:click={savePool}
							disabled={savingPool}
							class="rounded-lg bg-[#e8be89] px-6 py-2.5 font-medium text-black transition-colors hover:bg-[#d4a875] disabled:cursor-not-allowed disabled:opacity-50"
						>
							{savingPool ? 'Saving...' : 'Save'}
						</button>
						<button
							on:click={cancelPoolEdit}
							class="rounded-lg border border-gray-600 px-6 py-2.5 font-medium text-gray-300 transition-colors hover:bg-gray-800"
						>
							Cancel
						</button>
					</div>
				</Card>
			{:else}
				<Card>
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold text-white">Rewards Pool Configuration</h2>
						<button
							on:click={startNewPool}
							class="rounded-lg bg-[#e8be89] px-4 py-2 font-medium text-black transition-colors hover:bg-[#d4a875]"
						>
							Add New Month
						</button>
					</div>
				</Card>
			{/if}

			<!-- Pool Configs List -->
			<Card>
				<h2 class="mb-4 text-lg font-semibold text-white">Monthly Pool Configs</h2>
				{#if poolLoading}
					<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
						></div>
						Loading...
					</div>
				{:else if poolConfigs.length === 0}
					<p class="py-4 text-center text-gray-400">
						No pool configs yet. Add a new month to get started.
					</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead class="border-b border-gray-700 text-gray-400">
								<tr>
									<th class="pb-3 pr-4">Month</th>
									<th class="pb-3 pr-4 text-right">Pool Amount</th>
									<th class="pb-3 pr-4 text-right">Max RocketBoost</th>
									<th class="pb-3 pr-4 text-right">TVL Target</th>
									<th class="pb-3 pr-4">Notes</th>
									<th class="pb-3 text-right">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-800">
								{#each poolConfigs as config}
									{@const totalRocketBoost =
										(config.rocketBoostAmounts?.tier25 ?? 0) +
										(config.rocketBoostAmounts?.tier50 ?? 0) +
										(config.rocketBoostAmounts?.tier75 ?? 0) +
										(config.rocketBoostAmounts?.tier100 ?? 0)}
									<tr class="hover:bg-gray-800/30">
										<td class="py-3 pr-4 font-medium text-[#e8be89]">{config.month}</td>
										<td class="py-3 pr-4 text-right font-mono text-white">
											{formatUsd(config.poolAmount)}
										</td>
										<td class="py-3 pr-4 text-right font-mono text-white">
											{formatUsd(totalRocketBoost)}
										</td>
										<td class="py-3 pr-4 text-right font-mono text-white">
											{formatUsd(config.rocketBoostTvlTarget)}
										</td>
										<td class="max-w-[200px] truncate py-3 pr-4 text-gray-400" title={config.notes}>
											{config.notes || '-'}
										</td>
										<td class="py-3 text-right">
											<div class="flex justify-end gap-2">
												<button
													on:click={() => editPool(config)}
													class="rounded px-2 py-1 text-sm text-blue-400 transition-colors hover:bg-blue-900/30"
												>
													Edit
												</button>
												<button
													on:click={() => deletePool(config.month)}
													class="rounded px-2 py-1 text-sm text-red-400 transition-colors hover:bg-red-900/30"
												>
													Delete
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Card>

			<!-- Info Card -->
			<Card>
				<h3 class="mb-2 text-sm font-medium text-gray-300">How Rewards Work</h3>
				<ul class="space-y-1 text-sm text-gray-400">
					<li>
						• <strong>Pool Amount:</strong> Base reward pool distributed pro-rata based on points
					</li>
					<li>• <strong>RocketBoost Amount:</strong> Additional bonus if TVL target is met</li>
					<li>• <strong>TVL Target:</strong> Target TVL threshold to trigger RocketBoost</li>
					<li>• <strong>RocketBoost Hit:</strong> Manually mark if the TVL target was achieved</li>
				</ul>
			</Card>
		</div>
	{/if}

	<!-- Referrals Tab -->
	{#if activeTab === 'referrals'}
		<div class="space-y-6">
			{#if referralsError}
				<div class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
					{referralsError}
				</div>
			{/if}

			<!-- Month Selector for Referrals -->
			<Card>
				<div class="flex flex-wrap items-center justify-between gap-4">
					<div>
						<h2 class="text-lg font-semibold text-white">Referral Rewards</h2>
						<p class="mt-1 text-sm text-gray-400">View referral code performance by month</p>
					</div>
					<div class="flex items-center gap-3">
						<label for="referral-month-select" class="text-sm text-gray-400">Month:</label>
						<select
							id="referral-month-select"
							bind:value={selectedMonth}
							on:change={() => loadMonthlyData()}
							class="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
						>
							{#each availableMonths as month}
								<option value={month}>{month}</option>
							{/each}
						</select>
					</div>
				</div>
			</Card>

			{#if referralsLoading || pointsLoading}
				<div class="flex items-center gap-3 text-gray-400">
					<div
						class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
					></div>
					Loading referrals data...
				</div>
			{:else if availableMonths.length === 0}
				<Card>
					<p class="py-8 text-center text-gray-400">
						No months available. Snapshot data may not have been generated yet.
					</p>
				</Card>
			{:else if referralRewardsData.length === 0}
				<Card>
					<p class="py-8 text-center text-gray-400">
						{#if !monthlyData?.wallets}
							Loading data for {selectedMonth}...
						{:else}
							No referral codes found.
						{/if}
					</p>
				</Card>
			{:else}
				<!-- Summary Card -->
				<Card>
					<div class="flex flex-wrap items-center justify-between gap-4">
						<div>
							<p class="text-sm text-gray-400">
								Showing rewards for <strong class="text-[#e8be89]">{selectedMonth || 'N/A'}</strong>
								{#if monthlyData}
									&middot; {monthlyData.walletCount} wallets
								{/if}
							</p>
						</div>
						<div class="text-right">
							<p class="text-2xl font-bold text-[#e8be89]">
								{formatUsd(referralRewardsData.reduce((sum, r) => sum + r.totalReward, 0))}
							</p>
							<p class="text-sm text-gray-400">Total Rewards</p>
						</div>
					</div>
				</Card>

				<!-- Referral Code Leaderboard -->
				<Card>
					<h3 class="mb-4 text-lg font-medium text-white">Referral Code Leaderboard</h3>
					<div class="overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead>
								<tr class="border-b border-gray-700 text-gray-400">
									<th class="pb-3 pr-4">Rank</th>
									<th class="pb-3 pr-4">Code</th>
									<th class="pb-3 pr-4">Label</th>
									<th class="pb-3 pr-4 text-right">Wallets</th>
									<th class="pb-3 pr-4 text-right">Total Points</th>
									<th class="pb-3 pr-4 text-right">Total Rewards</th>
									<th class="pb-3 text-right">Actions</th>
								</tr>
							</thead>
							<tbody>
								{#each referralRewardsData as ref, i}
									<tr
										class="cursor-pointer border-b border-gray-800 hover:bg-gray-800/50 {selectedReferralCode ===
										ref.code
											? 'bg-gray-800/70'
											: ''}"
										on:click={() => (selectedReferralCode = ref.code)}
									>
										<td class="py-3 pr-4 text-gray-400">{i + 1}</td>
										<td class="py-3 pr-4 font-mono text-white">{ref.code}</td>
										<td class="py-3 pr-4 text-gray-300">{ref.label || '-'}</td>
										<td class="py-3 pr-4 text-right text-gray-300">{ref.walletCount}</td>
										<td class="py-3 pr-4 text-right text-gray-300"
											>{ref.totalPoints.toLocaleString()}</td
										>
										<td class="py-3 pr-4 text-right font-medium text-[#e8be89]"
											>{formatUsd(ref.totalReward)}</td
										>
										<td class="py-3 text-right">
											<button
												on:click|stopPropagation={() => generateStatement(ref.code)}
												class="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600 hover:text-white"
											>
												Statement
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Card>

				<!-- Selected Code Details -->
				{#if selectedReferralCode}
					{@const selectedRef = referralRewardsData.find((r) => r.code === selectedReferralCode)}
					{#if selectedRef}
						<Card>
							<div class="mb-4 flex flex-wrap items-center justify-between gap-4">
								<div>
									<h3 class="text-lg font-medium text-white">
										{selectedRef.code}
										{#if selectedRef.label}
											<span class="ml-2 text-sm text-gray-400">({selectedRef.label})</span>
										{/if}
									</h3>
									<p class="mt-1 text-sm text-gray-400">
										{selectedRef.walletCount} wallets &middot; {selectedRef.totalPoints.toLocaleString()}
										points
									</p>
								</div>
								<div class="text-right">
									<p class="text-2xl font-bold text-[#e8be89]">
										{formatUsd(selectedRef.totalReward)}
									</p>
									<p class="text-sm text-gray-400">Total Rewards</p>
								</div>
							</div>

							{#if selectedRef.wallets.length > 0}
								<div class="overflow-x-auto">
									<table class="w-full text-left text-sm">
										<thead>
											<tr class="border-b border-gray-700 text-gray-400">
												<th class="pb-3 pr-4">#</th>
												<th class="pb-3 pr-4">Wallet</th>
												<th class="pb-3 pr-4 text-right">Points</th>
												<th class="pb-3 text-right">Reward</th>
											</tr>
										</thead>
										<tbody>
											{#each selectedRef.wallets as wallet, i}
												<tr class="border-b border-gray-800 hover:bg-gray-800/50">
													<td class="py-2 pr-4 text-gray-400">{i + 1}</td>
													<td class="py-2 pr-4 font-mono text-xs text-white">
														{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
													</td>
													<td class="py-2 pr-4 text-right text-gray-300">
														{wallet.points > 0 ? wallet.points.toLocaleString() : '-'}
													</td>
													<td
														class="py-2 text-right font-medium {wallet.reward > 0
															? 'text-[#e8be89]'
															: 'text-gray-500'}"
													>
														{wallet.reward > 0 ? formatUsd(wallet.reward) : '-'}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{:else}
								<p class="py-4 text-center text-gray-400">No wallets registered with this code</p>
							{/if}
						</Card>
					{/if}
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Nansen Tab -->
	{#if activeTab === 'nansen'}
		<div class="space-y-6">
			{#if nansenError}
				<div class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
					{nansenError}
				</div>
			{/if}

			{#if nansenLoading}
				<div class="flex items-center gap-3 text-gray-400">
					<div
						class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
					></div>
					Loading Nansen data (this may take a moment as we fetch all historical trades)...
				</div>
			{:else if !nansenDataLoaded}
				<Card>
					<p class="py-8 text-center text-gray-400">Click to load Nansen data.</p>
				</Card>
			{:else if nansenData.length === 0}
				<Card>
					<p class="py-8 text-center text-gray-400">
						No Nansen referral codes found (codes matching ST0X-****-NANSEN pattern).
					</p>
				</Card>
			{:else}
				<!-- Summary Card -->
				<Card>
					<div class="flex flex-wrap items-center justify-between gap-4">
						<div>
							<h2 class="text-lg font-semibold text-white">Nansen Referral Purchases</h2>
							<p class="mt-1 text-sm text-gray-400">
								Lifetime tStock purchases (buys only) for wallets using ST0X-****-NANSEN codes
							</p>
						</div>
						<div class="flex gap-6 text-right">
							<div>
								<p class="text-2xl font-bold text-[#e8be89]">
									{formatUsd(nansenTotalUsdc)}
								</p>
								<p class="text-sm text-gray-400">Total Purchase Value</p>
							</div>
							<div>
								<p class="text-2xl font-bold text-white">
									{nansenTotalWallets}
								</p>
								<p class="text-sm text-gray-400">Total Wallets</p>
							</div>
						</div>
					</div>
					<div class="mt-4 flex gap-2">
						<button
							on:click={() => loadNansenData()}
							disabled={nansenLoading}
							class="rounded-md bg-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 disabled:opacity-50"
						>
							{nansenLoading ? 'Refreshing...' : 'Refresh Data'}
						</button>
					</div>
				</Card>

				<!-- Wallet Table with Code and Tier Filters -->
				<Card>
					<div class="mb-4 flex flex-wrap items-center justify-between gap-4">
						<h3 class="text-lg font-medium text-white">
							Nansen Wallets
							<span class="ml-2 text-sm font-normal text-gray-400">
								({nansenFilteredWallets.length} shown)
							</span>
						</h3>
						<div class="flex flex-wrap items-center gap-4">
							<div class="flex items-center gap-2">
								<span class="text-sm text-gray-400">Code:</span>
								<select
									bind:value={nansenCodeFilter}
									class="rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-[#e8be89] focus:outline-none"
								>
									<option value="all">All Codes ({nansenAllWallets.length})</option>
									{#each nansenAvailableCodes as code}
										{@const codeData = nansenData.find((c) => c.code === code)}
										<option value={code}>{code} ({codeData?.walletCount || 0})</option>
									{/each}
								</select>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-sm text-gray-400">Tier:</span>
								<select
									bind:value={nansenTierFilter}
									class="rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-[#e8be89] focus:outline-none"
								>
									<option value="all">All Tiers</option>
									<option value="star" class="text-yellow-400">Star (Tier 4)</option>
									<option value="north" class="text-blue-400">North (Tier 3)</option>
									<option value="ice" class="text-cyan-400">Ice (Tier 2)</option>
									<option value="green" class="text-green-400">Green (Tier 1)</option>
									<option value="none">No Tier</option>
								</select>
							</div>
						</div>
					</div>

					{#if nansenFilteredWallets.length > 0}
						<div class="overflow-x-auto">
							<table class="w-full text-left text-sm">
								<thead>
									<tr class="border-b border-gray-700 text-gray-400">
										<th class="pb-3 pr-4">#</th>
										<th class="pb-3 pr-4">Wallet</th>
										<th class="pb-3 pr-4">Code</th>
										<th class="pb-3 pr-4">Nansen Tier</th>
										<th class="pb-3 pr-4 text-right">Purchases</th>
										<th class="pb-3 text-right">Lifetime USDC</th>
									</tr>
								</thead>
								<tbody>
									{#each nansenFilteredWallets as wallet, i}
										<tr class="border-b border-gray-800 hover:bg-gray-800/50">
											<td class="py-2 pr-4 text-gray-400">{i + 1}</td>
											<td class="py-2 pr-4 font-mono text-xs text-white">
												{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
											</td>
											<td class="py-2 pr-4 font-mono text-xs text-gray-300">
												{wallet.code}
											</td>
											<td class="py-2 pr-4">
												{#if wallet.nansenTier}
													<span
														class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium {NANSEN_TIER_INFO[
															wallet.nansenTier
														].color} bg-gray-800"
													>
														{NANSEN_TIER_INFO[wallet.nansenTier].name}
														{#if wallet.nansenPoints}
															<span class="text-gray-500">
																({wallet.nansenPoints.toLocaleString()} pts)
															</span>
														{/if}
													</span>
												{:else}
													<span class="text-gray-500">-</span>
												{/if}
											</td>
											<td class="py-2 pr-4 text-right text-gray-300">
												{wallet.purchaseCount > 0 ? wallet.purchaseCount : '-'}
											</td>
											<td
												class="py-2 text-right font-medium {wallet.lifetimePurchaseUsdc > 0
													? 'text-[#e8be89]'
													: 'text-gray-500'}"
											>
												{wallet.lifetimePurchaseUsdc > 0
													? formatUsd(wallet.lifetimePurchaseUsdc)
													: '-'}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<p class="py-4 text-center text-gray-400">No wallets found</p>
					{/if}
				</Card>
			{/if}
		</div>
	{/if}
</div>

<!-- Confirmation Modal for Manual Trigger -->
{#if showTriggerConfirmModal}
	<div
		class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
		on:click={closeTriggerConfirmModal}
		on:keydown={(e) => e.key === 'Escape' && closeTriggerConfirmModal()}
		role="button"
		tabindex="0"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
		>
			<h2 id="confirm-title" class="mb-2 text-xl font-semibold text-white">
				Confirm Snapshot Generation
			</h2>
			<p class="mb-4 text-sm text-gray-400">
				You are about to generate snapshots for <strong class="text-white"
					>{manualTriggerDate}</strong
				>. This will overwrite any existing snapshot data for this date.
			</p>

			<div class="mb-4 rounded-md bg-orange-900/30 p-3">
				<p class="text-sm text-orange-300">This action will:</p>
				<ul class="mt-2 space-y-1 text-sm text-orange-200/80">
					<li>• Select 2 random blocks from that day</li>
					<li>• Generate token snapshots for all configured tokens</li>
					<li>• Update monthly points calculations</li>
					<li>• Overwrite any existing data for this date</li>
				</ul>
			</div>

			<div class="mb-4">
				<label for="confirmInput" class="mb-1 block text-sm text-gray-400">
					Type <strong class="text-white">CONFIRM</strong> to proceed
				</label>
				<input
					type="text"
					id="confirmInput"
					bind:value={triggerConfirmText}
					placeholder="Type CONFIRM"
					class="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
					on:keydown={(e) => e.key === 'Enter' && executeManualTrigger()}
				/>
			</div>

			<div class="flex gap-3">
				<button
					on:click={closeTriggerConfirmModal}
					class="flex-1 rounded-md border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700"
				>
					Cancel
				</button>
				<button
					on:click={executeManualTrigger}
					disabled={triggerConfirmText !== 'CONFIRM'}
					class="flex-1 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Generate Snapshots
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Airdrop CSV Modal -->
{#if airdropModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
		on:click={closeAirdropModal}
		on:keydown={(e) => e.key === 'Escape' && closeAirdropModal()}
		role="button"
		tabindex="0"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="airdrop-title"
		>
			<h2 id="airdrop-title" class="mb-2 text-xl font-semibold text-white">Generate Airdrop CSV</h2>
			<p class="mb-4 text-sm text-gray-400">
				Generate a CSV file to distribute tokens proportionally based on points for
				<strong class="text-[#e8be89]">{selectedMonth}</strong>.
			</p>

			{#if monthlyData}
				<div class="mb-4 rounded-md bg-gray-900/50 p-3 text-sm">
					<div class="grid grid-cols-2 gap-2 text-gray-300">
						<div>Eligible Wallets:</div>
						<div class="text-right font-medium text-white">
							{monthlyData.wallets.filter(
								(w) => !excludedWalletsInData.has(w.address.toLowerCase()) && w.totalPoints > 0
							).length}
						</div>
						<div>Total Points:</div>
						<div class="text-right font-medium text-white">
							{monthlyData.wallets
								.filter(
									(w) => !excludedWalletsInData.has(w.address.toLowerCase()) && w.totalPoints > 0
								)
								.reduce((sum, w) => sum + w.totalPoints, 0)
								.toLocaleString()}
						</div>
					</div>
				</div>
			{/if}

			<div class="space-y-4">
				<div>
					<label for="tokenAddress" class="mb-1 block text-sm font-medium text-gray-300">
						Token Contract Address
					</label>
					<input
						type="text"
						id="tokenAddress"
						bind:value={airdropTokenAddress}
						placeholder="0x..."
						class="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 font-mono text-sm text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none"
					/>
				</div>

				<div>
					<label for="totalTokens" class="mb-1 block text-sm font-medium text-gray-300">
						Total Tokens to Distribute
					</label>
					<input
						type="number"
						id="totalTokens"
						bind:value={airdropTotalTokens}
						placeholder="e.g. 1000000"
						step="any"
						min="0"
						class="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none"
					/>
					<p class="mt-1 text-xs text-gray-500">
						Enter the human-readable amount (e.g. 1000 for 1000 tokens, not wei)
					</p>
				</div>
			</div>

			{#if airdropError}
				<p class="mt-3 text-sm text-red-400">{airdropError}</p>
			{/if}

			<div class="mt-6 flex gap-3">
				<button
					on:click={closeAirdropModal}
					class="flex-1 rounded-md border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700"
				>
					Cancel
				</button>
				<button
					on:click={generateAirdropCsv}
					class="flex-1 rounded-md bg-[#e8be89] px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-[#d4a876]"
				>
					Download CSV
				</button>
			</div>

			<p class="mt-4 text-xs text-gray-500">
				The CSV follows the Safe/Gnosis format for batch transfers with columns: token_type,
				token_address, receiver, amount, id
			</p>
		</div>
	</div>
{/if}

<!-- Statement Modal -->
{#if statementModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
		on:click={closeStatementModal}
		on:keydown={(e) => e.key === 'Escape' && closeStatementModal()}
		role="button"
		tabindex="0"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="my-8 w-full max-w-5xl rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="statement-title"
		>
			<div class="mb-4 flex items-center justify-between">
				<div>
					<h2 id="statement-title" class="text-xl font-semibold text-white">Points Statement</h2>
					<p class="mt-1 text-sm text-gray-400">
						Referral Code: <strong class="text-[#e8be89]">{statementCode}</strong>
						&middot; Month: <strong class="text-[#e8be89]">{selectedMonth}</strong>
					</p>
				</div>
				<button
					on:click={closeStatementModal}
					class="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			{#if statementLoading}
				<div class="flex items-center justify-center py-12">
					<div class="flex items-center gap-3 text-gray-400">
						<div
							class="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
						></div>
						Loading statement data...
					</div>
				</div>
			{:else if statementError}
				<div class="rounded-md border border-red-900/40 bg-red-900/20 p-4 text-sm text-red-300">
					{statementError}
				</div>
			{:else if statementData}
				<div class="max-h-[70vh] space-y-6 overflow-y-auto pr-2">
					<!-- Totals Summary -->
					<div class="rounded-lg bg-gray-900/50 p-4">
						<div class="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
							<div>
								<p class="text-2xl font-bold text-[#e8be89]">{statementData.totals.walletCount}</p>
								<p class="text-sm text-gray-400">Wallets</p>
							</div>
							<div>
								<p class="text-2xl font-bold text-white">{statementData.totals.snapshotCount}</p>
								<p class="text-sm text-gray-400">Snapshots</p>
							</div>
							<div>
								<p class="text-2xl font-bold text-white">
									{formatUsd(statementData.totals.totalUsdValue)}
								</p>
								<p class="text-sm text-gray-400">Total USD Value</p>
							</div>
							<div>
								<p class="text-2xl font-bold text-[#e8be89]">
									{statementData.totals.totalPoints.toLocaleString()}
								</p>
								<p class="text-sm text-gray-400">Total Points</p>
							</div>
						</div>
					</div>

					<!-- 1. Summary by Wallet -->
					<div>
						<h3 class="mb-3 text-lg font-medium text-white">1. Summary by Wallet</h3>
						<div class="overflow-x-auto rounded-lg border border-gray-700">
							<table class="w-full text-left text-sm">
								<thead class="bg-gray-900/50">
									<tr class="text-gray-400">
										<th class="px-4 py-3">#</th>
										<th class="px-4 py-3">Wallet</th>
										<th class="px-4 py-3 text-right">Snapshots</th>
										<th class="px-4 py-3 text-right">Avg USD Value</th>
										<th class="px-4 py-3 text-right">Total USD Value</th>
										<th class="px-4 py-3 text-right">Total Points</th>
									</tr>
								</thead>
								<tbody>
									{#each statementData.walletSummary as wallet, i}
										<tr class="border-t border-gray-700 hover:bg-gray-800/50">
											<td class="px-4 py-2 text-gray-400">{i + 1}</td>
											<td class="px-4 py-2 font-mono text-xs text-white">
												{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
											</td>
											<td class="px-4 py-2 text-right text-gray-300">{wallet.snapshotCount}</td>
											<td class="px-4 py-2 text-right text-gray-300"
												>{formatUsd(wallet.avgUsdValue)}</td
											>
											<td class="px-4 py-2 text-right text-gray-300"
												>{formatUsd(wallet.totalUsdValue)}</td
											>
											<td class="px-4 py-2 text-right font-medium text-[#e8be89]"
												>{wallet.totalPoints.toLocaleString()}</td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>

					<!-- 2. Summary by Snapshot -->
					<div>
						<h3 class="mb-3 text-lg font-medium text-white">2. Summary by Snapshot</h3>
						<div class="overflow-x-auto rounded-lg border border-gray-700">
							<table class="w-full text-left text-sm">
								<thead class="bg-gray-900/50">
									<tr class="text-gray-400">
										<th class="px-4 py-3">#</th>
										<th class="px-4 py-3">Date</th>
										<th class="px-4 py-3">Block Number</th>
										<th class="px-4 py-3 text-right">Wallets</th>
										<th class="px-4 py-3 text-right">USD Value</th>
										<th class="px-4 py-3 text-right">Points</th>
									</tr>
								</thead>
								<tbody>
									{#each statementData.snapshots as snapshot, i}
										<tr class="border-t border-gray-700 hover:bg-gray-800/50">
											<td class="px-4 py-2 text-gray-400">{i + 1}</td>
											<td class="px-4 py-2 text-white">{snapshot.date}</td>
											<td class="px-4 py-2 font-mono text-gray-300"
												>{snapshot.blockNumber.toLocaleString()}</td
											>
											<td class="px-4 py-2 text-right text-gray-300">{snapshot.wallets.length}</td>
											<td class="px-4 py-2 text-right text-gray-300"
												>{formatUsd(snapshot.totalUsdValue)}</td
											>
											<td class="px-4 py-2 text-right font-medium text-[#e8be89]"
												>{snapshot.totalPoints.toLocaleString()}</td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>

					<!-- 3. Detailed Breakdown -->
					<div>
						<h3 class="mb-3 text-lg font-medium text-white">3. Detailed Breakdown by Snapshot</h3>
						<div class="space-y-4">
							{#each statementData.snapshots as snapshot}
								<div class="overflow-hidden rounded-lg border border-gray-700">
									<div
										class="flex flex-wrap items-center justify-between gap-2 bg-gray-900/70 px-4 py-3"
									>
										<div>
											<span class="font-medium text-white">{snapshot.date}</span>
											<span class="ml-2 font-mono text-sm text-gray-400"
												>Block #{snapshot.blockNumber.toLocaleString()}</span
											>
										</div>
										<div class="text-sm">
											<span class="text-gray-400">Total:</span>
											<span class="ml-1 text-white">{formatUsd(snapshot.totalUsdValue)}</span>
											<span class="ml-2 text-gray-400">|</span>
											<span class="ml-2 text-[#e8be89]"
												>{snapshot.totalPoints.toLocaleString()} pts</span
											>
										</div>
									</div>

									{#if snapshot.wallets.length > 0}
										<div class="overflow-x-auto">
											<table class="w-full text-left text-xs">
												<thead class="bg-gray-900/30">
													<tr class="text-gray-400">
														<th class="px-3 py-2">Wallet</th>
														<th class="px-3 py-2">Token</th>
														<th class="px-3 py-2 text-right">Quantity</th>
														<th class="px-3 py-2 text-right">Pyth Price</th>
														<th class="px-3 py-2 text-right">USD Value</th>
														<th class="px-3 py-2 text-right">Points</th>
													</tr>
												</thead>
												<tbody>
													{#each snapshot.wallets as wallet}
														{#each wallet.holdings as holding, holdingIdx}
															<tr class="border-t border-gray-800 hover:bg-gray-800/30">
																{#if holdingIdx === 0}
																	<td
																		class="px-3 py-1.5 font-mono text-white"
																		rowspan={wallet.holdings.length}
																	>
																		{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
																	</td>
																{/if}
																<td class="px-3 py-1.5 text-gray-300">{holding.symbol}</td>
																<td class="px-3 py-1.5 text-right font-mono text-gray-300">
																	{holding.quantity.toLocaleString(undefined, {
																		maximumFractionDigits: 4
																	})}
																</td>
																<td class="px-3 py-1.5 text-right font-mono text-gray-300">
																	${holding.price.toFixed(2)}
																</td>
																<td class="px-3 py-1.5 text-right text-gray-300">
																	{formatUsd(holding.usdValue)}
																</td>
																<td class="px-3 py-1.5 text-right text-[#e8be89]">
																	{holding.points.toLocaleString(undefined, {
																		maximumFractionDigits: 0
																	})}
																</td>
															</tr>
														{/each}
														<!-- Wallet subtotal -->
														<tr class="bg-gray-800/40 font-medium">
															<td class="px-3 py-1.5 text-gray-400" colspan="4">Subtotal</td>
															<td class="px-3 py-1.5 text-right text-white"
																>{formatUsd(wallet.totalUsdValue)}</td
															>
															<td class="px-3 py-1.5 text-right text-[#e8be89]"
																>{wallet.totalPoints.toLocaleString(undefined, {
																	maximumFractionDigits: 0
																})}</td
															>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									{:else}
										<p class="px-4 py-3 text-sm text-gray-400">No holdings for this snapshot</p>
									{/if}
								</div>
							{/each}
						</div>
					</div>

					<!-- Formula explanation -->
					<div class="rounded-lg bg-gray-900/30 p-4 text-sm">
						<p class="mb-2 font-medium text-gray-300">Points Calculation Formula:</p>
						<p class="text-gray-400">Points = (Token Quantity × Pyth Price) × 100</p>
						<p class="mt-1 text-xs text-gray-500">
							100 points are awarded per $1 USD of holdings at each snapshot. Points accumulate
							across all snapshots within the month.
						</p>
					</div>
				</div>

				<div class="mt-6 flex justify-end gap-3">
					<button
						on:click={exportReferralStatementCSV}
						class="flex items-center gap-2 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							/>
						</svg>
						Export CSV
					</button>
					<button
						on:click={exportReferralStatementPDF}
						class="flex items-center gap-2 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							/>
						</svg>
						Export PDF
					</button>
					<button
						on:click={closeStatementModal}
						class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600"
					>
						Close
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Wallet Statement Modal -->
{#if walletStatementModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
		on:click={closeWalletStatementModal}
		on:keydown={(e) => e.key === 'Escape' && closeWalletStatementModal()}
		role="button"
		tabindex="0"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="my-8 w-full max-w-4xl rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="wallet-statement-title"
		>
			<div class="mb-4 flex items-center justify-between">
				<div>
					<h2 id="wallet-statement-title" class="text-xl font-semibold text-white">
						Wallet Points Statement
					</h2>
					<p class="mt-1 text-sm text-gray-400">
						Wallet: <a
							href="https://basescan.org/address/{walletStatementAddress}"
							target="_blank"
							rel="noopener noreferrer"
							class="font-mono text-[#e8be89] hover:underline"
							>{walletStatementAddress.slice(0, 6)}...{walletStatementAddress.slice(-4)}</a
						>
						&middot; Month: <strong class="text-[#e8be89]">{selectedMonth}</strong>
					</p>
				</div>
				<button
					on:click={closeWalletStatementModal}
					class="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			{#if walletStatementLoading}
				<div class="flex items-center justify-center py-12">
					<div class="flex items-center gap-3 text-gray-400">
						<div
							class="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
						></div>
						Loading wallet statement...
					</div>
				</div>
			{:else if walletStatementError}
				<div class="rounded-md border border-red-900/40 bg-red-900/20 p-4 text-sm text-red-300">
					{walletStatementError}
				</div>
			{:else if walletStatementData}
				<div class="max-h-[70vh] space-y-6 overflow-y-auto pr-2">
					<!-- Totals Summary -->
					<div class="rounded-lg bg-gray-900/50 p-4">
						<div class="grid grid-cols-3 gap-4 text-center">
							<div>
								<p class="text-2xl font-bold text-white">
									{walletStatementData.totals.snapshotCount}
								</p>
								<p class="text-sm text-gray-400">Snapshots</p>
							</div>
							<div>
								<p class="text-2xl font-bold text-white">
									{formatUsd(walletStatementData.totals.avgUsdValue)}
								</p>
								<p class="text-sm text-gray-400">Avg USD Value</p>
							</div>
							<div>
								<p class="text-2xl font-bold text-[#e8be89]">
									{walletStatementData.totals.totalPoints.toLocaleString()}
								</p>
								<p class="text-sm text-gray-400">Total Points</p>
							</div>
						</div>
					</div>

					<!-- Snapshots Table -->
					<div>
						<h3 class="mb-3 text-lg font-medium text-white">Holdings by Snapshot</h3>
						<div class="space-y-4">
							{#each walletStatementData.snapshots as snapshot}
								<div class="overflow-hidden rounded-lg border border-gray-700">
									<div
										class="flex flex-wrap items-center justify-between gap-2 bg-gray-900/70 px-4 py-3"
									>
										<div>
											<span class="font-medium text-white">{snapshot.date}</span>
											<span class="ml-2 font-mono text-sm text-gray-400"
												>Block #{snapshot.blockNumber.toLocaleString()}</span
											>
										</div>
										<div class="text-sm">
											<span class="text-gray-400">Total:</span>
											<span class="ml-1 text-white">{formatUsd(snapshot.totalUsdValue)}</span>
											<span class="ml-2 text-gray-400">|</span>
											<span class="ml-2 text-[#e8be89]"
												>{snapshot.totalPoints.toLocaleString()} pts</span
											>
										</div>
									</div>

									{#if snapshot.holdings.length > 0}
										<div class="overflow-x-auto">
											<table class="w-full text-left text-sm">
												<thead class="bg-gray-900/30">
													<tr class="text-gray-400">
														<th class="px-4 py-2">Token</th>
														<th class="px-4 py-2 text-right">Quantity</th>
														<th class="px-4 py-2 text-right">Pyth Price</th>
														<th class="px-4 py-2 text-right">USD Value</th>
														<th class="px-4 py-2 text-right">Points</th>
													</tr>
												</thead>
												<tbody>
													{#each snapshot.holdings as holding}
														<tr class="border-t border-gray-800 hover:bg-gray-800/30">
															<td class="px-4 py-2 font-medium text-[#e8be89]">{holding.symbol}</td>
															<td class="px-4 py-2 text-right font-mono text-gray-300">
																{holding.quantity.toLocaleString(undefined, {
																	maximumFractionDigits: 4
																})}
															</td>
															<td class="px-4 py-2 text-right font-mono text-gray-300">
																${holding.price.toFixed(2)}
															</td>
															<td class="px-4 py-2 text-right text-gray-300">
																{formatUsd(holding.usdValue)}
															</td>
															<td class="px-4 py-2 text-right text-[#e8be89]">
																{holding.points.toLocaleString(undefined, {
																	maximumFractionDigits: 0
																})}
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									{:else}
										<p class="px-4 py-3 text-sm text-gray-400">No holdings for this snapshot</p>
									{/if}
								</div>
							{/each}
						</div>
					</div>

					<!-- Formula explanation -->
					<div class="rounded-lg bg-gray-900/30 p-4 text-sm">
						<p class="mb-2 font-medium text-gray-300">Points Calculation Formula:</p>
						<p class="text-gray-400">Points = (Token Quantity × Pyth Price) × 100</p>
						<p class="mt-1 text-xs text-gray-500">
							100 points are awarded per $1 USD of holdings at each snapshot. Points accumulate
							across all snapshots within the month.
						</p>
					</div>
				</div>

				<div class="mt-6 flex justify-end gap-3">
					<button
						on:click={exportWalletStatementCSV}
						class="flex items-center gap-2 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							/>
						</svg>
						Export CSV
					</button>
					<button
						on:click={exportWalletStatementPDF}
						class="flex items-center gap-2 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							/>
						</svg>
						Export PDF
					</button>
					<button
						on:click={closeWalletStatementModal}
						class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600"
					>
						Close
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
