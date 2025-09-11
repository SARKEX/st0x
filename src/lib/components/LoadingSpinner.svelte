<script lang="ts">
	export let size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
	export let variant: 'inline' | 'fullscreen' | 'button' | 'dot' = 'inline';
	export let text: string = 'Loading...';
	export let showText: boolean = true;

	// Size configurations
	const sizeConfig = {
		sm: { spinner: 'h-4 w-4', text: 'text-sm' },
		md: { spinner: 'h-10 w-10', text: 'text-lg' },
		lg: { spinner: 'h-16 w-16', text: 'text-xl' },
		xl: { spinner: 'h-32 w-32', text: 'text-2xl' }
	};

	// Variant configurations
	const variantConfig = {
		inline: {
			container: 'flex flex-col items-center justify-center gap-3',
			spinner:
				'relative animate-spin rounded-full border-4 border-transparent border-b-purple-700 border-l-green-500 border-r-blue-600 border-t-yellow-500',
			text: 'font-medium text-gray-300'
		},
		fullscreen: {
			container: 'flex flex-col h-screen items-center justify-center bg-gray-900 gap-4',
			spinner:
				'relative animate-spin rounded-full border-4 border-transparent border-b-purple-700 border-l-green-500 border-r-blue-600 border-t-yellow-500',
			text: 'text-center font-semibold text-white'
		},
		button: {
			container: 'flex items-center gap-2',
			spinner:
				'relative animate-spin rounded-full border-2 border-transparent border-b-purple-700 border-l-green-500 border-r-blue-600 border-t-yellow-500',
			text: 'text-sm'
		},
		dot: {
			container: 'inline-block',
			spinner: 'animate-pulse rounded-full bg-yellow-400',
			text: ''
		}
	};

	$: currentSize = sizeConfig[size];
	$: currentVariant = variantConfig[variant];
</script>

{#if variant === 'dot'}
	<div class="h-2 w-2 {currentVariant.spinner}" title={text}></div>
{:else if variant === 'fullscreen'}
	<div class={currentVariant.container}>
		<div class="relative">
			<div
				class="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-20"
			></div>
			<div class="relative {currentSize.spinner} {currentVariant.spinner}"></div>
			<div class="absolute inset-0 flex items-center justify-center">
				<div
					class="h-{size === 'xl' ? '24' : '12'} w-{size === 'xl'
						? '24'
						: '12'} rounded-full bg-gray-{size === 'xl' ? '900' : '800'}"
				></div>
			</div>
		</div>
		{#if showText}
			<div class="{currentSize.text} {currentVariant.text}">{text}</div>
		{/if}
	</div>
{:else}
	<div class={currentVariant.container}>
		<div class="{currentSize.spinner} {currentVariant.spinner}"></div>
		{#if showText}
			<div class="{currentSize.text} {currentVariant.text}">{text}</div>
		{/if}
	</div>
{/if}
