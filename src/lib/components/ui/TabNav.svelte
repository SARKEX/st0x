<script lang="ts">
	// Tabs: array of { id: string; label: string }
	export let tabs: { id: string; label: string }[] = [];
	export let activeId: string;
	// Emit change events
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher<{ change: { id: string } }>();

	function setActive(id: string) {
		if (id === activeId) return;
		activeId = id;
		dispatch('change', { id });
	}

	export let className: string = '';

	function onKeydown(event: KeyboardEvent) {
		const currentIndex = tabs.findIndex((t) => t.id === activeId);
		if (currentIndex === -1) return;
		switch (event.key) {
			case 'ArrowRight': {
				const next = (currentIndex + 1) % tabs.length;
				setActive(tabs[next].id);
				event.preventDefault();
				break;
			}
			case 'ArrowLeft': {
				const prev = (currentIndex - 1 + tabs.length) % tabs.length;
				setActive(tabs[prev].id);
				event.preventDefault();
				break;
			}
			case 'Home': {
				setActive(tabs[0].id);
				event.preventDefault();
				break;
			}
			case 'End': {
				setActive(tabs[tabs.length - 1].id);
				event.preventDefault();
				break;
			}
		}
	}
</script>

<div
	class={'flex gap-2 overflow-x-auto border-b border-white/10 ' + className}
	role="tablist"
	tabindex="0"
	on:keydown={onKeydown}
>
	{#each tabs as tab}
		<button
			role="tab"
			aria-selected={activeId === tab.id}
			aria-controls={`panel-${tab.id}`}
			tabindex={activeId === tab.id ? 0 : -1}
			on:click={() => setActive(tab.id)}
			class={'flex-shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
				(activeId === tab.id
					? 'border-yellow-500 text-yellow-500'
					: 'border-transparent text-gray-400 hover:text-white')}
		>
			{tab.label}
		</button>
	{/each}
</div>
