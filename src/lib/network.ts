import { Token } from 'sushi/currency';
import { polygon } from '@wagmi/core/chains';
import type { Sft } from './types';

export const ARBITRUM_SFT_SUBGRAPH_URL =
	'https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-arbitrum-one/1.0.1/gn';
export const TARGET_NETWORK = 'arbitrum';

export const STOXs : Sft[] = [
	{
		name: 'Test St0x',
		symbol: 'TSTOX',
		address: '0x6F69D14e0d7e736510A6F1499255F8Ba3b4A951b',
	},
	{
		name: 'STx Apple 01',
		symbol: 'AAPLs1',
		address: '0x294afcc97cc03bd7e4dccf4addf2a1497d96d454',
	},
	{
		name: 'STx Amazon 01',
		symbol: 'AMZNs1',
		address: '0x2e93b2c6cb3ac1b9993e784686c5637de28c2c2a',
	},
	{
		name: 'STx Alphabet 01',
		symbol: 'GOOGLs1',
		address: '0xaca45fea0049823e809f0e789144c21d96230996',
	},
	{
		name: 'STx Meta 01',
		symbol: 'METAs1',
		address: '0x52946181fe3e3ab967a52f7294fa1cd39ae882e9',
	},
	{
		name: 'STx Microsoft 01',
		symbol: 'MSFTs1',
		address: '0x20c40dd9e905482e6bc7c06de3383104746b7928',
	},
	{
		name: 'STx Tesla 01',
		symbol: 'TSLAs1',
		address: '0x6696E32EbD293783bCb4b4f157Da02A65789e38e',
	},
	{
		name: 'STx Nvidia 01',
		symbol: 'NVDAs1',
		address: '0x5191aF5069923b4AA2120f456ADbACF4d7Cf2a87',
	}
]
