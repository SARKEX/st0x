export const getPinStatus = async (cid: string) => {
	if (!cid) {
		throw new Error('CID is required');
	}

	try {
		const response = await fetch('/pinata/pin-status', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ cid })
		});

		let pinataResult = await response.json();

		const ipfsResponse = await fetch(`https://cid.contact/cid/${cid}`);
		const ipfsResult = await ipfsResponse.json();

		if (!ipfsResult?.error) {
			pinataResult = {
				...pinataResult,
				pinStatus: {
					...pinataResult.pinStatus,
					totalPins: ipfsResult?.MultihashResults?.length
				}
			};
		}

		return pinataResult;
	} catch (error) {
		throw new Error(`An error occurred while fetching pin status: ${error.message}`);
	}
};
