<script lang="ts">
	export let variant: 'info' | 'warning' | 'success' | 'error' = 'info';
	export let title: string = '';
	export let description: string = '';
	export let className: string = '';

	const variants = {
		info: {
			borderClass: 'border-blue-500/30',
			bgClass: 'bg-blue-500/10',
			iconClass: 'text-blue-600 dark:text-blue-400',
			titleClass: 'text-blue-600 dark:text-blue-400'
		},
		warning: {
			borderClass: 'border-amber-500/30',
			bgClass: 'bg-amber-500/10',
			iconClass: 'text-amber-300',
			titleClass: 'text-amber-300'
		},
		success: {
			borderClass: 'border-green-500/30',
			bgClass: 'bg-green-500/10',
			iconClass: 'text-green-400',
			titleClass: 'text-green-400'
		},
		error: {
			borderClass: 'border-red-500/30',
			bgClass: 'bg-red-500/10',
			iconClass: 'text-red-400',
			titleClass: 'text-red-400'
		}
	};

	$: variantConfig = variants[variant];
</script>

<div
	class={'flex items-start gap-3 rounded-lg border p-3 sm:p-4 ' +
		variantConfig.borderClass +
		' ' +
		variantConfig.bgClass +
		' ' +
		className}
>
	{#if variant === 'info'}
		<svg
			class={'mt-0.5 h-4 w-4 flex-shrink-0 sm:h-5 sm:w-5 ' + variantConfig.iconClass}
			fill="currentColor"
			viewBox="0 0 20 20"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fill-rule="evenodd"
				d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
				clip-rule="evenodd"
			></path>
		</svg>
	{:else if variant === 'warning'}
		<svg
			class={'mt-0.5 h-4 w-4 flex-shrink-0 sm:h-5 sm:w-5 ' + variantConfig.iconClass}
			fill="currentColor"
			viewBox="0 0 20 20"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fill-rule="evenodd"
				d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
				clip-rule="evenodd"
			></path>
		</svg>
	{:else if variant === 'success'}
		<svg
			class={'mt-0.5 h-4 w-4 flex-shrink-0 sm:h-5 sm:w-5 ' + variantConfig.iconClass}
			fill="currentColor"
			viewBox="0 0 20 20"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fill-rule="evenodd"
				d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
				clip-rule="evenodd"
			></path>
		</svg>
	{:else if variant === 'error'}
		<svg
			class={'mt-0.5 h-4 w-4 flex-shrink-0 sm:h-5 sm:w-5 ' + variantConfig.iconClass}
			fill="currentColor"
			viewBox="0 0 20 20"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fill-rule="evenodd"
				d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
				clip-rule="evenodd"
			></path>
		</svg>
	{/if}

	<div class="min-w-0 flex-1">
		{#if title}
			<div class={'font-medium ' + variantConfig.titleClass}>
				{title}
			</div>
		{/if}

		{#if description}
			<div class={'text-sm text-text-2 ' + (title ? 'mt-1' : '')}>
				{description}
			</div>
		{:else}
			<div class={'text-sm text-text-2 ' + (title ? 'mt-1' : '')}>
				<slot />
			</div>
		{/if}

		{#if $$slots.action}
			<div class="mt-3">
				<slot name="action" />
			</div>
		{/if}
	</div>
</div>
