import { FetchStatus, type FetchFileResponse } from '$lib/types';

export const fetchIpfsFile = async (cid: string): Promise<FetchFileResponse> => {
	let fetchStatus = FetchStatus.FETCHING;
	let contentType = '';
	let fetchError = '';
	let data = '';

	try {
		const response = await fetch('/pinata/retrieve/', {
			method: 'POST',
			body: JSON.stringify({ cid })
		});

		if (!response.ok) {
			fetchStatus = FetchStatus.ERROR;
			fetchError = 'Error getting file from IPFS';
			return { contentType, fetchStatus, data, fetchError };
		}

		const responseJson = await response.json();

		contentType = responseJson.contentType;
		if (contentType.startsWith('text/plain') || contentType.startsWith('text/csv')) {
			data = responseJson.data;
		} else {
			const byteArray = new Uint8Array(responseJson.data);
			const blob = new Blob([byteArray], { type: contentType });
			data = URL.createObjectURL(blob);
		}

		fetchStatus = FetchStatus.FETCHED;
		return { contentType, fetchStatus, data };
	} catch (error) {
		fetchStatus = FetchStatus.ERROR;
		fetchError = 'Error fetching file';
		return { contentType, fetchStatus, data, fetchError };
	}
};
