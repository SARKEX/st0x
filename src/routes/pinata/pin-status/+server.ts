import { json, type RequestHandler } from '@sveltejs/kit';
import { PRIVATE_PINATA_JWT } from '$env/static/private';
const PINATA_PIN_LIST_URL = 'https://api.pinata.cloud/data/pinList';

export const POST: RequestHandler = async ({ request }) => {
	const { cid } = await request.json();

	if (!cid) {
		return json({ error: 'CID is required' }, { status: 400 });
	}

	try {
		const res = await fetch(`${PINATA_PIN_LIST_URL}?hashContains=${cid}`, {
			headers: {
				Authorization: `Bearer ${PRIVATE_PINATA_JWT}`
			}
		});

		if (!res.ok) {
			const errorData = await res.json();
			return json(
				{ error: 'Failed to fetch pin status', details: errorData },
				{ status: res.status }
			);
		}

		const data = await res.json();
		const pinStatus = data.rows[0];

		if (!pinStatus) {
			return json({ error: `No pin status found for CID: ${cid}` }, { status: 404 });
		} else {
			return json({
				status: 200,
				message: `File with CID: ${cid} is pinned.`,
				pinStatus
			});
		}
	} catch (error) {
		return json(
			// @ts-expect-error - error.message is not defined
			{ error: 'An error occurred while fetching pin status', details: error.message },
			{ status: 500 }
		);
	}
};
