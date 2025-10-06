/* eslint-disable @typescript-eslint/no-explicit-any */
import { MAGIC_NUMBERS } from './consts';
import { ROLES } from './consts';
import pako from 'pako';
import { decodeAllSync, encodeCanonical } from 'cbor-web';
import { isBytesLike } from 'ethers';
import { arrayify } from '@ethersproject/bytes';

export function deflateJson(data_: string | pako.Data) {
	const bytes = Uint8Array.from(pako.deflate(data_));
	let hex = '0x';
	for (let i = 0; i < bytes.length; i++) {
		hex = hex + bytes[i].toString(16).padStart(2, '0');
	}
	return hex;
}

export function cborEncode(
	payload_: string | ArrayBuffer,
	magicNumber_: bigint,
	contentType_: string | null,
	options_: {
		contentEncoding: any;
		schema?: any;
		contentLanguage?: any;
	} | null
) {
	const m = new Map();
	m.set(0, payload_); // Payload
	m.set(1, magicNumber_); // Magic number
	if (contentType_) {
		m.set(2, contentType_); // Content-Type
	}

	if (options_) {
		if (options_.contentEncoding) {
			m.set(3, options_.contentEncoding); // Content-Encoding
		}

		if (options_.contentLanguage) {
			m.set(4, options_.contentLanguage); // Content-Language
		}

		if (options_.schema) {
			m.set(MAGIC_NUMBERS.OA_SCHEMA, options_.schema);
		}
	}
	return encodeCanonical(m).toString('hex').toLowerCase();
}

export function encodeCBORStructure(structure: string, schemaHash: string) {
	// -- Encoding with CBOR
	// Obtain (Deflated JSON) and parse it to an ArrayBuffer
	if (typeof structure === 'object') {
		structure = JSON.stringify(structure);
	}
	const deflatedData = arrayify(deflateJson(structure)).buffer as ArrayBuffer;
	return cborEncode(deflatedData, MAGIC_NUMBERS.OA_STRUCTURE, 'application/json', {
		contentEncoding: 'deflate',
		schema: schemaHash
	});
}

/**
 * Sorts an array based on a specified order.
 *
 * @param {Array<Object>} array - The array to be sorted.
 * @param {string[]} order - An array defining the desired order.
 * @param {string} key - The key in the objects used for sorting.
 * @returns {Array<Object>} - Sorted array.
 */
export function mapOrder<T extends Record<string, any>>(
	array: T[],
	order: string[],
	key: keyof T
): T[] {
	array.sort((a, b) => {
		const A = a[key],
			B = b[key];

		if (order.indexOf(A) > order.indexOf(B)) {
			return 1;
		} else {
			return -1;
		}
	});

	return array;
}

export function bytesToMeta(bytes: any, type: any) {
	if (isBytesLike(bytes)) {
		const _bytesArr = arrayify(bytes);
		let _meta;
		if (type === 'json') {
			_meta = pako.inflate(_bytesArr, { to: 'string' });
		} else {
			_meta = new TextDecoder().decode(bytes as any).slice(3);
		}
		let res;
		try {
			res = JSON.parse(_meta);
		} catch {
			res = _meta;
		}
		return res;
	} else throw new Error('invalid meta');
}

export function cborDecode(dataEncoded_: any) {
	return decodeAllSync(dataEncoded_);
}
function getDateValues(date: Date) {
	const d = new Date(date),
		year = d.getFullYear();

	let month = '' + (d.getMonth() + 1),
		day = '' + d.getDate(),
		min = '' + d.getMinutes(),
		hour = '' + d.getHours();

	if (month.length < 2) month = '0' + month;
	if (day.length < 2) day = '0' + day;
	if (min.length < 2) min = '0' + min;
	if (hour.length < 2) hour = '0' + hour;

	return { day, month, year, hour, min };
}

export function formatDate(date: Date) {
	const { year, month, day } = getDateValues(date);
	return [year, month, day].join('-');
}

export function convertDotNotationToObject(input: Record<string, any>): Record<string, any> {
	const result: Record<string, any> = {};

	for (const key of Object.keys(input)) {
		const value = input[key];
		const keyParts = key.split('.');

		let currentPart = result;
		for (let i = 0; i < keyParts.length; i++) {
			const part = keyParts[i];

			// If we're at the last part, assign the value
			if (i === keyParts.length - 1) {
				currentPart[part] = value;
				break;
			}

			// If the next part doesn't exist or isn't an object, create or overwrite it
			if (!currentPart[part] || typeof currentPart[part] !== 'object') {
				currentPart[part] = {};
			}

			// Move our reference down to the next part of the path
			currentPart = currentPart[part];
		}
	}

	return result;
}

import type { RoleHolder, Role } from './types/OffchainAssetReceiptVault';
export type { RoleHolder, Role };

interface MappedRole {
	roleName: string;
	roleDescription: string;
	readableName: string;
	roleHolders: RoleHolder[];
	adminRoleHolders: RoleHolder[];
	roleType: string;
	executorRoleHash: string;
	adminRoleHash: string;
}

const roleDescriptions = {
	DEPOSIT: {
		roleType: 'operator',
		readableName: 'Depositor',
		description:
			'Connects off-chain assets with on-chain tokens by minting NFTs and ERC20 tokens, requiring careful handling of audit data and asset details to ensure integrity and traceability.'
	},
	WITHDRAW: {
		roleType: 'operator',
		readableName: 'Withdrawer',
		description:
			'Disconnects off-chain assets by burning on-chain tokens, ensuring a 1:1 relationship between NFTs and ERC20 tokens to maintain asset integrity.'
	},
	CERTIFY: {
		roleType: 'oversight',
		readableName: 'Certifier',
		description:
			'Validates the legitimacy and accuracy of connected assets through audits, can extend or adjust certification periods based on audit outcomes to ensure ongoing compliance and integrity.'
	},
	CONFISCATE_SHARES: {
		roleType: 'oversight',
		readableName: 'Confiscator Shares',
		description:
			'Empowered to confiscate ERC20 tokens under regulatory or legal directives on frozen assets, ensuring compliance while being restricted to prevent abuse.'
	},
	CONFISCATE_RECEIPT: {
		roleType: 'oversight',
		readableName: 'Confiscator Receipt',
		description:
			'Empowered to confiscate ERC1155 tokens under regulatory or legal directives on frozen assets, ensuring compliance while being restricted to prevent abuse.'
	}
};

export function mapRoles(roles: Role[]): MappedRole[] {
	const roleMap = new Map<string, MappedRole>();

	roles.forEach((role) => {
		const baseRoleName = role.roleName.replace('_ADMIN', '');
		const isAdmin = role.roleName.endsWith('_ADMIN');
		let mappedRole = roleMap.get(baseRoleName);

		if (!mappedRole && roleDescriptions[baseRoleName as keyof typeof roleDescriptions]) {
			mappedRole = {
				roleType: roleDescriptions[baseRoleName as keyof typeof roleDescriptions].roleType,
				roleName: baseRoleName,
				roleHolders: [],
				adminRoleHolders: [],
				roleDescription:
					roleDescriptions[baseRoleName as keyof typeof roleDescriptions].description ||
					'Description not available.',
				readableName:
					roleDescriptions[baseRoleName as keyof typeof roleDescriptions].readableName ||
					'Readable name not available.',
				executorRoleHash: ROLES.find((r) => r.roleName === baseRoleName)?.roleHash || '',
				adminRoleHash: ROLES.find((r) => r.roleName === `${baseRoleName}_ADMIN`)?.roleHash || ''
			};
			roleMap.set(baseRoleName, mappedRole);
		}

		if (mappedRole) {
			if (isAdmin) {
				mappedRole.adminRoleHolders.push(...role.roleHolders);
			} else {
				mappedRole.roleHolders.push(...role.roleHolders);
			}
		}
	});

	return Array.from(roleMap.values());
}
