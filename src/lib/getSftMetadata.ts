import type { MetaV1S } from '$lib/types/OffchainAssetReceiptVault';

export const getSftMetadata = async (
	vaultAddress: string,
	subgraphUrl: string
): Promise<MetaV1S[]> => {
	try {
    const query = `
    {
  metaV1S(where: {
    subject: "0x000000000000000000000000${vaultAddress.slice(2)}"
  },
  orderBy: transaction__timestamp
  orderDirection: desc
  ) {
    id
    meta
    sender
    subject
    metaHash
  }
}
    `;

	const response = await fetch(subgraphUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query })
	});

	const json = await response.json();
	console.log('json : ', json);

	return json.data.metaV1S as MetaV1S[];
  } catch (error) {
    console.error('Error fetching metadata:', error);
    throw error;
  }
};
