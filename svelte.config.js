import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import preprocessReact from 'svelte-preprocess-react/preprocessReact';
import rehypeKatexSvelte from 'rehype-katex-svelte';
import remarkMath from 'remark-math';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [
		vitePreprocess(),
		preprocessReact(),
		mdsvex({
			remarkPlugins: [remarkMath],
			rehypePlugins: [rehypeKatexSvelte],
			extensions: ['.svx', '.md']
		})
	],

	kit: {
		adapter: adapter({
			external: ['@scalar/api-reference'],
			runtime: 'nodejs22.x'
		}),
		paths: {
			relative: true
		}
	},

	extensions: ['.svelte', '.svx', '.md']
};

export default config;
