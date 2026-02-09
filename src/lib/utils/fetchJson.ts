export interface FetchJsonResult<T> {
	ok: boolean;
	status: number;
	data: T | null;
	error?: string;
}

function getErrorFromPayload(payload: unknown): string | undefined {
	if (!payload || typeof payload !== 'object') return undefined;
	const value = (payload as Record<string, unknown>).error;
	return typeof value === 'string' ? value : undefined;
}

export async function fetchJson<T>(
	input: RequestInfo | URL,
	init?: RequestInit,
	timeoutMs: number = 15000
): Promise<FetchJsonResult<T>> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(input, { ...init, signal: controller.signal });
		let data: T | null = null;

		try {
			data = (await response.json()) as T;
		} catch {
			data = null;
		}

		return {
			ok: response.ok,
			status: response.status,
			data,
			error: getErrorFromPayload(data)
		};
	} catch (error) {
		if (
			(error instanceof DOMException && error.name === 'AbortError') ||
			(error instanceof Error && error.name === 'AbortError')
		) {
			return { ok: false, status: 0, data: null, error: 'Request timed out' };
		}
		return { ok: false, status: 0, data: null, error: 'Network error' };
	} finally {
		clearTimeout(timeout);
	}
}
