import type { UserFacingTradeError } from '$lib/services/tradeError';

/**
 * A no-data quote failure is the blocking failure for the current trade
 * context, so it takes precedence over an older execution failure.
 */
export function selectVisibleTradeError(
	...errors: Array<UserFacingTradeError | null>
): UserFacingTradeError | null {
	return errors.find((error): error is UserFacingTradeError => error !== null) ?? null;
}

/** Build analytics fields from the value created in the current call stack. */
export function toTradeFailureAnalytics(error: UserFacingTradeError) {
	return {
		error: error.message,
		error_code: error.code,
		request_id: error.requestId
	};
}
