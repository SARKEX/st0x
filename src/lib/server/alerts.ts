/**
 * Slack incoming-webhook poster for chain-exhausted RPC alerts (OBS-04 / D-09).
 *
 * - Fire-and-forget with 3s timeout (AbortSignal.timeout).
 * - Fail-closed (mild): if OBSERVABILITY_ALERT_WEBHOOK_URL is missing in production,
 *   logs an error via pino and skips. Does NOT throw at module load (cold-start safe).
 *   This is the milder form of the CRON_SECRET pattern — alerts are best-effort, not
 *   gating like the cron auth check.
 * - Length-caps each `status_or_error` to ~512 chars before embedding in Slack `text`
 *   (V5 ASVS — prevent log spam from attacker-controlled error messages).
 * - Slack incoming webhooks accept plain `{text: '...'}` JSON; no Block Kit needed at
 *   solo-team scale.
 */

import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { getLogger } from '$lib/server/logger';
import type { ChainExhaustedDetails } from './rpcMetrics';

const ERROR_TEXT_CAP = 512;

function getWebhookUrl(): string | null {
	const url = env.OBSERVABILITY_ALERT_WEBHOOK_URL;
	if (!url) {
		if (!dev) {
			getLogger().error(
				'[alerts] OBSERVABILITY_ALERT_WEBHOOK_URL not configured in production — alerts disabled'
			);
		}
		return null;
	}
	return url;
}

function cap(s: string): string {
	return s.length > ERROR_TEXT_CAP ? `${s.slice(0, ERROR_TEXT_CAP)}…[truncated]` : s;
}

export async function notifyChainExhausted(
	payload: ChainExhaustedDetails & { request_id: string }
): Promise<void> {
	const url = getWebhookUrl();
	if (!url) return;

	const text =
		`:rotating_light: *st0x RPC chain exhausted* — \`${payload.fn}\`\n` +
		payload.attempts
			.map((a, i) => `  ${i + 1}. \`${a.rpc_url}\` → ${cap(a.status_or_error)}`)
			.join('\n') +
		`\nrequest_id: \`${payload.request_id}\``;

	try {
		await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text }),
			signal: AbortSignal.timeout(3000)
		});
	} catch (err) {
		// Logged by caller (rpcMetrics.reportChainExhausted) so the alert-delivery-failure
		// shows up next to the chain-exhausted log line. Rethrow so caller can record it.
		throw err;
	}
}
