/**
 * TRADE-01 ESLint rule integration test.
 *
 * Asserts that the `no-restricted-syntax` rule defined in `eslint.config.js`
 * (TRADE-01 block, lines 46-65) actually fires on the canonical violation
 * fixture `tests/fixtures/io-perspective-violation.ts`. The fixture contains
 * 4 banned MemberExpression reads (`inputTokenAddress`, `outputTokenAddress`,
 * `inputIOIndex`, `outputIOIndex`) — every one MUST trigger the rule.
 *
 * This is the missing automated verification for VALIDATION.md row:
 *   "TRADE-01 | ESLint rule fires on a known violation fixture"
 *
 * Implementation note: ESLint flat-config blocks that share a rule name
 * (`no-restricted-syntax`) REPLACE rather than merge. If the DRIFT-01 block
 * (lines 80-101) is registered after TRADE-01, the TRADE-01 selector is
 * silently dropped. This test exists specifically to catch that regression.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../..');
const FIXTURE = 'tests/fixtures/io-perspective-violation.ts';
const BANNED_PROPS = [
	'inputTokenAddress',
	'outputTokenAddress',
	'inputIOIndex',
	'outputIOIndex'
];

interface EslintMessage {
	ruleId: string | null;
	message: string;
	line: number;
	column: number;
}

interface EslintResult {
	filePath: string;
	messages: EslintMessage[];
	errorCount: number;
}

function runEslintJson(targetRelPath: string): EslintResult[] {
	// eslint exits non-zero when violations are found; capture stdout regardless.
	let stdout = '';
	try {
		stdout = execFileSync('npx', ['eslint', '--format', 'json', targetRelPath], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		});
	} catch (err) {
		const e = err as { stdout?: Buffer | string };
		stdout = typeof e.stdout === 'string' ? e.stdout : (e.stdout?.toString() ?? '');
	}
	if (!stdout) throw new Error('eslint produced no stdout');
	return JSON.parse(stdout) as EslintResult[];
}

describe('TRADE-01 no-restricted-syntax ESLint rule', () => {
	it('fires on every banned MemberExpression in the violation fixture', () => {
		const results = runEslintJson(FIXTURE);
		expect(results.length).toBeGreaterThan(0);
		const messages = results[0].messages.filter((m) => m.ruleId === 'no-restricted-syntax');

		// Should report at least one violation per banned property name (4 total).
		expect(messages.length).toBeGreaterThanOrEqual(4);

		// Every TRADE-01 message must reference the helper module the rule directs
		// developers to, OR mention the banned property names. This guards against
		// the rule being clobbered by a later block that uses the same rule name
		// but a different selector (e.g. DRIFT-01).
		const tradeOneMessages = messages.filter(
			(m) =>
				m.message.includes('TRADE-01') ||
				m.message.includes('orderPerspective') ||
				BANNED_PROPS.some((p) => m.message.includes(p))
		);
		expect(tradeOneMessages.length).toBeGreaterThanOrEqual(4);
	});

	it('reports a violation for each of the 4 banned property names', () => {
		const results = runEslintJson(FIXTURE);
		const messages = results[0].messages;

		// The rule message includes all four property names verbatim, so we
		// assert by counting messages on the lines that read each property.
		// Fixture layout: lines 16-19, one read per line.
		const lineProps: Array<[number, string]> = [
			[16, 'inputTokenAddress'],
			[17, 'outputTokenAddress'],
			[18, 'inputIOIndex'],
			[19, 'outputIOIndex']
		];
		for (const [line, prop] of lineProps) {
			const hit = messages.find(
				(m) => m.line === line && m.ruleId === 'no-restricted-syntax'
			);
			expect(hit, `Expected TRADE-01 violation on line ${line} (${prop})`).toBeDefined();
		}
	});
});
