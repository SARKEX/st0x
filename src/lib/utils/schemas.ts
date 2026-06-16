import { MAGIC_NUMBERS } from '$lib/config/constants';
import { cborDecode, bytesToMeta } from '$lib/utils/helpers';
import type {
	OffchainAssetReceiptVault,
	ReceiptVaultInformation
} from '$lib/types/OffchainAssetReceiptVault';

type RawReceiptVaultInformation = Pick<ReceiptVaultInformation, 'id' | 'information'> & {
	timestamp: string | number;
};

export const addSchemaToReceiptVaultInformations = (
	receiptVaultInformations: RawReceiptVaultInformation[]
) => {
	const tempSchema: { displayName: string; hash: string }[] = [];

	if (receiptVaultInformations.length) {
		for (const data of receiptVaultInformations) {
			const cborDecodedInformation = cborDecode(data.information.slice(18));
			if (cborDecodedInformation && cborDecodedInformation[0]?.get(1) === MAGIC_NUMBERS.OA_SCHEMA) {
				const schemaHash = cborDecodedInformation[1].get(0);
				if (schemaHash && !schemaHash.includes(',')) {
					const structure = bytesToMeta(cborDecodedInformation[0].get(0), 'json');

					tempSchema.push({
						...structure,
						displayName: structure.displayName,
						timestamp: receiptVaultInformations[0].timestamp,
						id: receiptVaultInformations[0].id,
						hash: schemaHash
					});
				}
			}
		}
		return tempSchema.filter(
			(d: { displayName?: string; hash?: string }) => d.displayName && d.hash
		);
	}
	return tempSchema;
};

export const addSchemaToReceipts = (vault: OffchainAssetReceiptVault) =>
	addSchemaToReceiptVaultInformations(vault.receiptVaultInformations);
