import { createClient } from 'redis';
import type { VercelKV } from '@vercel/kv';

// Local Redis client for development
const redis = createClient({
	url: process.env.LOCAL_REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', err => console.log('Redis Client Error', err));

// Mock Vercel KV interface for local development
export const kvLocal: Partial<VercelKV> = {
	async get<T>(key: string): Promise<T | null> {
		if (!redis.isOpen) await redis.connect();
		const value = await redis.get(key);
		return value ? JSON.parse(value) : null;
	},
	
	async set(key: string, value: any, options?: { ex?: number }): Promise<string> {
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
	
	async lpush(key: string, ...values: any[]): Promise<number> {
		if (!redis.isOpen) await redis.connect();
		const stringValues = values.map(v => JSON.stringify(v));
		return await redis.lPush(key, stringValues);
	},
	
	async lrange(key: string, start: number, stop: number): Promise<string[]> {
		if (!redis.isOpen) await redis.connect();
		return await redis.lRange(key, start, stop);
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