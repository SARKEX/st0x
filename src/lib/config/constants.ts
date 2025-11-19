export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
export const ONE = BigInt('1000000000000000000');

export const ROLES = [
	{
		roleName: 'CERTIFY_ADMIN',
		roleHash: '0x48ece560b6811ee496fa3dedc7d5be3dfce8c5eb8f1cc18626507e158a23169b',
		roleHolders: [],
		roleDescription: 'Grant certification permissions to other addresses'
	},
	{
		roleName: 'CONFISCATE_SHARES_ADMIN',
		roleHash: '0xe5c740c26fb65f0a8de546defe3fe0011d5f2292abe6c4e6c3833916f4d8f76c',
		roleHolders: [],
		roleDescription: 'Grant confiscation permissions for ERC-20 tokens from any address'
	},
	{
		roleName: 'CONFISCATE_RECEIPT_ADMIN',
		roleHash: '0x4fa4167c411e3d3edd62f8bf767cb8c66f94f891502ddab57e7c55ca1d7d891d',
		roleHolders: [],
		roleDescription: 'Grant confiscation permissions for ERC-1155 receipts from any address'
	},
	{
		roleName: 'DEPOSIT_ADMIN',
		roleHash: '0x1ae915b310cb86de75afe5db1721d474dd0a8617151f7524866025476454bc02',
		roleHolders: [],
		roleDescription: 'Grant deposit permissions to other addresses'
	},
	{
		roleName: 'WITHDRAW_ADMIN',
		roleHash: '0xa0f4a7675effb97b81a0c9d5b53b44a73019f25c5ec8fda76d7c1ad3920851d3',
		roleHolders: [],
		roleDescription: 'Grant withdrawal permissions to other addresses'
	},
	{
		roleName: 'CERTIFY',
		roleHash: '0x50a07cb25d0d864370863300b20987dfdae089abad71b607faf639d09d053391',
		roleHolders: [],
		roleDescription: 'Certify tokens based on real-world verification'
	},
	{
		roleName: 'CONFISCATE_SHARES',
		roleHash: '0x54f0af3716c79b30b8c228679d31d77a1a5f526c16af3262730e0a8de4363fed',
		roleHolders: [],
		roleDescription: 'Confiscate ERC-20 tokens from any address'
	},
	{
		roleName: 'CONFISCATE_RECEIPT',
		roleHash: '0x3dd35eca0ca8a128757fa464a5dfa4ad6cc4853cad96dce4e90fdbea4f0a52e3',
		roleHolders: [],
		roleDescription: 'Confiscate ERC-1155 receipts from any address'
	},
	{
		roleName: 'DEPOSIT',
		roleHash: '0x87a7811f4bfedea3d341ad165680ae306b01aaeacc205d227629cf157dd9f821',
		roleHolders: [],
		roleDescription: 'Deposit assets and mint tokens'
	},
	{
		roleName: 'WITHDRAW',
		roleHash: '0x7a8dc26796a1e50e6e190b70259f58f6a4edd5b22280ceecc82b687b8e982869',
		roleHolders: [],
		roleDescription: 'Withdraw assets and burn tokens'
	},
	{
		roleName: 'TRANSFER_SHARES',
		roleHash: '0x55387ad71a8e46cc1293406722dd825c028eaf5ff0c2a3e4f176184d62e9d30a',
		roleHolders: [],
		roleDescription: 'Transfer shares between addresses'
	},
	{
		roleName: 'TRANSFER_RECEIPT',
		roleHash: '0x0e5bce7997400ea2056cf00fe99ca5d6be40bdb9d8b4e41217fe8670c2639a48',
		roleHolders: [],
		roleDescription: 'Transfer receipts between addresses'
	}
];
export const IPFS_APIS = [
	'https://db2.gildlab.xyz/api/v0/add?pin=true&to-files=', //David A Box2
	'https://ipfs.dragonflysun.ge/api/v0/add?pin=true&to-files=' //Nino
];

export const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

export const MAGIC_NUMBERS = {
	/**
	 * Prefixes every rain meta document
	 */
	RAIN_META_DOCUMENT: BigInt(0xff0a89c674ee7874n),
	/**S
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

export const TRANSACTION_IN_PROGRESS_TEXT = 'Transaction taking place, please wait.';
export const VIEW_ON_EXPLORER_TEXT = 'View on the block explorer';
