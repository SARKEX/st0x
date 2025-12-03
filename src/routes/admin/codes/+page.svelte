<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface AccessCode {
		code: string;
		maxUses: number | null;
		currentUses: number;
		expiresAt: string | null;
		createdAt: string;
		createdBy: string;
		label: string | null;
		walletCount: number;
	}

	let codes: AccessCode[] = [];
	let loading = true;
	let error = '';
	let lastUpdated: Date | null = null;
	let refreshInterval: ReturnType<typeof setInterval> | null = null;

	// Create form state
	let showCreateForm = false;
	let newCode = '';
	let newMaxUses: number | null = null;
	let newExpiresAt = '';
	let newLabel = '';
	let creating = false;
	let createError = '';

	// Delete state
	let deletingCode: string | null = null;

	// Copy feedback state
	let copiedCode: string | null = null;
	let copiedLinkCode: string | null = null;

	function copyCode(code: string) {
		navigator.clipboard.writeText(code);
		copiedCode = code;
		setTimeout(() => {
			copiedCode = null;
		}, 1500);
	}

	function copyLink(code: string) {
		const baseUrl = window.location.origin;
		navigator.clipboard.writeText(`${baseUrl}/access?utm_source=referral&utm_campaign=${code}`);
		copiedLinkCode = code;
		setTimeout(() => {
			copiedLinkCode = null;
		}, 1500);
	}

	// Edit state
	let editingCode: string | null = null;
	let editMaxUses: number | null = null;
	let editExpiresAt = '';
	let editLabel = '';
	let updating = false;
	let updateError = '';

	onMount(() => {
		loadCodes();
		// Auto-refresh every 30 seconds
		refreshInterval = setInterval(loadCodes, 30000);
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	});

	async function loadCodes() {
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/admin/codes');
			if (res.ok) {
				const data = await res.json();
				codes = data.codes || [];
				lastUpdated = new Date();
			} else {
				error = 'Failed to load access codes';
			}
		} catch {
			error = 'Network error loading codes';
		} finally {
			loading = false;
		}
	}

	function formatTime(date: Date | null): string {
		if (!date) return '';
		return date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	async function generateCode() {
		try {
			const res = await fetch('/api/admin/codes', { method: 'PATCH' });
			if (res.ok) {
				const data = await res.json();
				newCode = data.code;
			}
		} catch {
			// Ignore - user can type manually
		}
	}

	async function createCode() {
		creating = true;
		createError = '';

		try {
			const res = await fetch('/api/admin/codes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					code: newCode || null,
					maxUses: newMaxUses,
					expiresAt: newExpiresAt || null,
					label: newLabel || null
				})
			});

			if (res.ok) {
				// Reset form and reload
				newCode = '';
				newMaxUses = null;
				newExpiresAt = '';
				newLabel = '';
				showCreateForm = false;
				await loadCodes();
			} else {
				const data = await res.json();
				createError = data.error || 'Failed to create code';
			}
		} catch {
			createError = 'Network error';
		} finally {
			creating = false;
		}
	}

	async function deleteCode(code: string) {
		if (!confirm(`Are you sure you want to delete ${code}?`)) return;

		deletingCode = code;
		try {
			const res = await fetch('/api/admin/codes', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});

			if (res.ok) {
				await loadCodes();
			} else {
				alert('Failed to delete code');
			}
		} catch {
			alert('Network error');
		} finally {
			deletingCode = null;
		}
	}

	function startEdit(code: AccessCode) {
		editingCode = code.code;
		editMaxUses = code.maxUses;
		editExpiresAt = code.expiresAt ? toLocalDatetimeString(code.expiresAt) : '';
		editLabel = code.label || '';
		updateError = '';
	}

	function cancelEdit() {
		editingCode = null;
		editMaxUses = null;
		editExpiresAt = '';
		editLabel = '';
		updateError = '';
	}

	function toLocalDatetimeString(isoString: string): string {
		const date = new Date(isoString);
		const offset = date.getTimezoneOffset();
		const localDate = new Date(date.getTime() - offset * 60 * 1000);
		return localDate.toISOString().slice(0, 16);
	}

	async function updateCode() {
		if (!editingCode) return;

		updating = true;
		updateError = '';

		try {
			const res = await fetch('/api/admin/codes', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					code: editingCode,
					maxUses: editMaxUses,
					expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
					label: editLabel || null
				})
			});

			if (res.ok) {
				cancelEdit();
				await loadCodes();
			} else {
				const data = await res.json();
				updateError = data.error || 'Failed to update code';
			}
		} catch {
			updateError = 'Network error';
		} finally {
			updating = false;
		}
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return 'Never';
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function isExpired(expiresAt: string | null): boolean {
		if (!expiresAt) return false;
		return new Date(expiresAt) < new Date();
	}

	function isExhausted(code: AccessCode): boolean {
		return code.maxUses !== null && code.currentUses >= code.maxUses;
	}
</script>

<div class="py-8">
	<div class="mb-8 flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold">Access Codes</h1>
			{#if lastUpdated}
				<span class="text-xs text-gray-500">
					Auto-refreshes every 30s &middot; Last updated: {formatTime(lastUpdated)}
				</span>
			{/if}
		</div>
		<Button variant="primary" on:click={() => (showCreateForm = !showCreateForm)}>
			{showCreateForm ? 'Cancel' : 'Create New Code'}
		</Button>
	</div>

	{#if error}
		<div class="mb-6 rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
			{error}
		</div>
	{/if}

	<!-- Create Form -->
	{#if showCreateForm}
		<Card>
			<h2 class="mb-4 text-lg font-medium">Create Access Code</h2>
			{#if createError}
				<div
					class="mb-4 rounded-md border border-red-900/40 bg-red-900/20 p-2 text-sm text-red-300"
				>
					{createError}
				</div>
			{/if}
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label for="code" class="mb-1 block text-sm text-gray-300">
						Code (leave empty to auto-generate)
					</label>
					<div class="flex gap-2">
						<input
							id="code"
							type="text"
							bind:value={newCode}
							placeholder="ST0X-XXXX-XXXX"
							class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 uppercase text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
						/>
						<button
							type="button"
							on:click={generateCode}
							class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
						>
							Generate
						</button>
					</div>
				</div>
				<div>
					<label for="maxUses" class="mb-1 block text-sm text-gray-300">
						Max Uses (empty = unlimited)
					</label>
					<input
						id="maxUses"
						type="number"
						min="1"
						bind:value={newMaxUses}
						placeholder="Unlimited"
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
					/>
				</div>
				<div>
					<label for="expiresAt" class="mb-1 block text-sm text-gray-300">
						Expires At (optional)
					</label>
					<input
						id="expiresAt"
						type="datetime-local"
						bind:value={newExpiresAt}
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
					/>
				</div>
				<div>
					<label for="label" class="mb-1 block text-sm text-gray-300"> Label (for tracking) </label>
					<input
						id="label"
						type="text"
						bind:value={newLabel}
						placeholder="e.g., Twitter Campaign"
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
					/>
				</div>
			</div>
			<div class="mt-4 flex justify-end">
				<Button variant="primary" on:click={createCode} disabled={creating}>
					{creating ? 'Creating...' : 'Create Code'}
				</Button>
			</div>
		</Card>
	{/if}

	<!-- Codes List -->
	{#if loading}
		<div class="flex items-center gap-3 text-gray-400">
			<div
				class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
			></div>
			Loading codes...
		</div>
	{:else if codes.length === 0}
		<Card>
			<div class="py-8 text-center text-gray-400">
				<p>No access codes created yet.</p>
				<p class="mt-1 text-sm">Click "Create New Code" to get started.</p>
			</div>
		</Card>
	{:else}
		<Card>
			<!-- Edit Form (shown above table when editing) -->
			{#if editingCode}
				{@const code = codes.find((c) => c.code === editingCode)}
				{#if code}
					<div class="mb-4 border-b border-gray-700 pb-4">
						<div class="mb-3 flex items-center gap-3">
							<code class="rounded bg-gray-800 px-2 py-1 font-mono text-[#e8be89]">
								{code.code}
							</code>
							<span class="text-sm text-gray-400">Editing...</span>
						</div>

						{#if updateError}
							<div
								class="mb-3 rounded-md border border-red-900/40 bg-red-900/20 p-2 text-sm text-red-300"
							>
								{updateError}
							</div>
						{/if}

						<div class="grid gap-3 sm:grid-cols-4">
							<div>
								<label for="edit-maxUses" class="mb-1 block text-xs text-gray-400">Max Uses</label>
								<input
									id="edit-maxUses"
									type="number"
									min="1"
									bind:value={editMaxUses}
									placeholder="∞"
									class="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none"
								/>
							</div>
							<div>
								<label for="edit-expiresAt" class="mb-1 block text-xs text-gray-400">Expires</label>
								<input
									id="edit-expiresAt"
									type="datetime-local"
									bind:value={editExpiresAt}
									class="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white focus:border-[#e8be89] focus:outline-none"
								/>
							</div>
							<div>
								<label for="edit-label" class="mb-1 block text-xs text-gray-400">Label</label>
								<input
									id="edit-label"
									type="text"
									bind:value={editLabel}
									placeholder="Campaign name"
									class="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none"
								/>
							</div>
							<div class="flex items-end gap-2">
								<button
									on:click={cancelEdit}
									disabled={updating}
									class="rounded border border-gray-700 bg-gray-800 px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
								>
									Cancel
								</button>
								<button
									on:click={updateCode}
									disabled={updating}
									class="rounded bg-[#e8be89] px-3 py-1 text-sm font-medium text-gray-900 hover:bg-[#d4a875] disabled:opacity-50"
								>
									{updating ? 'Saving...' : 'Save'}
								</button>
							</div>
						</div>
					</div>
				{/if}
			{/if}

			<!-- Compact Table -->
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-gray-700 text-xs text-gray-400">
						<tr>
							<th class="pb-2 pr-3">Code</th>
							<th class="pb-2 pr-3">Label</th>
							<th class="pb-2 pr-3 text-center">Uses</th>
							<th class="pb-2 pr-3 text-center">Wallets</th>
							<th class="pb-2 pr-3">Expires</th>
							<th class="pb-2 text-right">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-800">
						{#each codes as code}
							<tr class="hover:bg-gray-800/30">
								<td class="py-2 pr-3">
									<div class="flex items-center gap-2">
										<code class="font-mono text-[#e8be89]">{code.code}</code>
										{#if isExpired(code.expiresAt)}
											<span class="rounded bg-red-900/30 px-1.5 py-0.5 text-[10px] text-red-400"
												>Expired</span
											>
										{:else if isExhausted(code)}
											<span
												class="rounded bg-yellow-900/30 px-1.5 py-0.5 text-[10px] text-yellow-400"
												>Exhausted</span
											>
										{:else}
											<span class="rounded bg-green-900/30 px-1.5 py-0.5 text-[10px] text-green-400"
												>Active</span
											>
										{/if}
									</div>
								</td>
								<td class="py-2 pr-3 text-gray-400">{code.label || '-'}</td>
								<td class="py-2 pr-3 text-center">
									<span class="text-white">{code.currentUses}</span><span class="text-gray-500"
										>/{code.maxUses ?? '∞'}</span
									>
								</td>
								<td class="py-2 pr-3 text-center text-white">{code.walletCount}</td>
								<td class="py-2 pr-3 text-gray-400">
									{#if code.expiresAt}
										{formatDate(code.expiresAt)}
									{:else}
										<span class="text-gray-500">Never</span>
									{/if}
								</td>
								<td class="py-2 text-right">
									<div class="flex justify-end gap-1">
										<button
											on:click={() => startEdit(code)}
											class="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-white"
											title="Edit"
										>
											Edit
										</button>
										<button
											on:click={() => copyCode(code.code)}
											class="rounded px-2 py-1 text-xs transition-all {copiedCode === code.code
												? 'bg-green-600/20 text-green-400'
												: 'text-gray-400 hover:bg-gray-700 hover:text-white'}"
											title="Copy code"
										>
											{copiedCode === code.code ? '✓' : 'Code'}
										</button>
										<button
											on:click={() => copyLink(code.code)}
											class="rounded px-2 py-1 text-xs transition-all {copiedLinkCode === code.code
												? 'bg-green-600/20 text-green-400'
												: 'text-gray-400 hover:bg-gray-700 hover:text-white'}"
											title="Copy referral link"
										>
											{copiedLinkCode === code.code ? '✓' : 'Link'}
										</button>
										<button
											on:click={() => deleteCode(code.code)}
											disabled={deletingCode === code.code}
											class="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 disabled:opacity-50"
											title="Delete"
										>
											{deletingCode === code.code ? '...' : '×'}
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	{/if}
</div>
