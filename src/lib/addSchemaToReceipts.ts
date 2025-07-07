import { MAGIC_NUMBERS } from './consts';
import { cborDecode, bytesToMeta } from './helpers';
import type {
	OffchainAssetReceiptVault,
	ReceiptVaultInformation
} from './types/OffchainAssetReceiptVault';

export const addSchemaToReceipts = (vault: OffchainAssetReceiptVault) => {
	let tempSchema: { displayName: string; hash: string }[] = [];

	const receiptVaultInformations = vault.receiptVaultInformations;

	if (receiptVaultInformations.length) {
		receiptVaultInformations.map(async (data) => {
			const cborDecodedInformation = cborDecode(data.information.slice(18));
			if (cborDecodedInformation && cborDecodedInformation[0]?.get(1) === MAGIC_NUMBERS.OA_SCHEMA) {
				const schemaHash = cborDecodedInformation[1].get(0);
				if (schemaHash && !schemaHash.includes(',')) {
					const structure = bytesToMeta(cborDecodedInformation[0].get(0), 'json');

					tempSchema = [
						...tempSchema,
						{
							...structure,
							displayName: structure.displayName,
							timestamp: receiptVaultInformations[0].timestamp,
							id: receiptVaultInformations[0].id,
							hash: schemaHash
						}
					];
					tempSchema = tempSchema.filter(
						(d: { displayName?: string; hash?: string }) => d.displayName && d.hash
					);
					return tempSchema;
				}
			}
		});
	}
	return tempSchema;
};

if (import.meta.vitest) {
	const { it, expect, vi } = import.meta.vitest;

	vi.mock('$lib/scripts/helpers', async (importOriginal) => {
		return {
			...((await importOriginal()) as object),
			cborDecode: vi.fn(),
			bytesToMeta: vi.fn()
		};
	});

	const mockVault: OffchainAssetReceiptVault = {
		address: '0x123',
		symbol: 'TST',
		totalShares: '',
		withdraws: [],
		deposits: [],
		tokenHolders: [],
		certifications: [],
		rolesGranted: [],
		roleRevokes: [],
		receiptVaultInformations: [
			{
				information:
					'0xff0a89c674ee7874a4005841789cab56ca482cce50b2520acc4d290df0f035f34e4df4c90f288c348c2ac90d8c74b1f04d35cf4f2b4a7573f7720e0c74f10d4c8bcac80e4d54aa0500244c1305011bff8cd2927c8c86cb02706170706c69636174696f6e2f6a736f6e03676465666c617465a200782e516d647550484d364b65614c6f507159315a746d515944384d65376f66726546474a435151444d51665a686b5561011bff9fae3cc645f463',
				timestamp: '1620000000',
				id: '1'
			}
		] as unknown as ReceiptVaultInformation
	} as unknown as OffchainAssetReceiptVault;

	it('should add schema to receipts', () => {
		vi.resetAllMocks();
		const expectedSchema = [
			{
				displayName: 'Test Schema',
				timestamp: '1620000000',
				id: '1',
				hash: 'abcdef'
			}
		];

		vi.mocked(cborDecode).mockReturnValue([
			new Map([
				[1, MAGIC_NUMBERS.OA_SCHEMA],
				[0, 'Test Schema']
			]),
			new Map([[0, 'abcdef']])
		]);

		vi.mocked(bytesToMeta).mockReturnValue({
			displayName: 'Test Schema'
		});

		const result = addSchemaToReceipts(mockVault);
		expect(result).toEqual(expectedSchema);
	});

	it('should return empty array if no receiptVaultInformations', () => {
		vi.resetAllMocks();

		const emptyVault: OffchainAssetReceiptVault = {
			address: '0x123',
			symbol: 'TST',
			totalShares: '',
			withdraws: [],
			deposits: [],
			tokenHolders: [],
			certifications: [],
			rolesGranted: [],
			roleRevokes: [],
			receiptVaultInformations: []
		} as unknown as OffchainAssetReceiptVault;

		const result = addSchemaToReceipts(emptyVault);
		expect(result).toEqual([]);
	});

	it('should return empty array if no valid schema is found', () => {
		vi.resetAllMocks();

		const mockVaultWithInvalidSchema: OffchainAssetReceiptVault = {
			address: '0x123',
			symbol: 'TST',
			totalShares: '',
			withdraws: [],
			deposits: [],
			tokenHolders: [],
			certifications: [],
			rolesGranted: [],
			roleRevokes: [],
			receiptVaultInformations: [
				{
					information: '0x',
					timestamp: '1630000000',
					id: '1'
				}
			] as unknown as ReceiptVaultInformation
		} as unknown as OffchainAssetReceiptVault;

		const result = addSchemaToReceipts(mockVaultWithInvalidSchema);
		expect(result).toEqual([]);
	});
}
