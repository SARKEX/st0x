import type { Token } from 'sushi';

export interface Sft {
	name: string;
	symbol: string;
	address: string;
}

export interface ApiStockQuote {
	'Global Quote': {
		'01. symbol': string;
		'02. open': string;
		'03. high': string;
		'04. low': string;
		'05. price': string;
		'06. volume': string;
		'07. latest trading day': string;
		'08. previous close': string;
		'09. change': string;
		'10. change percent': string;
	};
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
