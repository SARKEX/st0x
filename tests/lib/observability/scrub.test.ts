import { describe, it, expect } from 'vitest';
import { scrubSentryEvent } from '$lib/observability/scrub';

describe('scrubSentryEvent', () => {
	it('redacts a 40-hex wallet address from a string field', () => {
		const event = { message: 'Failure for 0xabcdef0123456789abcdef0123456789abcdef01' };
		const out = scrubSentryEvent(event as never) as { message: string };
		expect(out.message).toBe('Failure for [REDACTED_ADDR]');
	});

	it('redacts a 130-hex signature from a string field', () => {
		const sig = '0x' + 'a'.repeat(130);
		const event = { extra: { signature: sig } };
		const out = scrubSentryEvent(event as never) as { extra: { signature: string } };
		expect(out.extra.signature).toBe('[REDACTED_SIGNATURE]');
	});

	it('strips ?signature=... query params (URL form)', () => {
		const event = {
			breadcrumbs: [{ data: { url: 'https://x.io/foo?signature=0xabc&keep=1' } }]
		};
		const out = scrubSentryEvent(event as never) as {
			breadcrumbs: { data: { url: string } }[];
		};
		expect(out.breadcrumbs[0].data.url).toBe('https://x.io/foo?signature=[REDACTED]&keep=1');
	});

	it('walks nested objects + arrays (recursive)', () => {
		const addr = '0x' + 'b'.repeat(40);
		const event = {
			exception: { values: [{ stacktrace: { frames: [{ vars: { who: addr } }] } }] }
		};
		const out = scrubSentryEvent(event as never) as {
			exception: { values: { stacktrace: { frames: { vars: { who: string } }[] } }[] };
		};
		expect(out.exception.values[0].stacktrace.frames[0].vars.who).toBe('[REDACTED_ADDR]');
	});

	it('leaves non-PII strings + non-string types unchanged', () => {
		const event = { count: 7, ok: true, msg: 'all good', nested: null };
		const out = scrubSentryEvent(event as never);
		expect(out).toEqual(event);
	});
});
