<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import hljs from 'highlight.js/lib/core';
	import javascript from 'highlight.js/lib/languages/javascript';
	import 'highlight.js/styles/github-dark.css';

	hljs.registerLanguage('javascript', javascript);

	export let show: boolean = false;
	export let rainlangCode: string = '';
	export let onDeploy: () => void | Promise<void>;
	export let onCancel: () => void;

	let codeElement: HTMLElement | null = null;

	$: if (codeElement) {
		hljs.highlightElement(codeElement);
	}
</script>

<Modal {show} title="Deploy Strategy on chain" onClose={onCancel}>
	<div class="space-y-4">
		<div class="rounded-lg border border-white/10 bg-gray-900 p-4">
			<pre class="overflow-x-auto whitespace-pre-wrap font-mono text-sm">
				<code bind:this={codeElement} class="language-javascript">{rainlangCode}</code>
			</pre>
		</div>

		<div class="flex justify-end space-x-3 pt-4">
			<Button variant="ghost" size="md" on:click={onCancel}>Cancel</Button>
			<Button variant="primary" size="md" on:click={onDeploy}>Deploy Strategy</Button>
		</div>
	</div>
</Modal>
