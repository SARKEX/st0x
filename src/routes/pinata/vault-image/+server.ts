import type { RequestHandler } from '@sveltejs/kit';
import { pinata } from '$lib/server/pinata';

import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();
		const uploadedFile = formData.get('file') as File;

		if (!uploadedFile || uploadedFile.size === 0) {
			return json(
				{
					error: true,
					message: 'You must provide a valid file to upload'
				},
				{ status: 400 }
			);
		}

		try {
			const uploadResponse = await pinata.upload.file(uploadedFile);

			return json(
				{
					data: {
						...uploadResponse,
						cid: uploadResponse.IpfsHash
					},
					success: true
				},
				{ status: 200 }
			);
		} catch (error) {
			return json(
				{
					error: true,
					message: 'Failed to upload file to IPFS'
				},
				{ status: 500 }
			);
		}
	} catch (error) {
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
