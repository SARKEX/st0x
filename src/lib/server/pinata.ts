import { PinataSDK } from 'pinata-web3';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const PRIVATE_PINATA_JWT = privateEnv.PRIVATE_PINATA_JWT;
const PRIVATE_PINATA_GATEWAY_KEY = privateEnv.PRIVATE_PINATA_GATEWAY_KEY;
const PUBLIC_PINATA_GATEWAY_URL = publicEnv.PUBLIC_PINATA_GATEWAY_URL;

export const pinata = new PinataSDK({
	pinataJwt: PRIVATE_PINATA_JWT || '',
	pinataGateway: PUBLIC_PINATA_GATEWAY_URL || '',
	pinataGatewayKey: PRIVATE_PINATA_GATEWAY_KEY || ''
});
