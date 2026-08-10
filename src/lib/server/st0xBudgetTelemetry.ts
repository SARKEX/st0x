import { getLogger } from '$lib/server/logger';
import type { St0xCredentialLabel } from '$lib/types/st0x';

/**
 * Record the upstream budget headers without logging credential material.
 * Successful responses without budget headers stay quiet.
 */
export function logSt0xRequestBudget(
	endpoint: string,
	credentialLabel: St0xCredentialLabel,
	response: Response
): void {
	const remaining = response.headers.get('X-RateLimit-Remaining');
	const reset = response.headers.get('X-RateLimit-Reset');
	if (!remaining && !reset && response.status !== 429) return;

	const fields = {
		event: 'st0x_request_budget',
		upstream_endpoint: endpoint,
		credential_label: credentialLabel,
		status: response.status,
		remaining,
		reset
	};
	if (response.status === 429) {
		getLogger().warn(fields, 'st0x request budget exhausted');
	} else {
		getLogger().info(fields, 'st0x request budget');
	}
}
