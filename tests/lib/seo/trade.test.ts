import { describe, expect, it } from 'vitest';
import {
	buildTradeDescription,
	getTradeSeoMetadata,
	injectTradeSeoHead,
	removeInjectedTradeSeoHead,
	syncTradeRobotsMeta
} from '$lib/seo/trade';

const NVDA_WRAPPED = '0xFb5B41acdbA20a3230F84BE995173CFb98b8D6E7';
const NVDA_LEGACY = '0x69fca9f7fad46a7eef3acef5beac9df5b7eca73b';

describe('trade SEO metadata', () => {
	it('resolves known address variants to the canonical wrapped-token URL', () => {
		const metadata = getTradeSeoMetadata(`/trade/${NVDA_LEGACY}`);

		expect(metadata).toEqual({
			title: 'Trade Wrapped NVIDIA Corporation ST0x | ST0x',
			description:
				'Trade Wrapped NVIDIA Corporation ST0x 24/7 on ST0x with on-chain execution and non-custodial settlement on Base.',
			canonicalUrl: `https://www.st0x.io/trade/${NVDA_WRAPPED}`
		});
	});

	it('does not make a generic 1:1 backing claim', () => {
		expect(buildTradeDescription('Wrapped iShares 0-3 Month Treasury Bond ETF ST0x')).not.toContain(
			'1:1'
		);
	});

	it('injects complete social metadata into a client-only HTML shell', () => {
		const html = injectTradeSeoHead(
			'<html><head></head><body><div id="svelte"></div></body></html>',
			`/trade/${NVDA_WRAPPED}`
		);
		const document = new DOMParser().parseFromString(html, 'text/html');

		expect(document.title).toBe('Trade Wrapped NVIDIA Corporation ST0x | ST0x');
		expect(document.querySelector('meta[name="description"]')).not.toBeNull();
		expect(document.querySelector('meta[property="og:title"]')).not.toBeNull();
		expect(document.querySelector('meta[property="og:description"]')).not.toBeNull();
		expect(document.querySelector('meta[property="og:image"]')).not.toBeNull();
		expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe(
			'summary_large_image'
		);
		expect(document.querySelector('meta[name="twitter:description"]')).not.toBeNull();
		expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
			`https://www.st0x.io/trade/${NVDA_WRAPPED}`
		);
	});

	it('does not inject trade metadata into nested or unrelated routes', () => {
		const html = '<html><head></head><body></body></html>';

		expect(injectTradeSeoHead(html, `/trade/${NVDA_WRAPPED}/proofs`)).toBe(html);
		expect(injectTradeSeoHead(html, '/markets/nvda')).toBe(html);
	});

	it('marks unknown trade IDs noindex without assigning a canonical URL', () => {
		const metadata = getTradeSeoMetadata('/trade/not-a-token');
		const html = injectTradeSeoHead(
			'<html><head></head><body></body></html>',
			'/trade/not-a-token'
		);

		expect(metadata?.canonicalUrl).toBeNull();
		expect(html).toContain(
			'<meta data-st0x-trade-robots name="robots" content="noindex, nofollow" />'
		);
		expect(html).not.toContain('rel="canonical"');
		expect(html).not.toContain('property="og:url"');
	});

	it('removes temporary server tags after the Svelte-managed head renders', () => {
		const root = document.createElement('div');
		root.innerHTML = injectTradeSeoHead(
			'<html><head></head><body></body></html>',
			`/trade/${NVDA_WRAPPED}`
		);

		expect(root.querySelectorAll('[data-st0x-trade-seo]').length).toBeGreaterThan(0);
		removeInjectedTradeSeoHead(root);
		expect(root.querySelector('[data-st0x-trade-seo]')).toBeNull();
	});

	it('removes unknown-trade noindex when SPA navigation leaves that route', () => {
		const document = new DOMParser().parseFromString(
			injectTradeSeoHead('<html><head></head><body></body></html>', '/trade/not-a-token'),
			'text/html'
		);

		removeInjectedTradeSeoHead(document);
		expect(document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe(
			'noindex, nofollow'
		);

		syncTradeRobotsMeta(document, '/markets/nvda');
		expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
	});
});
