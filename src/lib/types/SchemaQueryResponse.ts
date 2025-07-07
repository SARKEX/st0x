export interface SchemaQueryResponse {
	displayName: string;
	hash: string;
	id: string;
	timestamp: string;
	schema: Schema;
	values?: SchemaValue[];
}
export interface VaultInfo {
	address: string;
	displayName: string;
	hash: string;
	id: string;
	timestamp: string;
	information: string;
}

export type SchemaProperty = {
	type: string;
	description?: string;
	enum?: string[];
	minimum?: number;
	maximum?: number;
	properties?: Record<string, SchemaProperty>;
	required?: string[];
};

export type Schema = {
	type: string;
	properties: {
		[key: string]: SchemaProperty;
	};
};

export interface SchemaValue {
	id: string;
	information: string;
	timestamp: string;
	displayName: string;
	hash: string;
	schema: Schema;
	offchainAssetReceiptVault: VaultInfo;
}

export interface SchemaInMetadataList {
	schemaHash: string;
	schemaName: string;
	totalMints: number;
	usedInVault: string;
	values: SchemaValue[];
}
