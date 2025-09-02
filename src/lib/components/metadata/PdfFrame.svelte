<script lang="ts">
	export let url: string = '';
</script>

<div class="container">
	<object title="PDF from Metadata" data-testId="pdf-object" class="pdf" data={url} />
</div>

<style>
	.container {
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.pdf {
		padding: 20px;
		width: calc(100% - 20px);
		height: calc(100vh - 20px);
	}
</style>

