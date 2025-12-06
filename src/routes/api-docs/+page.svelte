<svelte:head>
	<title>API Documentation | st0x</title>
	<meta name="description" content="st0x Public API documentation for rewards, RocketBoost, and wallet data." />
</svelte:head>

<div class="api-docs-wrapper">
	<iframe
		src="/scalar.html"
		title="API Documentation"
		class="api-docs-iframe"
	></iframe>
</div>

<style>
	.api-docs-wrapper {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
	}

	.api-docs-iframe {
		width: 100%;
		height: 100%;
		border: none;
	}
</style>
