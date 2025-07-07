import { PinataSDK } from 'pinata-web3';
import { PRIVATE_PINATA_JWT, PRIVATE_PINATA_GATEWAY_KEY } from '$env/static/private';
import { PUBLIC_PINATA_GATEWAY_URL } from '$env/static/public';

export const pinata = new PinataSDK({
	pinataJwt: PRIVATE_PINATA_JWT,
	pinataGateway: PUBLIC_PINATA_GATEWAY_URL,
	pinataGatewayKey: PRIVATE_PINATA_GATEWAY_KEY
});
