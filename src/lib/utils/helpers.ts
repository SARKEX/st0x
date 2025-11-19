/* eslint-disable @typescript-eslint/no-explicit-any */
import pako from 'pako';
import { decodeAllSync } from 'cbor-web';
import { isBytesLike } from 'ethers';
import { arrayify } from '@ethersproject/bytes';

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
