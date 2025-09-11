<script lang="ts">
	export let ariaLabel: string = 'Link';
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
	<path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 5" />
	<path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07L13 19" />
</svg>
