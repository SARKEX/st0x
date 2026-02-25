export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
export const ONE = BigInt('1000000000000000000');

/** 256-bit zero hex for Rain Float comparison */
export const ZERO_FLOAT_HEX =
	'0x0000000000000000000000000000000000000000000000000000000000000000';

/** Pyth Hermes API base URL */
export const HERMES_BASE_URL = 'https://hermes.pyth.network/v2/updates/price';

export const MAGIC_NUMBERS = {
	/**
	 * Prefixes every rain meta document
	 */
	RAIN_META_DOCUMENT: BigInt(0xff0a89c674ee7874n),
	/**
	 * OA Schema
	 */
	OA_SCHEMA: BigInt(0xffa8e8a9b9cf4a31n),
	/**
	 * OA Hash list
	 */
	OA_HASH_LIST: BigInt(0xff9fae3cc645f463n),
	/**
	 * OA Structure
	 */
	OA_STRUCTURE: BigInt(0xffc47a6299e8a911n),
	/**
	 * OA Token image
	 */
	OA_TOKEN_IMAGE: BigInt(0xff8cd2927c8c86cbn),
	/**
	 * OA Token credential links
	 */
	OA_TOKEN_CREDENTIAL_LINKS: BigInt(0xffbc38eb14ad2209n)
};

// Newsletter configuration
export const MAILERLITE_SUBSCRIBE_ENDPOINT =
	'https://assets.mailerlite.com/jsonp/1830582/forms/167181006278755829/subscribe';
