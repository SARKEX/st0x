import { pinata } from '$lib/server/pinata';
import { json, type RequestHandler } from '@sveltejs/kit';
import type { GetCIDResponse } from 'pinata-web3';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { cid } = await request.json();

		try {
			const res = await pinata.gateways.get(cid).then((res: GetCIDResponse) => res);

			const contentType = res.contentType;

			if (contentType?.startsWith('text/plain') || contentType?.startsWith('text/csv')) {
				return json(
					{
						data: res.data,
						contentType,
						message: 'File retrieved successfully'
					},
					{ status: 200 }
				);
			}
			if (res.data instanceof Blob) {
				const arrayBuffer = await res.data.arrayBuffer();

				const byteArray = Array.from(new Uint8Array(arrayBuffer));

				return json(
					{
						data: byteArray,
						contentType,
						message: 'Binary file retrieved successfully'
					},
					{ status: 200 }
				);
			}

			return json(
				{
					error: 'Unsupported Media Type',
					message: 'The content type is not supported for this operation.'
				},
				{ status: 415 }
			);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (err: any) {
			if (err.message && err.message.includes('Authentication Failed')) {
				return json(
					{
						error: 'Authentication Failed',
						message: 'This content is not available in the gateway.'
					},
					{ status: 403 }
				);
			}

			return json(
				{
					error: 'File not found',
					message: 'The content may not be pinned to the gateway.'
				},
				{ status: 404 }
			);
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} catch (err: any) {
		return json(
			{
				error: 'Bad Request',
				message: 'Invalid or malformed request.'
			},
			{ status: 400 }
		);
	}
};
