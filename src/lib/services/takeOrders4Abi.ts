import { parseAbi } from 'viem';

/** Canonical IRaindexV6 calldata shape produced by the REST API's SDK call. */
export const TAKE_ORDERS_4_ABI = parseAbi([
	'function takeOrders4((bytes32 minimumIO, bytes32 maximumIO, bytes32 maximumIORatio, bool IOIsInput, ((address owner, (address interpreter, address store, bytes bytecode) evaluable, (address token, bytes32 vaultId)[] validInputs, (address token, bytes32 vaultId)[] validOutputs, bytes32 nonce) order, uint256 inputIOIndex, uint256 outputIOIndex, (address signer, bytes32[] context, bytes signature)[] signedContext)[] orders, bytes data) config) returns (bytes32 totalTakerInput, bytes32 totalTakerOutput)'
]);
