import { createClient } from 'redis';
import type { VercelKV } from '@vercel/kv';

// Local Redis client for development
const redis = createClient({
	url: process.env.LOCAL_REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => console.log('Redis Client Error', err));

// Mock Vercel KV interface for local development
const impl = {
	async get<T>(key: string): Promise<T | null> {
		if (!redis.isOpen) await redis.connect();
		const value = await redis.get(key);
		return value ? JSON.parse(value) : null;
	},

	async set<T>(key: string, value: T, options?: { ex?: number }): Promise<'OK'> {
		if (!redis.isOpen) await redis.connect();
		const stringValue = JSON.stringify(value);
		if (options?.ex) {
			await redis.setEx(key, options.ex, stringValue);
		} else {
			await redis.set(key, stringValue);
		}
		return 'OK';
	},

	async incr(key: string): Promise<number> {
		if (!redis.isOpen) await redis.connect();
		return await redis.incr(key);
	},

	async lpush<T>(key: string, ...values: T[]): Promise<number> {
		if (!redis.isOpen) await redis.connect();
		const stringValues = values.map((v) => JSON.stringify(v));
		return await redis.lPush(key, stringValues);
	},

	async lrange(key: string, start: number, stop: number): Promise<unknown[]> {
		if (!redis.isOpen) await redis.connect();
		const values = await redis.lRange(key, start, stop);
		// Parse JSON strings to match Vercel KV behavior
		return values.map((v) => {
			try {
				return JSON.parse(v);
			} catch {
				return v;
			}
		});
	},

	async ltrim(key: string, start: number, stop: number): Promise<string> {
		if (!redis.isOpen) await redis.connect();
		await redis.lTrim(key, start, stop);
		return 'OK';
	},

	async keys(pattern: string): Promise<string[]> {
		if (!redis.isOpen) await redis.connect();
		return await redis.keys(pattern);
	}
};

export const kvLocal = impl as unknown as VercelKV;
