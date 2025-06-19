<script lang="ts">
	import Modal from './Modal.svelte';
	import hljs from 'highlight.js/lib/core';
	import javascript from 'highlight.js/lib/languages/javascript';
	import 'highlight.js/styles/github-dark.css';

	hljs.registerLanguage('javascript', javascript);

	export let show: boolean = false;
	export let rainlangCode: string = '';
	export let onDeploy: () => void;
	export let onCancel: () => void;

	let codeElement: HTMLElement | null = null;

	$: if (codeElement) {
		hljs.highlightElement(codeElement);
	}
</script>

<Modal {show} title="Composed Rainlang" onClose={onCancel}>
	<div class="space-y-4">
		<div class="rounded-lg border border-white/10 bg-gray-900 p-4">
			<pre class="whitespace-pre-wrap text-sm font-mono overflow-x-auto">
				<code bind:this={codeElement} class="language-javascript">{rainlangCode}</code>
			</pre>
		</div>
		
		<div class="flex justify-end space-x-3 pt-4">
			<button
				type="button"
				class="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700/30 border border-white/10 rounded-lg hover:bg-gray-600/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
				on:click={onCancel}
			>
				Cancel
			</button>
			<button
				type="button"
				class="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-purple-700 border border-transparent rounded-lg hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform font-semibold"
				on:click={onDeploy}
			>
				Deploy Strategy
			</button>
		</div>
	</div>
</Modal> 