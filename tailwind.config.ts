import type { Config } from 'tailwindcss';
import { neutral, blue } from 'tailwindcss/colors';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],

	theme: {
		extend: {
			colors: {
				primary: '#4c77ba',
				gray: { ...neutral },
				brand: {
					gold: {
						DEFAULT: '#E09936',
						50: '#FEF7EC',
						100: '#FDECD3',
						200: '#FBD5A1',
						300: '#F8BE6F',
						400: '#F0A94B',
						500: '#E09936',
						600: '#C47D1E',
						700: '#9C6218',
						800: '#744A15',
						900: '#4C3212'
					},
					purple: {
						DEFAULT: '#2D2950',
						50: '#EEEDF5',
						100: '#D8D5E8',
						200: '#B1ABCF',
						300: '#8A81B6',
						400: '#635A9A',
						500: '#443D73',
						600: '#363062',
						700: '#2D2950',
						800: '#211E3B',
						900: '#161428'
					}
				}
			},
			fontFamily: {
				serif: ['Instrument Serif', 'Georgia', 'serif']
			},
			zIndex: {
				header: '100',
				sidebar: '200',
				'mobile-nav': '150',
				dropdown: '300',
				'modal-backdrop': '400',
				modal: '410',
				tooltip: '500',
				toast: '600'
			}
		}
	},

	plugins: [require('@tailwindcss/typography')]
} as Config;
