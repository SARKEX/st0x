<script lang="ts">
	import { theme, setTheme } from '$lib/stores/themeStore';
</script>

<div
	class="inline-flex items-center gap-0 rounded-full border border-line bg-surface-2 p-1"
	role="group"
	aria-label="Theme"
>
	<button
		type="button"
		aria-label="Light theme"
		aria-pressed={$theme === 'light'}
		on:click={() => setTheme('light')}
		class="flex h-7 w-[34px] items-center justify-center rounded-full transition-all duration-200 {$theme ===
		'light'
			? 'bg-surface-1 text-accent shadow-sm'
			: 'text-text-3 hover:text-text-2'}"
	>
		<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6">
			<circle cx="12" cy="12" r="4.2" />
			<path
				stroke-linecap="round"
				d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
			/>
		</svg>
	</button>
	<button
		type="button"
		aria-label="Dark theme"
		aria-pressed={$theme === 'dark'}
		on:click={() => setTheme('dark')}
		class="flex h-7 w-[34px] items-center justify-center rounded-full transition-all duration-200 {$theme ===
		'dark'
			? 'bg-surface-1 text-accent shadow-sm'
			: 'text-text-3 hover:text-text-2'}"
	>
		<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M20 13.5A8 8 0 1 1 10.5 4a6.2 6.2 0 0 0 9.5 9.5z"
			/>
		</svg>
	</button>
</div>
