// Docs pages don’t need SSR and import wagmi stores for header/footer.
// Disabling SSR avoids loading viem/wagmi on the server in Vercel.
export const ssr = false;
export const prerender = false;

