import type { RequestHandler } from '@sveltejs/kit';
import { pinata } from '$lib/server/pinata';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { data } = await request.json();
		const formData = new FormData();
		formData.append('file', data);

		try {
			const upload = await pinata.upload.json(formData);

			return json(
				{
					data: {
						...upload
					},
					success: true
				},
				{ status: 200 }
			);
		} catch (error) {
			return json({ error: 'Failed to upload file to IPFS' }, { status: 500 });
		}
	} catch (error) {
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
