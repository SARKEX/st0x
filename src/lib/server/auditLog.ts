/**
 * Audit logging for sensitive operations.
 * Logs are stored in Redis with a TTL for compliance and debugging.
 */

import { getKv } from './kv';
import { getClientIp } from './rateLimit';

// Audit event types
export type AuditEventType =
	| 'WALLET_REGISTRATION'
	| 'ACCESS_CODE_CREATED'
	| 'ACCESS_CODE_DELETED'
	| 'ACCESS_CODE_UPDATED'
	| 'ADMIN_LOGIN'
	| 'ADMIN_LOGIN_FAILED'
	| 'SNAPSHOT_GENERATED'
	| 'REWARDS_POOL_UPDATED'
	| 'EXCLUDED_WALLET_ADDED'
	| 'EXCLUDED_WALLET_REMOVED'
	| 'TEAM_WALLET_ADDED'
	| 'TEAM_WALLET_REMOVED'
	| 'ONRAMPER_URL_SIGNED'
	| 'CRON_JOB_EXECUTED'
	| 'RATE_LIMIT_EXCEEDED'
	| 'ACCESS_DENIED';

export interface AuditLogEntry {
	id: string;
	timestamp: string;
	eventType: AuditEventType;
	ipAddress: string;
	userAgent?: string;
	walletAddress?: string;
	adminUser?: string;
	path: string;
	method: string;
	details: Record<string, unknown>;
	success: boolean;
	errorMessage?: string;
}

// Redis key for audit logs
const AUDIT_LOG_KEY = 'audit:logs';
const AUDIT_LOG_TTL_DAYS = 90; // Keep logs for 90 days

/**
 * Generate a unique ID for audit entries
 */
function generateAuditId(): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 8);
	return `audit_${timestamp}_${random}`;
}

/**
 * Log a sensitive operation for audit purposes.
 * This is fire-and-forget - failures are logged but don't block the main operation.
 */
export async function logAuditEvent(
	request: Request,
	eventType: AuditEventType,
	details: Record<string, unknown>,
	options: {
		walletAddress?: string;
		adminUser?: string;
		success?: boolean;
		errorMessage?: string;
	} = {}
): Promise<void> {
	try {
		const client = await getKv();
		if (!client) {
			// Fallback to console logging in dev
			console.log('[Audit]', {
				eventType,
				details,
				...options,
				timestamp: new Date().toISOString()
			});
			return;
		}

		const url = new URL(request.url);
		const entry: AuditLogEntry = {
			id: generateAuditId(),
			timestamp: new Date().toISOString(),
			eventType,
			ipAddress: getClientIp(request),
			userAgent: request.headers.get('user-agent') || undefined,
			walletAddress: options.walletAddress?.toLowerCase(),
			adminUser: options.adminUser,
			path: url.pathname,
			method: request.method,
			details,
			success: options.success ?? true,
			errorMessage: options.errorMessage
		};

		// Store in a Redis sorted set with timestamp as score for efficient range queries
		const score = Date.now();
		await client.zAdd(AUDIT_LOG_KEY, { score, value: JSON.stringify(entry) });

		// Clean up old entries (older than TTL)
		const cutoff = Date.now() - AUDIT_LOG_TTL_DAYS * 24 * 60 * 60 * 1000;
		await client.zRemRangeByScore(AUDIT_LOG_KEY, 0, cutoff);
	} catch (error) {
		// Don't let audit logging failures affect the main operation
		console.error('[Audit] Failed to log event:', error);
	}
}

/**
 * Helper function to create audit logger for a specific request.
 * Makes it easier to log multiple events from the same request.
 */
export function createAuditLogger(request: Request) {
	return {
		log: (
			eventType: AuditEventType,
			details: Record<string, unknown>,
			options?: {
				walletAddress?: string;
				adminUser?: string;
				success?: boolean;
				errorMessage?: string;
			}
		) => logAuditEvent(request, eventType, details, options),

		logSuccess: (
			eventType: AuditEventType,
			details: Record<string, unknown>,
			options?: { walletAddress?: string; adminUser?: string }
		) => logAuditEvent(request, eventType, details, { ...options, success: true }),

		logFailure: (
			eventType: AuditEventType,
			details: Record<string, unknown>,
			errorMessage: string,
			options?: { walletAddress?: string; adminUser?: string }
		) => logAuditEvent(request, eventType, details, { ...options, success: false, errorMessage })
	};
}

/**
 * Query audit logs (admin only).
 * Returns logs within a time range, optionally filtered.
 */
export async function queryAuditLogs(options: {
	startTime?: Date;
	endTime?: Date;
	eventType?: AuditEventType;
	walletAddress?: string;
	adminUser?: string;
	limit?: number;
}): Promise<AuditLogEntry[]> {
	const client = await getKv();
	if (!client) {
		return [];
	}

	const startScore = options.startTime?.getTime() ?? 0;
	const endScore = options.endTime?.getTime() ?? Date.now();
	const limit = options.limit ?? 100;

	try {
		// Get entries in reverse chronological order (most recent first)
		// Use zRange with BYSCORE and REV options
		const entries = await client.zRange(AUDIT_LOG_KEY, endScore, startScore, {
			BY: 'SCORE',
			REV: true,
			LIMIT: { offset: 0, count: limit * 2 } // Fetch extra to account for filtering
		});

		const logs: AuditLogEntry[] = [];

		for (const entry of entries) {
			if (logs.length >= limit) break;

			try {
				const parsed = JSON.parse(entry) as AuditLogEntry;

				// Apply filters
				if (options.eventType && parsed.eventType !== options.eventType) continue;
				if (options.walletAddress && parsed.walletAddress !== options.walletAddress.toLowerCase())
					continue;
				if (options.adminUser && parsed.adminUser !== options.adminUser) continue;

				logs.push(parsed);
			} catch {
				// Skip malformed entries
			}
		}

		return logs;
	} catch (error) {
		console.error('[Audit] Failed to query logs:', error);
		return [];
	}
}

/**
 * Get audit log statistics (admin only).
 */
export async function getAuditStats(): Promise<{
	totalEntries: number;
	entriesByType: Record<string, number>;
	recentFailures: number;
}> {
	const client = await getKv();
	if (!client) {
		return { totalEntries: 0, entriesByType: {}, recentFailures: 0 };
	}

	try {
		const totalEntries = await client.zCard(AUDIT_LOG_KEY);

		// Get last 24 hours of entries for stats
		const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
		const recentEntries = await client.zRangeByScore(AUDIT_LOG_KEY, oneDayAgo, Date.now());

		const entriesByType: Record<string, number> = {};
		let recentFailures = 0;

		for (const entry of recentEntries) {
			try {
				const parsed = JSON.parse(entry) as AuditLogEntry;
				entriesByType[parsed.eventType] = (entriesByType[parsed.eventType] ?? 0) + 1;
				if (!parsed.success) {
					recentFailures++;
				}
			} catch {
				// Skip malformed entries
			}
		}

		return { totalEntries, entriesByType, recentFailures };
	} catch (error) {
		console.error('[Audit] Failed to get stats:', error);
		return { totalEntries: 0, entriesByType: {}, recentFailures: 0 };
	}
}
