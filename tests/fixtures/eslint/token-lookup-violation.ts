/**
 * ESLint fixture for DRIFT-01 `no-restricted-syntax` rule.
 *
 * This file intentionally contains banned TOKENS.find / ALL_TOKENS.find calls.
 * The rule MUST fire on every CallExpression below. Verified by:
 *   npm run lint -- tests/fixtures/eslint/token-lookup-violation.ts
 * Expected exit code: non-zero (rule violations reported).
 *
 * DO NOT add this path to the DRIFT-01 ESLint `ignores` list. It is *expected*
 * to fail lint when invoked directly. The project-wide `npm run lint` /
 * `npm run lint-check` only scan `src/`, so this fixture does not pollute
 * normal lint output despite intentionally violating the rule.
 *
 * NOTE: `TOKENS` and `ALL_TOKENS` are declared locally rather than imported so
 * the fixture does not depend on whether these symbols are exported from
 * `$lib/config/tokens` (e.g. `ALL_TOKENS` is a per-network reactive variable
 * inside Svelte components, not a module export). The ESLint
 * `no-restricted-syntax` selector matches by AST identifier name regardless of
 * binding source, so local declarations exercise the rule equivalently.
 */
declare const addr: string;

interface MinimalTok {
	address: string;
}
const TOKENS: MinimalTok[] = [];
const ALL_TOKENS: MinimalTok[] = [];

const a = TOKENS.find((t) => t.address === addr); // banned
const b = ALL_TOKENS.find((t) => t.address === addr); // banned

export const violations = { a, b };
