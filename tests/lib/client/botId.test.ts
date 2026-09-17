import { beforeEach, describe, expect, it, vi } from 'vitest';

const initBotIdMock = vi.hoisted(() => vi.fn());

vi.mock('botid/client/core', () => ({
	initBotId: initBotIdMock
}));

vi.mock('$app/environment', () => ({
	dev: false
}));

describe('st0x BotID client protection', () => {
	beforeEach(() => {
		vi.resetModules();
		initBotIdMock.mockClear();
	});

	it('protects anonymous GET and POST proxy requests once', async () => {
		const { initSt0xBotProtection } = await import('../../../src/lib/client/botId');

		initSt0xBotProtection();
		initSt0xBotProtection();

		expect(initBotIdMock).toHaveBeenCalledTimes(1);
		expect(initBotIdMock).toHaveBeenCalledWith({
			protect: [
				{ path: '/api/st0x/*', method: 'GET' },
				{ path: '/api/st0x/*', method: 'POST' }
			]
		});
	});
});
