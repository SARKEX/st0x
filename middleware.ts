// middleware.ts  – place at the project root

/**
 * 1.  Add BASIC_AUTH_USER and BASIC_AUTH_PASS
 *     for *every* environment (Development, Preview, Production)
 *     in the Vercel dashboard.
 *
 * 2.  Commit this file and push.
 *
 * 3.  All requests now prompt for the credentials once;
 *     the browser re-sends them automatically for subsequent assets.
 */

const USER = process.env.BASIC_AUTH_USER ?? '';
const PASS = process.env.BASIC_AUTH_PASS ?? '';

export const config = {
  // Protect everything by default, but allow favicon/manifest-style files to pass
  // Note: SvelteKit uses `static/` for these; at runtime they are served from the root
  matcher: [
    /*
     * Match all paths except those starting with or matching:
     * - favicon.* (ico/png/svg)
     * - apple-touch-icon* (common iOS icons)
     * - site.webmanifest and robots.txt
     *
     * We intentionally do NOT exclude `/_app` so that JS/CSS are also gated; once the
     * browser sends Basic auth, subsequent asset requests include the header automatically.
     */
    '/((?!favicon|apple-touch-icon|site\\.webmanifest|robots\\.txt).*)',
  ],
};

export default function middleware(req: Request) {
  // Short-circuit if credentials are missing so you don't lock yourself out
  if (!USER || !PASS) {
    console.warn('⚠️  BASIC_AUTH_USER/PASS not set; skipping auth!');
    return;
  }

  // Allowlist handled via `config.matcher`; everything else is protected

  // ↳ Parse the Authorization header
  const authHeader = req.headers.get('authorization') ?? '';
  const [scheme, encoded] = authHeader.split(' ');
  if (scheme === 'Basic') {
    const [user, pass] = atob(encoded).split(':');
    if (user === USER && pass === PASS) {
      return;                      // ✅ correct creds – continue to the app
    }
  }

  // ↳ Otherwise, ask the browser for credentials
  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Protected site"' },
  });
}
