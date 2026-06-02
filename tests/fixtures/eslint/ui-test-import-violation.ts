/**
 * ESLint fixture for D-11 (Phase 1 v1.1) `no-restricted-imports` rule.
 *
 * This file intentionally violates the rule by importing internal-logic
 * modules that UI E2E tests under `tests/integration/ui/` MUST NOT touch.
 * The rule MUST fire on every banned import below. Verified by:
 *   npx eslint tests/fixtures/eslint/ui-test-import-violation.ts
 * Expected exit code: non-zero (`no-restricted-imports` reported).
 *
 * Mirrors `tests/fixtures/eslint/token-lookup-violation.ts` (DRIFT-01 / Phase 4
 * 04-03). The `eslint.config.js` D-11 block lists this exact path in `files`
 * so the rule applies even though the fixture lives outside
 * `tests/integration/ui/**`.
 *
 * Companion documentation: `.planning/codebase/TESTING.md` §"UI Test Selectors".
 *
 * DO NOT "fix" this file. It is supposed to fail lint when targeted directly.
 * The project-wide `npm run lint-check` only scans `src/`, so the fixture does
 * not pollute normal lint output despite intentionally violating the rule.
 */
import { executeMarketOrder } from '$lib/services/marketOrderExecution';
import transactionStore from '$lib/stores/transaction';

void executeMarketOrder;
void transactionStore;
