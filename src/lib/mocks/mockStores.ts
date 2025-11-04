import { writable } from 'svelte/store';

import { type Config } from '@wagmi/core';
import { mockWeb3Config } from './mockWagmiConfig';

// Mock writable stores
export const web3ModalStore = writable<null>(null);
export const mockWrongNetworkStore = writable<boolean>(false);
export const mockSignerAddressStore = writable<string>('');
export const mockChainIdStore = writable<number>(8453);
export const mockConnectedStore = writable<boolean>(false);
export const mockWagmiConfigStore = writable<Config>(mockWeb3Config);
