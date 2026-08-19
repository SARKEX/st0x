<script lang="ts">
	// Backwards-compatible alias for the canonical icon set. New code should import
	// `$lib/components/ui/Icon.svelte` directly; this wrapper keeps existing earn
	// imports working and guarantees a single source of truth for glyphs.
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { EarnIconName } from '$lib/config/earn';

	export let name: EarnIconName;
	export let className = 'h-5 w-5';
	export let stroke = 1.6;
</script>

<Icon {name} {className} {stroke} />
