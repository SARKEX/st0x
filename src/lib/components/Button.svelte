<script lang="ts">
	export let inset: boolean = false;
	export let dataTestId: string = '';
</script>

<button {...$$restProps} on:click class:inset class:outset={!inset} data-testid={dataTestId}>
	<slot />
</button>

<style>
	button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border: 4px solid white;
		background-color: #111111;
		padding: 0.25rem 0.5rem;
		font-weight: bold;
		color: white;
		transition: all 0.2s;
	}

	button:hover {
		background-color: #111111;
	}

	button:disabled {
		background-color: #4b5563;
	}

	@media (min-width: 768px) {
		button {
			padding: 0.5rem 1rem;
		}
	}
</style>
