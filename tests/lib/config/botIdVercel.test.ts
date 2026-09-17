import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BOT_ID_PREFIX = '/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3';

describe('Vercel BotID routing', () => {
	it('proxies the challenge assets and preserves the snapshot cron', () => {
		const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
			rewrites?: Array<{ source: string; destination: string }>;
			headers?: Array<{
				source: string;
				headers: Array<{ key: string; value: string }>;
			}>;
			crons?: Array<{ path: string; schedule: string }>;
		};

		expect(config.rewrites).toEqual(
			expect.arrayContaining([
				{
					source: `${BOT_ID_PREFIX}/a-4-a/c.js`,
					destination: 'https://api.vercel.com/bot-protection/v1/challenge'
				},
				{
					source: `${BOT_ID_PREFIX}/:path*`,
					destination: 'https://api.vercel.com/bot-protection/v1/proxy/:path*'
				}
			])
		);
		expect(config.headers).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					source: `${BOT_ID_PREFIX}/:path*`,
					headers: expect.arrayContaining([{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }])
				})
			])
		);
		expect(config.crons).toContainEqual({
			path: '/api/cron/snapshots',
			schedule: '1 0 * * *'
		});
	});
});
