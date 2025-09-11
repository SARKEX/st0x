<script lang="ts">
	export let ariaLabel: string = 'Share';
</script>

<svg
	{...$$restProps}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden={ariaLabel ? undefined : true}
	aria-label={ariaLabel}
	xmlns="http://www.w3.org/2000/svg"
>
	<circle cx="18" cy="5" r="3" fill="currentColor" stroke="none" />
	<circle cx="6" cy="12" r="3" fill="currentColor" stroke="none" />
	<circle cx="18" cy="19" r="3" fill="currentColor" stroke="none" />
	<path d="M8.9 10.7l5.2-3.1M8.9 13.3l5.2 3.1" />
</svg>
