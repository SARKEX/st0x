<script lang="ts">
	export let logoUrl: string | undefined = undefined;
	export let symbol: string;
	export let name: string = '';
export let size: 'sm' | 'md' | 'lg' = 'md';
	export let showName: boolean = true;
	export let className: string = '';
	
	const sizes = {
		sm: {
			image: 'h-6 w-6',
			placeholder: 'h-6 w-6 text-xs',
			gap: 'gap-2',
			symbolText: 'text-sm',
			nameText: 'text-xs'
		},
		md: {
			image: 'h-8 w-8',
			placeholder: 'h-8 w-8 text-xs',
			gap: 'gap-3',
			symbolText: 'text-base',
			nameText: 'text-xs'
		},
		lg: {
			image: 'h-10 w-10',
			placeholder: 'h-10 w-10 text-sm',
			gap: 'gap-3',
			symbolText: 'text-lg',
			nameText: 'text-sm'
    }
	};
	
	$: sizeConfig = sizes[size];
</script>

<div class={"flex items-center " + sizeConfig.gap + " " + className}>
	{#if logoUrl}
		<img 
			src={logoUrl} 
			alt={symbol} 
			class={sizeConfig.image + " rounded-full bg-gray-700 object-cover"}
			loading="lazy"
		/>
	{:else}
		<div class={
			"flex items-center justify-center rounded-full bg-gray-700 font-bold " + 
			sizeConfig.placeholder
		}>
			{symbol?.charAt(0) || '?'}
		</div>
	{/if}
	
	<div class="min-w-0">
		<div class={"font-medium truncate " + sizeConfig.symbolText}>
			{symbol}
		</div>
		{#if showName && name}
			<div class={"text-gray-400 truncate " + sizeConfig.nameText}>
				{name}
			</div>
		{/if}
	</div>
	
	{#if $$slots.extra}
		<div class="ml-auto">
			<slot name="extra" />
		</div>
	{/if}
</div>
