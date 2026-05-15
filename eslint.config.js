import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			]
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/', 'src/generated-graphql.ts']
	},
	// Combined `no-restricted-syntax` block for TRADE-01 + DRIFT-01.
	//
	// IMPORTANT: ESLint flat config does NOT merge same-named rule entries
	// across blocks — the last block wins. Both rules MUST live in a single
	// rule entry with multiple selector options, otherwise one will be
	// silently overwritten by the other.
	//
	// TRADE-01: ban raw `.inputTokenAddress` / `.outputTokenAddress` /
	// `.inputIOIndex` / `.outputIOIndex` MemberExpression reads outside the
	// IO-perspective boundary. Per Decision D-01, every consumer must route
	// through the helper accessors in `src/lib/types/orderPerspective.ts`.
	// The selector matches PropertyAccessExpression (`obj.prop`) ONLY — it
	// does not fire on PropertyAssignment (`{ prop: value }`) or interface
	// declarations (`prop: string`), so the ProcessedQuote interface in
	// `utils/orderbook.ts` and the inline shape in `transaction.ts:817-823`
	// are unaffected by the rule itself.
	//
	// DRIFT-01: ban direct `TOKENS.find` / `ALL_TOKENS.find` lookups outside
	// the canonical lookup module. Per MEMORY.md, each ST0x token has 3
	// address variants (wrapped, unwrapped, legacy); a raw
	// `TOKENS.find((t) => t.address === x)` only matches the wrapped variant
	// — silent breakage. `getTokenByAnyAddress(addr)` from $lib/config/tokens
	// handles all 3 variants. The selector matches CallExpressions of shape
	// `<TOKENS|ALL_TOKENS>.find(...)` only.
	//
	// Combined ignore list is the union of both rules' allowlists. Each
	// allowlisted file is unaffected by the *other* rule (e.g. tokens.ts
	// does not read `.inputTokenAddress`; orderPerspective.ts does not call
	// `TOKENS.find`), so the union is safe.
	//
	// NOTE: tests/fixtures/ is intentionally NOT ignored — both fixtures
	// (`tests/fixtures/io-perspective-violation.ts` and
	// `tests/fixtures/eslint/token-lookup-violation.ts`) MUST trigger
	// their respective rules; the fixture lints are verified by
	// `tests/lib/lint/trade-01-rule.test.ts` and (if added) similar tests.
	{
		files: ['src/**/*.ts', 'src/**/*.svelte', 'tests/**/*.ts'],
		ignores: [
			'src/lib/types/orderPerspective.ts', // TRADE-01: canonical helper — legal raw reads
			'src/lib/utils/orderbook.ts', // TRADE-01: ProcessedQuote interface declaration
			'src/lib/api/orders.ts', // TRADE-01: convertApiOrderToProcessedQuote populates the fields
			'src/generated-graphql.ts', // TRADE-01: codegen output
			'src/lib/config/tokens.ts', // DRIFT-01: canonical lookup module
			'src/lib/config/network.ts' // DRIFT-01: re-exports of the canonical module
		],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector:
						"MemberExpression[property.name=/^(inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex)$/]",
					message:
						'Direct access to inputTokenAddress / outputTokenAddress / inputIOIndex / outputIOIndex is banned (TRADE-01). Use the helpers from $lib/types/orderPerspective.ts: getMakerInputTokenAddress, getMakerOutputTokenAddress, getMakerInputIOIndex, getMakerOutputIOIndex. Per-callsite escape requires: // eslint-disable-next-line no-restricted-syntax -- justification: ...'
				},
				{
					selector:
						"CallExpression[callee.object.name=/^(TOKENS|ALL_TOKENS)$/][callee.property.name='find']",
					message:
						'Direct TOKENS.find / ALL_TOKENS.find is banned (DRIFT-01). Use getTokenByAnyAddress(addr) from $lib/config/tokens.ts (handles wrapped/unwrapped/legacy address variants). Per-callsite escape: // eslint-disable-next-line no-restricted-syntax -- justification: ...'
				}
			]
		}
	},
	// D-11 (Phase 1 v1.1): UI E2E tests must not import internal-logic modules.
	// Drive everything through the rendered UI (data-testid selectors). The
	// convention erodes silently without a lint gate; selector hygiene beyond
	// this is trusted to convention doc + code review (semantic role/text via
	// getByText/getByRole is sometimes the right tool, e.g. accessibility-aligned
	// assertions on the wallet-connect button label).
	//
	// Companion: .planning/codebase/TESTING.md §"UI Test Selectors".
	// Companion: tests/fixtures/eslint/ui-test-import-violation.ts proves this
	// rule fires (the fixture path is included in `files` below so the rule
	// applies even though the file lives outside tests/integration/ui/).
	//
	// IMPORTANT: appended as a NEW scoped block (NOT merged into the TRADE-01 /
	// DRIFT-01 block above) per the flat-config-doesn't-merge warning at lines
	// 35-38. `no-restricted-imports` is a different rule from `no-restricted-syntax`
	// so the two coexist cleanly.
	{
		files: [
			'tests/integration/ui/**/*.{ts,js}',
			'tests/fixtures/eslint/ui-test-import-violation.ts'
		],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								'$lib/services/marketOrderExecution',
								'$lib/services/marketOrderExecution*',
								'$lib/stores/transaction',
								'$lib/stores/transaction*',
								'$lib/services/orderDeployment',
								'$lib/services/orderDeployment*',
								'$lib/services/walletService',
								'$lib/services/walletService*',
								'$lib/types/orderPerspective'
							],
							message:
								'UI E2E tests must NOT import internal-logic modules. Drive through the rendered UI (data-testid selectors). See .planning/codebase/TESTING.md §"UI Test Selectors". Companion fixture: tests/fixtures/eslint/ui-test-import-violation.ts.'
						}
					]
				}
			]
		}
	}
];
