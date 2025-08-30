<script lang="ts">
	export let dataTestId: string = '';
	export let variant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'secondary';
	export let size: 'sm' | 'md' | 'lg' = 'md';
	export let fullWidth: boolean = false;

	const variantClass = {
		primary: 'bg-gradient-to-r from-blue-600 to-purple-700 text-white hover:opacity-90',
		secondary: 'bg-white/10 text-white hover:bg-white/20',
		danger: 'bg-red-600/80 text-white hover:bg-red-600',
		ghost: 'bg-transparent text-white border border-white/10 hover:bg-white/10'
	}[variant];

	const sizeClass = {
		sm: 'px-2 py-1 text-xs',
		md: 'px-3 py-2 text-sm',
		lg: 'px-4 py-2.5 text-base'
	}[size];
</script>

<button
	{...$$restProps}
	data-testid={dataTestId}
	class={
		"inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-colors " +
		"focus:outline-none focus:ring-2 focus:ring-yellow-500/30 disabled:opacity-50 disabled:cursor-not-allowed " +
		variantClass + " " + sizeClass + (fullWidth ? ' w-full' : '')
	}
>
	<slot />
</button>
