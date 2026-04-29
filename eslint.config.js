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
	// TRADE-01: ban raw `.inputTokenAddress` / `.outputTokenAddress` /
	// `.inputIOIndex` / `.outputIOIndex` MemberExpression reads outside the
	// IO-perspective boundary. Per Decision D-01, this rule enforces that
	// every consumer routes through the helper accessors in
	// `src/lib/types/orderPerspective.ts`.
	//
	// The selector matches PropertyAccessExpression (`obj.prop`) ONLY — it
	// does not fire on PropertyAssignment (`{ prop: value }`) or interface
	// declarations (`prop: string`), so the ProcessedQuote interface in
	// `utils/orderbook.ts` and the inline shape in `transaction.ts:817-823`
	// are unaffected by the rule itself. The allowlist below is a fail-safe
	// for the canonical helper file (which contains legitimate raw reads in
	// the wrappers themselves) plus codegen output.
	{
		files: ['src/**/*.ts', 'src/**/*.svelte', 'tests/**/*.ts'],
		ignores: [
			'src/lib/types/orderPerspective.ts', // canonical helper — legal raw reads
			'src/lib/utils/orderbook.ts', // ProcessedQuote interface declaration
			'src/lib/api/orders.ts', // convertApiOrderToProcessedQuote populates the fields
			'src/generated-graphql.ts' // codegen output
		],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector:
						"MemberExpression[property.name=/^(inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex)$/]",
					message:
						'Direct access to inputTokenAddress / outputTokenAddress / inputIOIndex / outputIOIndex is banned (TRADE-01). Use the helpers from $lib/types/orderPerspective.ts: getMakerInputTokenAddress, getMakerOutputTokenAddress, getMakerInputIOIndex, getMakerOutputIOIndex. Per-callsite escape requires: // eslint-disable-next-line no-restricted-syntax -- justification: ...'
				}
			]
		}
	}
];
