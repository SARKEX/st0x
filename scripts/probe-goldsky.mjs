// Capture the Raindex SDK's actual Goldsky GraphQL request+response for a known LIVE order.
// Run with: node probe-goldsky.mjs <orderHash>
import { RaindexClient } from '@rainlanguage/raindex';
import fs from 'node:fs';

const ORDER_HASH = process.argv[2];
if (!ORDER_HASH) {
  console.error('usage: node probe-goldsky.mjs <orderHash>');
  process.exit(1);
}

const ORIG_FETCH = globalThis.fetch;
const captures = [];
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input.url ?? '');
  let body = init?.body;
  if (body == null && input && typeof input !== 'string' && input.body) {
    try {
      // Request body is a stream — clone & read
      const cloned = input.clone();
      body = await cloned.text();
    } catch (e) {
      body = `<unreadable: ${e.message}>`;
    }
  }
  if (url.includes('goldsky.com')) {
    const resp = await ORIG_FETCH(input, init);
    const cloned = resp.clone();
    const text = await cloned.text();
    captures.push({ url, body: body?.toString?.() ?? String(body), status: resp.status, response: text });
    return resp;
  }
  return ORIG_FETCH(input, init);
};

const YAML = `version: 5
networks:
  base:
    rpcs:
      - https://base-rpc.publicnode.com
    chain-id: 8453
    network-id: 8453
    currency: ETH
subgraphs:
  base: https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2026-02-05-c4ef/gn
metaboards:
  base: https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn
orderbooks:
  base:
    address: 0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D
    network: base
    subgraph: base
    deployment-block: 41747644
rainlangs:
  base:
    address: 0x22508460712C350e914b49155982d3A92D923b10
    network: base
`;

const r = await RaindexClient.new([YAML]);
if (r.error) { console.error(r.error.readableMsg); process.exit(1); }
const client = r.value;

console.log(`Calling getOrders({orderHash: ${ORDER_HASH}})...`);
const res = await client.getOrders([8453], { orderHash: ORDER_HASH, owners: [] }, 1, 1);
console.log('Result error:', res.error?.readableMsg ?? 'none');
console.log('Result value orders:', res.value?.orders.length ?? 0);

fs.writeFileSync('/tmp/goldsky-capture.json', JSON.stringify(captures, null, 2));
console.log(`\nWrote ${captures.length} captures to /tmp/goldsky-capture.json`);
for (const [i, c] of captures.entries()) {
  console.log(`\n--- capture ${i} ---`);
  console.log('URL:', c.url);
  console.log('REQUEST BODY (first 600):', String(c.body).slice(0, 600));
}
