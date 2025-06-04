import type { Config } from 'tailwindcss';
import { neutral, blue } from 'tailwindcss/colors';

export default {
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		'./node_modules/flowbite-svelte-icons/**/*.{html,js,svelte,ts}',
		'./node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}'
	],

	theme: {
		extend: {
			colors: {
				primary: '#4c77ba',
				gray: { ...neutral }
			}
		}
	},

	plugins: [require('@tailwindcss/typography'), require('flowbite/plugin')]
} as Config;
