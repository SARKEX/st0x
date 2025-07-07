import type { RequestHandler } from '@sveltejs/kit';
import { pinata } from '$lib/server/pinata';

import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();
		// @ts-expect-error - 'get' does not exist on type 'FormData'
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
		} catch {
			return json(
				{
					error: true,
					message: 'Failed to upload file to IPFS'
				},
				{ status: 500 }
			);
		}
	} catch {
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
