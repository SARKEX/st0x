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
		<div class="space-y-4">
			{#each codes as code}
				<Card>
					{#if editingCode === code.code}
						<!-- Edit Form -->
						<div class="space-y-4">
							<div class="flex items-center gap-3">
								<code class="rounded bg-gray-800 px-2 py-1 font-mono text-lg text-[#e8be89]">
									{code.code}
								</code>
								<span class="text-sm text-gray-400">Editing...</span>
							</div>

							{#if updateError}
								<div
									class="rounded-md border border-red-900/40 bg-red-900/20 p-2 text-sm text-red-300"
								>
									{updateError}
								</div>
							{/if}

							<div class="grid gap-4 sm:grid-cols-3">
								<div>
									<label for="edit-maxUses" class="mb-1 block text-sm text-gray-300">
										Max Uses (empty = unlimited)
									</label>
									<input
										id="edit-maxUses"
										type="number"
										min="1"
										bind:value={editMaxUses}
										placeholder="Unlimited"
										class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
									/>
									<p class="mt-1 text-xs text-gray-500">
										Current uses: {code.currentUses}
									</p>
								</div>
								<div>
									<label for="edit-expiresAt" class="mb-1 block text-sm text-gray-300">
										Expires At
									</label>
									<input
										id="edit-expiresAt"
										type="datetime-local"
										bind:value={editExpiresAt}
										class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
									/>
								</div>
								<div>
									<label for="edit-label" class="mb-1 block text-sm text-gray-300">Label</label>
									<input
										id="edit-label"
										type="text"
										bind:value={editLabel}
										placeholder="e.g., Twitter Campaign"
										class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
									/>
								</div>
							</div>

							<div class="flex justify-end gap-2">
								<button
									on:click={cancelEdit}
									disabled={updating}
									class="rounded-md border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
								>
									Cancel
								</button>
								<Button variant="primary" on:click={updateCode} disabled={updating}>
									{updating ? 'Saving...' : 'Save Changes'}
								</Button>
							</div>
						</div>
					{:else}
						<!-- Display Mode -->
						<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div class="flex-1">
								<div class="flex items-center gap-3">
									<code class="rounded bg-gray-800 px-2 py-1 font-mono text-lg text-[#e8be89]">
										{code.code}
									</code>
									{#if isExpired(code.expiresAt)}
										<span class="rounded-full bg-red-900/30 px-2 py-0.5 text-xs text-red-400">
											Expired
										</span>
									{:else if isExhausted(code)}
										<span class="rounded-full bg-yellow-900/30 px-2 py-0.5 text-xs text-yellow-400">
											Exhausted
										</span>
									{:else}
										<span class="rounded-full bg-green-900/30 px-2 py-0.5 text-xs text-green-400">
											Active
										</span>
									{/if}
								</div>
								{#if code.label}
									<p class="mt-1 text-sm text-gray-400">{code.label}</p>
								{/if}
								<div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-400">
									<span>
										Uses: <span class="text-white">{code.currentUses}</span>
										{#if code.maxUses !== null}
											/ {code.maxUses}
										{:else}
											<span class="text-gray-500">(unlimited)</span>
										{/if}
									</span>
									<span>
										Wallets: <span class="text-white">{code.walletCount}</span>
									</span>
									<span>
										Created: <span class="text-white">{formatDate(code.createdAt)}</span>
									</span>
									{#if code.expiresAt}
										<span>
											Expires: <span class="text-white">{formatDate(code.expiresAt)}</span>
										</span>
									{/if}
								</div>
							</div>
							<div class="flex gap-2">
								<button
									on:click={() => startEdit(code)}
									class="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
								>
									Edit
								</button>
								<button
									on:click={() => navigator.clipboard.writeText(code.code)}
									class="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
								>
									Copy
								</button>
								<button
									on:click={() => deleteCode(code.code)}
									disabled={deletingCode === code.code}
									class="rounded-md border border-red-900/50 bg-red-900/20 px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/30 disabled:opacity-50"
								>
									{deletingCode === code.code ? 'Deleting...' : 'Delete'}
								</button>
							</div>
						</div>
					{/if}
				</Card>
			{/each}
		</div>
	{/if}
</div>
