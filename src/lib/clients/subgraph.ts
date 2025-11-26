import { fetchJson } from '$lib/clients/http';

export type GraphqlVariables = Record<string, unknown>;

export interface GraphqlResponse<T> {
	data?: T;
	errors?: Array<{ message?: string }>;
}

export async function executeGraphql<T>(
	endpoint: string,
	query: string,
	variables: GraphqlVariables = {}
): Promise<T> {
	const body = JSON.stringify({ query, variables });

	const response = await fetchJson<GraphqlResponse<T>>(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body
	});

	if (response.errors?.length) {
		const message = response.errors
			.map((e) => e.message)
			.filter(Boolean)
			.join('; ');
		throw new Error(message || 'GraphQL error');
	}

	if (!response.data) {
		throw new Error('GraphQL response missing data');
	}

	return response.data;
}

/**
 * Generic helper to page through subgraph queries that support skip/first.
 */
export async function fetchAllPaginated<T extends { [key: string]: unknown }>(
	endpoint: string,
	query: string,
	variables: GraphqlVariables,
	itemsKey: string,
	first = 1000
): Promise<unknown[]> {
	const allItems: unknown[] = [];
	let skip = 0;
	let hasMore = true;

	while (hasMore) {
		const pageVars = { ...variables, skip, first };
		const data = await executeGraphql<T>(endpoint, query, pageVars);
		const items = (data as Record<string, unknown>)[itemsKey];
		const list = Array.isArray(items) ? (items as unknown[]) : [];
		allItems.push(...list);

		if (list.length < first) {
			hasMore = false;
		}
		skip += first;
	}

	return allItems;
}
