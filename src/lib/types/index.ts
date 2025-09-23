import type { Token } from 'sushi/currency';

export interface Sft {
	name: string;
	symbol: string;
	address: string;
}

export interface PythToken extends Token {
	priceFeedId: string;
}

export enum FetchStatus {
	FETCHING = 'Fetching file type from IPFS...',
	FETCHED = 'File type:',
	ERROR = 'Failed to fetch from IPFS'
}

type FetchFileSuccessResponse = {
	data: string | number[];
	contentType: string;
	fetchStatus: FetchStatus;
	success?: true;
};

type FetchFileErrorResponse = {
	fetchError: string;
	contentType: string;
	data: string | number[];
	fetchStatus: FetchStatus;
	success?: false;
};

export type FetchFileResponse = FetchFileSuccessResponse | FetchFileErrorResponse;
