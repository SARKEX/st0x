<script lang="ts">
	export let ariaLabel: string = 'External link';
	// Accept any passed attributes (e.g., class) via $$restProps
</script>

<svg
	{...$$restProps}
	viewBox="0 0 20 20"
	fill="currentColor"
	aria-hidden={ariaLabel ? undefined : true}
	aria-label={ariaLabel}
	xmlns="http://www.w3.org/2000/svg"
>
	<path
		fill-rule="evenodd"
		d="M12.293 2.293a1 1 0 011.414 0l4 4A1 1 0 0117 8h-3a1 1 0 110-2h.586L12 3.414V4a1 1 0 11-2 0V3a1 1 0 011-1h1.293zM5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 112 0v3a4 4 0 01-4 4H5a4 4 0 01-4-4V7a4 4 0 014-4h3a1 1 0 110 2H5z"
		clip-rule="evenodd"
	/>
</svg>
