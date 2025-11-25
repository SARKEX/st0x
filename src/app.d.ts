// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		interface MdsvexFile {
			default: import('svelte/internal').SvelteComponent;
			metadata: Record<string, string>;
		}

		type MdsvexResolver = () => Promise<MdsvexFile>;
	}

	// hCaptcha global
	interface Window {
		hcaptcha?: {
			render: (
				container: string | HTMLElement,
				options: {
					sitekey: string;
					callback?: (token: string) => void;
					'expired-callback'?: () => void;
					'error-callback'?: () => void;
					theme?: 'light' | 'dark';
					size?: 'normal' | 'compact' | 'invisible';
				}
			) => string;
			reset: (widgetId?: string) => void;
			getResponse: (widgetId?: string) => string;
			execute: (widgetId?: string) => void;
		};
	}
}

export {};
