<script lang="ts">
	export let ariaLabel: string = 'Wallet';
</script>

<svg
	{...$$restProps}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden={ariaLabel ? undefined : true}
	aria-label={ariaLabel}
	xmlns="http://www.w3.org/2000/svg"
>
	<path
		d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1.5 1.5 0 0 1 0 3H5.5A2.5 2.5 0 0 1 3 5.5v13A2.5 2.5 0 0 0 5.5 21H18a3 3 0 0 0 3-3v-4a3 3 0 0 0-3-3H6"
	/>
	<circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none" />
</svg>
