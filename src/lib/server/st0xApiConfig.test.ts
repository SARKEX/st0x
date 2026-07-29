import { describe, expect, it } from 'vitest';
import { getSt0xActivityApiConfig, getSt0xPricesApiConfig } from '$lib/server/st0xApiConfig';

describe('getSt0xPricesApiConfig', () => {
	it('prefers the dedicated price credential', () => {
		expect(
			getSt0xPricesApiConfig({
				ST0X_API_URL: 'https://api.example.test/',
				ST0X_API_KEY: 'general-key',
				ST0X_API_SECRET: 'general-secret',
				ST0X_PRICES_API_KEY: 'prices-key',
				ST0X_PRICES_API_SECRET: 'prices-secret'
			})
		).toEqual({
			apiBase: 'https://api.example.test',
			authHeader: 'Basic cHJpY2VzLWtleTpwcmljZXMtc2VjcmV0',
			credentialLabel: 'prices'
		});
	});

	it('falls back to the general credential during deployment rollout', () => {
		expect(
			getSt0xPricesApiConfig({
				ST0X_API_URL: 'https://api.example.test',
				ST0X_API_KEY: 'general-key',
				ST0X_API_SECRET: 'general-secret'
			})
		).toMatchObject({ credentialLabel: 'general' });
	});

	it('rejects a partially configured dedicated credential pair', () => {
		expect(
			getSt0xPricesApiConfig({
				ST0X_API_URL: 'https://api.example.test',
				ST0X_API_KEY: 'general-key',
				ST0X_API_SECRET: 'general-secret',
				ST0X_PRICES_API_KEY: 'prices-key'
			})
		).toBeNull();
	});
});

describe('getSt0xActivityApiConfig', () => {
	it('prefers the dedicated activity credential', () => {
		expect(
			getSt0xActivityApiConfig({
				ST0X_API_URL: 'https://api.example.test/',
				ST0X_API_KEY: 'general-key',
				ST0X_API_SECRET: 'general-secret',
				ST0X_ACTIVITY_API_KEY: 'activity-key',
				ST0X_ACTIVITY_API_SECRET: 'activity-secret'
			})
		).toEqual({
			apiBase: 'https://api.example.test',
			authHeader: 'Basic YWN0aXZpdHkta2V5OmFjdGl2aXR5LXNlY3JldA==',
			credentialLabel: 'activity'
		});
	});

	it('falls back to the general credential only when both activity values are absent', () => {
		expect(
			getSt0xActivityApiConfig({
				ST0X_API_URL: 'https://api.example.test',
				ST0X_API_KEY: 'general-key',
				ST0X_API_SECRET: 'general-secret'
			})
		).toMatchObject({ credentialLabel: 'general' });
	});

	it('rejects a partially configured activity credential pair', () => {
		expect(
			getSt0xActivityApiConfig({
				ST0X_API_URL: 'https://api.example.test',
				ST0X_API_KEY: 'general-key',
				ST0X_API_SECRET: 'general-secret',
				ST0X_ACTIVITY_API_SECRET: 'activity-secret'
			})
		).toBeNull();
	});
});
