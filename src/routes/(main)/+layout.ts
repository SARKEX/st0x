// Disable SSR for app pages to avoid loading heavy wallet libs on the server.
// Server hooks still run and can redirect unauthenticated users.
export const ssr = false;
export const prerender = false;

