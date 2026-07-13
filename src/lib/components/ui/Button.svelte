<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	export let dataTestId: string = '';
	export let variant: 'primary' | 'secondary' | 'danger' | 'ghost' | 'quiet' = 'secondary';
	export let size: 'sm' | 'md' | 'lg' = 'md';
	export let fullWidth: boolean = false;
	export let className: string = '';

	const dispatch = createEventDispatcher<{ click: MouseEvent }>();

	const variantClass = {
		primary:
			'bg-gradient-to-b from-accent-bright to-accent text-accent-ink shadow-[0_10px_30px_-10px_var(--accent-glow)] hover:brightness-105',
		secondary: 'bg-surface-2 text-text border border-line-strong hover:bg-surface-3',
		danger: 'bg-down text-white hover:brightness-110',
		ghost: 'bg-transparent text-text border border-line hover:bg-surface-2',
		quiet: 'bg-transparent text-text-2 hover:bg-surface-2 hover:text-text'
	}[variant];

	const sizeClass = {
		sm: 'px-2 py-1 text-xs',
		md: 'px-3 py-2 text-sm',
		lg: 'px-4 py-2.5 text-base'
	}[size];
</script>

<button
	type="button"
	{...$$restProps}
	on:click={(e) => dispatch('click', e)}
	data-testid={dataTestId}
	class={'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition ' +
		'focus:outline-none focus:ring-2 focus:ring-accent-line disabled:cursor-not-allowed disabled:opacity-50 ' +
		variantClass +
		' ' +
		sizeClass +
		(fullWidth ? ' w-full' : '') +
		(className ? ' ' + className : '')}
>
	<slot />
</button>
