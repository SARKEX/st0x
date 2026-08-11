import { getTokenByAnyAddress } from '$lib/config/tokens';

const SITE_URL = 'https://www.st0x.io';
const OG_IMAGE = `${SITE_URL}/og-image.png`;

export interface TradeSeoMetadata {
	title: string;
	description: string;
	canonicalUrl: string | null;
}

export function buildTradeTitle(displayName: string): string {
	return `Trade ${displayName} | ST0x`;
}

export function buildTradeDescription(displayName: string): string {
	return `Trade ${displayName} 24/7 on ST0x with on-chain execution and non-custodial settlement on supported networks.`;
}

export function getTradeSeoMetadata(pathname: string): TradeSeoMetadata | null {
	const match = pathname.match(/^\/trade\/([^/]+)\/?$/);
	if (!match) return null;

	let tokenId: string;
	try {
		tokenId = decodeURIComponent(match[1]);
	} catch {
		tokenId = match[1];
	}

	const token = getTokenByAnyAddress(tokenId);
	const displayName = token?.name ?? 'Tokenized Assets';
	const canonicalPath = token ? `/trade/${token.address}` : `/trade/${encodeURIComponent(tokenId)}`;

	return {
		title: buildTradeTitle(displayName),
		description: buildTradeDescription(displayName),
		canonicalUrl: token ? `${SITE_URL}${canonicalPath}` : null
	};
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export function renderTradeSeoHead(metadata: TradeSeoMetadata): string {
	const title = escapeHtml(metadata.title);
	const description = escapeHtml(metadata.description);
	const tag = (value: string) => value.replace(/^<([a-z]+)/, '<$1 data-st0x-trade-seo');
	const tags = [
		tag(`<title>${title}</title>`),
		tag(`<meta name="description" content="${description}" />`),
		tag('<meta property="og:type" content="website" />'),
		tag('<meta property="og:site_name" content="ST0x" />'),
		tag(`<meta property="og:title" content="${title}" />`),
		tag(`<meta property="og:description" content="${description}" />`),
		tag(`<meta property="og:image" content="${OG_IMAGE}" />`),
		tag('<meta name="twitter:card" content="summary_large_image" />'),
		tag('<meta name="twitter:site" content="@st0x_io" />'),
		tag(`<meta name="twitter:title" content="${title}" />`),
		tag(`<meta name="twitter:description" content="${description}" />`),
		tag(`<meta name="twitter:image" content="${OG_IMAGE}" />`)
	];

	if (metadata.canonicalUrl) {
		const canonicalUrl = escapeHtml(metadata.canonicalUrl);
		tags.splice(2, 0, tag(`<link rel="canonical" href="${canonicalUrl}" />`));
		tags.splice(5, 0, tag(`<meta property="og:url" content="${canonicalUrl}" />`));
	} else {
		// Unknown IDs still resolve to the client shell. Keep them out of search
		// indexes without assigning arbitrary URLs a self-referencing canonical.
		tags.splice(2, 0, '<meta data-st0x-trade-robots name="robots" content="noindex, nofollow" />');
	}

	return tags.join('\n\t\t');
}

export function injectTradeSeoHead(html: string, pathname: string): string {
	const metadata = getTradeSeoMetadata(pathname);
	if (!metadata || !html.includes('</head>')) return html;

	return html.replace('</head>', `\t\t${renderTradeSeoHead(metadata)}\n\t</head>`);
}

/** Remove server-only shell metadata after Svelte has rendered its managed head. */
export function removeInjectedTradeSeoHead(root: ParentNode): void {
	root.querySelectorAll('[data-st0x-trade-seo]').forEach((node) => node.remove());
}

/** Keep unknown-trade noindex state scoped to the current SPA route. */
export function syncTradeRobotsMeta(document: Document, pathname: string): void {
	const robots = document.head.querySelector<HTMLMetaElement>('meta[data-st0x-trade-robots]');
	const metadata = getTradeSeoMetadata(pathname);
	const shouldNoindex = metadata !== null && metadata.canonicalUrl === null;

	if (!shouldNoindex) {
		robots?.remove();
		return;
	}

	if (!robots) {
		const meta = document.createElement('meta');
		meta.dataset.st0xTradeRobots = '';
		meta.name = 'robots';
		meta.content = 'noindex, nofollow';
		document.head.append(meta);
	}
}
