# Technology Stack

**Analysis Date:** 2026-04-28

## Languages

**Primary:**
- TypeScript 5.9.3 — All application code, strict mode enabled (`tsconfig.json` line 11)
- Svelte 4.2.7 — UI components (`.svelte` files under `src/lib/components/`, `src/routes/`)

**Secondary:**
- TSX/React 18.3.1 — Used only for the Dynamic Labs SDK bridge (`src/lib/dynamic/DynamicReactProvider.tsx`); React is wrapped into Svelte via `svelte-preprocess-react`
- Markdown / MDX — Documentation pages under `src/routes/docs/` and `.svx`/`.md` rendered via mdsvex (`svelte.config.js`)
- Rainlang (DSL) — Order/strategy expressions deployed through the Rain orderbook protocol; not authored in this repo, only consumed via `@rainlanguage/orderbook` SDK
- JavaScript — Build configs only (`vite.config.js`, `eslint.config.js`, `postcss.config.js`, `svelte.config.js`)

## Runtime

**Environment:**
- Node.js — Version pinned via Nix flake (`flake.nix`) using `rainix.node-build-inputs`. No `.nvmrc` / `.node-version` present.
- Browser target: ES2022 (`vite.config.js` line 16, 21) with top-level-await support
- Vercel serverless functions for SvelteKit endpoints under `src/routes/api/`
- Cron schedule defined in `vercel.json` (`/api/cron/snapshots`, daily at `1 0 * * *` UTC)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present (lockfileVersion 3)

## Frameworks

**Core:**
- SvelteKit 2.8.0 — App framework (`@sveltejs/kit`)
- Svelte 4.2.7 — UI library
- `@sveltejs/adapter-vercel` 5.10.3 — Production deployment adapter (`svelte.config.js`)
- `@sveltejs/adapter-static` 3.0.10 — Available but adapter-vercel is wired in
- `@sveltejs/adapter-auto` 3.3.1 — Fallback dev adapter

**Testing:**
- Vitest 1.6.0 — Test runner (`vitest-setup.ts`, `vite.config.js` lines 24–32)
- `@testing-library/svelte` 5.1.0 — Component testing
- `@testing-library/jest-dom` 6.4.5 — Custom DOM matchers
- `@testing-library/user-event` 14.5.2 — User interaction simulation
- `vitest-mock-extended` 1.3.1 — Deep mock helpers
- jsdom 24.1.0 — DOM environment for tests

**Build/Dev:**
- Vite 5.4.10 — Bundler/dev server
- `@sveltejs/vite-plugin-svelte` 3.1.1
- mdsvex 0.11.2 — Markdown-in-Svelte preprocessor
- `svelte-preprocess-react` 1.0.0 — React interop preprocessor
- TypeScript 5.9.3 (`svelte-check` 3.6.0 for type-checking Svelte files)
- ESLint 9.0.0 (flat config, `eslint.config.js`) + `typescript-eslint` 8.0.0-alpha.20 + `eslint-plugin-svelte` 2.36.0
- Prettier 3.1.1 + `prettier-plugin-svelte` 3.1.2 + `prettier-plugin-tailwindcss` 0.5.14
- Tailwind CSS 3.4.3 + `@tailwindcss/typography` 0.5.15 + autoprefixer 10.4.19 (`tailwind.config.ts`, `postcss.config.js`)
- `@wagmi/cli` 2.1.8 — Contract codegen (`wagmi.config.ts`, output `src/generated.ts`)
- `@graphql-codegen/cli` 5.0.7 + `@graphql-codegen/typescript` 4.1.6 + `@graphql-codegen/typescript-operations` 4.6.1 + `@graphql-codegen/typescript-document-nodes` 4.0.16

## Key Dependencies

**Critical (Web3 / Orderbook):**
- `@wagmi/core` 2.22.1 + `@wagmi/connectors` 5.11.2 — Wallet connection (injected, walletConnect)
- `svelte-wagmi` 1.0.7 — Svelte store wrapper around wagmi
- `viem` (transitive via wagmi) + `ethers` 6.15.0 — Low-level EVM
- `@ethersproject/bytes` 5.8.0 — Byte utilities
- `@rainlanguage/orderbook` 0.0.1-alpha.231 — Rain orderbook SDK (RaindexClient, order types)
- `@rainlanguage/float` 0.0.0-alpha.40 — Rain decimal/float helper
- `@dynamic-labs/sdk-react-core` 4.52.2 + `@dynamic-labs/ethereum` 4.52.2 — Embedded wallet SDK
- `@tanstack/svelte-query` 5.66.9 — Server-state cache (`src/lib/clients/queryClient.ts`, `src/lib/queries/*`)

**Critical (UI):**
- `flowbite-svelte-icons` 0.4.5 — Icon set
- `lightweight-charts` 4.2.0 — Trading charts (`src/lib/components/charts/`)
- `vanilla-cookieconsent` 3.1.0 — Cookie consent banner
- `@fontsource/ia-writer-mono` 5.2.5 — Monospace font

**Critical (Server / Data):**
- `@vercel/blob` 2.0.0 — Snapshot blob storage (`src/lib/server/snapshots/blobIndex.ts`, `src/routes/api/cron/snapshots/+server.ts`)
- `@vercel/kv` 1.0.1 — KV interface (helpers in `src/lib/server/kv.ts`)
- `@vercel/analytics` 1.5.0 — Page analytics (`src/routes/+layout.svelte`)
- `@vercel/speed-insights` 1.2.0 — Web vitals
- `redis` 5.10.0 — Direct Redis client used by `src/lib/server/kv.ts` when `REDIS_URL` is set
- `pinata-web3` 0.4.1 — IPFS pinning (`src/lib/server/pinata.ts`)
- `posthog-js` 1.337.0 — Product analytics (`src/lib/services/analytics.ts`)
- `@scalar/api-reference` 1.40.1 — API doc renderer (used via `static/scalar.html` iframe; marked external in `svelte.config.js`)

**Math / Encoding:**
- `cbor-web` 9.0.2 — CBOR for Rain meta documents
- `pako` 2.1.0 — Gzip/inflate
- `ajv` 8.17.1 — JSON Schema validation
- `qrcode` 1.5.4 — QR generation for wallet/AA flows
- `nyse-holidays` 1.2.0 — US market hours for snapshot pipeline

**Reporting:**
- `jspdf` 3.0.4 + `jspdf-autotable` 5.0.2 — Tax/portfolio PDF export
- `highlight.js` 11.11.1 — Code highlighting in docs
- `rehype-katex-svelte` 1.2.0 + `remark-math` 3.0.0 — Math typesetting in mdsvex docs

**Infrastructure:**
- `react` 18.3.1 / `react-dom` 18.3.1 — Required only by Dynamic Labs SDK (rendered via Svelte React preprocessor)
- `baseline-browser-mapping` 2.9.17 — Build target mapping

## Configuration

**Environment (variables surfaced in `.env.example` and `src/`):**
- Server-only (`$env/dynamic/private`):
  - `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`, `SESSION_SECRET` — Admin Basic Auth & session HMAC (`src/lib/server/auth.ts`)
  - `HCAPTCHA_SECRET` — hCaptcha verification (`src/lib/server/accessCodes.ts`)
  - `ONRAMPER_SECRET_KEY` — Onramper URL signing (`src/routes/api/onramper/sign-url/+server.ts`)
  - `CRON_SECRET` — Authorizes Vercel cron (`src/routes/api/cron/snapshots/+server.ts`)
  - `REDIS_URL` — KV/Redis backend (`src/lib/server/kv.ts`)
  - `BLOB_READ_WRITE_TOKEN` — `@vercel/blob` token for snapshot list/get (`src/routes/api/snapshots/get/+server.ts`, `…/list/+server.ts`)
  - `PRIVATE_PINATA_JWT`, `PRIVATE_PINATA_GATEWAY_KEY` — IPFS pinning auth
  - `LP_SUBGRAPH_URL` — Goldsky LP attribution subgraph (declared in `.env.example`; consumed in rewards modules)
  - `LIQUIDITY_MONITOR_URL` — External SPYM oracle proxy (`src/routes/api/prices/spym/+server.ts`, `src/lib/server/snapshots/pyth.ts`)
  - `ST0X_API_URL`, `ST0X_API_KEY`, `ST0X_API_SECRET` — Upstream st0x REST API (`src/routes/api/st0x/[...path]/+server.ts`)
  - `CUSTOM_LOGIN_ENABLED`, `DEBUG_LOGIN`, `VERCEL_URL` — Behavioral toggles
  - `PRIVY_APP_SECRET` — Declared in `.env.example` (legacy/unused in current code)
- Public (`$env/dynamic/public`, exposed to browser):
  - `PUBLIC_WALLETCONNECT_ID` — wagmi WalletConnect projectId (`src/routes/+layout.svelte`)
  - `PUBLIC_DYNAMIC_ENVIRONMENT_ID` — Dynamic Labs environment (`src/lib/dynamic/DynamicSvelteWrapper.svelte`)
  - `PUBLIC_POSTHOG_KEY` — PostHog client key (`src/routes/+layout.svelte`)
  - `PUBLIC_PINATA_GATEWAY_URL` — IPFS gateway URL (`src/lib/server/pinata.ts`)
  - `PUBLIC_ONRAMPER_API_KEY`, `PUBLIC_ONRAMPER_ENV` — Onramper widget (`src/lib/components/OnramperModal.svelte`)
  - `PUBLIC_PRIVY_APP_ID` — Declared in `.env.example` (legacy/unused in current code)

`.env` files present (not read): `.env.example`, `.env.local`.

**Build:**
- `svelte.config.js` — SvelteKit config; relative paths, mdsvex extensions `.svelte | .svx | .md`, `@scalar/api-reference` marked external for adapter-vercel
- `tsconfig.json` — Extends `.svelte-kit/tsconfig.json`; strict, `allowJs` + `checkJs`, `jsx: react-jsx`, vitest globals
- `vite.config.js` — ES2022 build target, jsdom test env, inlines `svelte-wagmi` / `viem` / `ethers` for tests
- `tailwind.config.ts` — Custom `primary: #4c77ba`, neutral grays, typography plugin
- `eslint.config.js` — Flat config (recommended JS + TS + Svelte + Prettier compat); ignores `build/`, `.svelte-kit/`, `dist/`, `src/generated-graphql.ts`
- `wagmi.config.ts` — Generates `src/generated.ts` with `erc20Abi` actions
- `vercel.json` — Cron entry `/api/cron/snapshots` daily at 00:01 UTC
- `flake.nix` — Nix dev shell pulls Node + yarn from `rainprotocol/rainix`

## Platform Requirements

**Development:**
- npm + Node.js (provided via Nix `flake.nix` or via host)
- `npm install` then `npm run dev` (Vite dev server)
- Optional: `npm run nix-dev` to enter the flake-managed shell

**Dev Commands:**
```
npm run dev               # Vite dev server
npm run build             # Production build
npm run preview           # Preview build
npm run check             # svelte-kit sync + svelte-check (tsc)
npm run check:watch       # Watch mode for svelte-check
npm test                  # Vitest
npm run lint              # ESLint --fix
npm run lint-check        # ESLint (no fix)
npm run format            # Prettier --write
npm run format-check      # Prettier --list-different
npm run svelte-lint-format-check  # check + lint-check + format-check
npm run codegen           # Wagmi contract codegen → src/generated.ts
npm run graphql-codegen   # GraphQL types
```

**Production:**
- Vercel (via `@sveltejs/adapter-vercel`)
- Static OpenAPI assets served from `static/` (`scalar.html`, `openapi.json`)
- Required Vercel resources: Blob storage, Cron, optional KV/Redis

---

*Stack analysis: 2026-04-28*
