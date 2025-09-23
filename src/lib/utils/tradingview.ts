type TradingViewWidget = { remove?: () => void };
type TradingViewWidgetConstructor = new (config: Record<string, unknown>) => TradingViewWidget;

type TradingViewGlobal = {
	widget: TradingViewWidgetConstructor;
};

let tradingViewPromise: Promise<TradingViewGlobal> | null = null;

function createScript(): Promise<void> {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = 'https://s3.tradingview.com/tv.js';
		script.async = true;
		script.onload = () => resolve();
		script.onerror = (event) => reject(event);
		document.head.appendChild(script);
	});
}

export async function loadTradingView(): Promise<TradingViewGlobal> {
	if (typeof window === 'undefined') {
		throw new Error('TradingView can only be loaded in the browser');
	}

	if (window.TradingView) {
		return window.TradingView as TradingViewGlobal;
	}

	if (!tradingViewPromise) {
		tradingViewPromise = (async () => {
			await createScript();
			if (!window.TradingView) {
				throw new Error('TradingView library failed to load');
			}
			return window.TradingView as TradingViewGlobal;
		})();
	}

	return tradingViewPromise;
}

declare global {
	interface Window {
		TradingView: TradingViewGlobal;
	}
}
