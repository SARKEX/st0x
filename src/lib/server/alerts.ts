/**
 * Telegram bot poster for chain-exhausted RPC alerts (OBS-04 / D-09 + D-17).
 *
 * - Fire-and-forget with 3s timeout (AbortSignal.timeout).
 * - Fail-closed (mild): if either OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN or
 *   OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID is missing in production, logs an error
 *   via pino and skips. Does NOT throw at module load (cold-start safe).
 *   This is the milder form of the CRON_SECRET pattern — alerts are best-effort,
 *   not gating like the cron auth check.
 * - Length-caps each `status_or_error` to ~512 chars before embedding (V5 ASVS —
 *   prevent log spam from attacker-controlled error messages). Total Telegram
 *   sendMessage cap is 4096 chars; 8 RPCs × 512 chars stays well within budget.
 * - Uses plain text (no parse_mode) to avoid Telegram MarkdownV2 escape pitfalls
 *   with `_` in UUIDs and other reserved characters in error strings.
 *
 * D-17 (2026-04-29) supersedes the original D-09 transport choice (Slack incoming
 * webhook). Function signature is unchanged so callers in rpcMetrics.ts are
 * unaffected.
 */

import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { getLogger } from '$lib/server/logger';
import type { ChainExhaustedDetails } from './rpcMetrics';

const ERROR_TEXT_CAP = 512;

interface TelegramConfig {
	botToken: string;
	chatId: string;
}

function getTelegramConfig(): TelegramConfig | null {
	const botToken = env.OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN;
	const chatId = env.OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID;
	if (!botToken || !chatId) {
		if (!dev) {
			getLogger().error(
				'[alerts] OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN or OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID not configured in production — alerts disabled'
			);
		}
		return null;
	}
	return { botToken, chatId };
}

function cap(s: string): string {
	return s.length > ERROR_TEXT_CAP ? `${s.slice(0, ERROR_TEXT_CAP)}…[truncated]` : s;
}

export async function notifyChainExhausted(
	payload: ChainExhaustedDetails & { request_id: string }
): Promise<void> {
	const cfg = getTelegramConfig();
	if (!cfg) return;

	const text =
		`🚨 st0x RPC chain exhausted — ${payload.fn}\n` +
		payload.attempts
			.map((a, i) => `  ${i + 1}. ${a.rpc_url} → ${cap(a.status_or_error)}`)
			.join('\n') +
		`\nrequest_id: ${payload.request_id}`;

	const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;

	try {
		await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: cfg.chatId, text }),
			signal: AbortSignal.timeout(3000)
		});
	} catch (err) {
		// Logged by caller (rpcMetrics.reportChainExhausted) so the alert-delivery-failure
		// shows up next to the chain-exhausted log line. Rethrow so caller can record it.
		throw err;
	}
}
