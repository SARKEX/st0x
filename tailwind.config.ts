import type { Config } from 'tailwindcss';
import { neutral } from 'tailwindcss/colors';

// Mint-emerald signature scale (anchor 400 = #2de3a6). Yellow is RETIRED: the
// whole `yellow` palette is remapped onto mint so legacy yellow CTAs become the
// new green signature automatically. `emerald` is also pinned to this exact
// scale so the v2 mockup's literal emerald-* classes render pixel-accurate.
const mint = {
	50: '#e9fdf6',
	100: '#c8fae9',
	200: '#9bf3d6',
	300: '#62ecc1',
	400: '#2de3a6',
	500: '#16c78c',
	600: '#10a877',
	700: '#0e8a62',
	800: '#0f6e50',
	900: '#0e5a43',
	950: '#053124'
};

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],

	// Dark is the default; light is opt-in via [data-theme="light"] on <html>.
	// `dark:` variants resolve against the explicit dark attribute.
	darkMode: ['selector', '[data-theme="dark"]'],

	theme: {
		extend: {
			fontFamily: {
				display: ['Space Grotesk', 'DM Sans', 'system-ui', 'sans-serif'],
				sans: ['DM Sans', 'system-ui', 'sans-serif'],
				mono: ['JetBrains Mono', 'ui-monospace', 'monospace']
			},
			colors: {
				// Signature scales — concrete hex so opacity modifiers work.
				emerald: mint,
				yellow: mint,
				mint,
				iris: {
					DEFAULT: 'var(--iris)',
					300: '#a7b1ff',
					400: '#8f9bff',
					500: '#7d8bff',
					600: '#5b66e0'
				},

				// Theme-aware, token-backed aliases. In dark these resolve to the
				// v2 mockup's exact values; in light they flip automatically.
				primary: 'var(--accent)',
				accent: {
					DEFAULT: 'var(--accent)',
					bright: 'var(--accent-bright)',
					deep: 'var(--accent-deep)',
					ink: 'var(--accent-ink)',
					soft: 'var(--accent-soft)',
					line: 'var(--accent-line)',
					glow: 'var(--accent-glow)'
				},
				bg: { DEFAULT: 'var(--bg)', deep: 'var(--bg-deep)' },
				surface: {
					1: 'var(--surface-1)',
					2: 'var(--surface-2)',
					3: 'var(--surface-3)'
				},
				text: {
					DEFAULT: 'var(--text)',
					2: 'var(--text-2)',
					3: 'var(--text-3)',
					muted: 'var(--text-muted)'
				},
				line: {
					DEFAULT: 'var(--line)',
					strong: 'var(--line-strong)',
					accent: 'var(--line-accent)'
				},
				// Theme-aware translucent overlays. The alpha lives inside the var, so
				// use the bare class (e.g. `bg-overlay-1`) — opacity modifiers won't work.
				overlay: {
					1: 'var(--overlay-1)',
					2: 'var(--overlay-2)',
					strong: 'var(--overlay-strong)',
					hover: 'var(--overlay-hover)'
				},
				up: 'var(--up)',
				down: { DEFAULT: 'var(--down)', soft: 'var(--down-soft)' },

				// Kept during migration so un-converted gray-* utilities still resolve.
				gray: { ...neutral }
			}
		}
	},

	plugins: [require('@tailwindcss/typography')]
} as Config;
