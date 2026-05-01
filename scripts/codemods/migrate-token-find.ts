/**
 * One-shot ts-morph codemod for DRIFT-01 (Phase 4).
 *
 * Rewrites direct address-equality lookups against `TOKENS` / `ALL_TOKENS`
 * arrays into calls to the canonical helper `getTokenByAnyAddress` from
 * `$lib/config/tokens.ts`:
 *
 *   TOKENS.find((t) => t.address === addr)
 *     → getTokenByAnyAddress(addr)
 *
 *   TOKENS.find((t) => t.address.toLowerCase() === addr.toLowerCase())
 *     → getTokenByAnyAddress(addr)
 *
 *   ALL_TOKENS.find((t) => t.address.toLowerCase() === x.toLowerCase())
 *     → getTokenByAnyAddress(x)
 *
 * Per RESEARCH/MEMORY: each ST0x token has 3 address variants (wrapped,
 * unwrapped, legacy). Direct-find against `TOKENS` only matches the wrapped
 * variant — silent breakage. `getTokenByAnyAddress` checks all 3.
 *
 * `.svelte` files are skipped — they are hand-edited (TRADE-01 precedent;
 * ts-morph cannot safely transform Svelte template `<script lang="ts">`).
 *
 * Predicates that are NOT a simple address-equality (e.g. symbol-based
 * lookups, compound predicates with chainId/symbol filters that cannot be
 * preserved through the helper) are SKIPPED with a stderr warning. Those
 * call-sites must be hand-resolved (typically with a per-callsite
 * `eslint-disable-next-line no-restricted-syntax -- justification: ...`).
 *
 * Idempotency: re-running on a clean tree produces zero changes — the
 * matcher only fires on `(TOKENS|ALL_TOKENS).find(...)` and never on
 * `getTokenByAnyAddress(...)`.
 *
 * Run via: `npx tsx scripts/codemods/migrate-token-find.ts`
 */
import { Project, SyntaxKind, Node, type SourceFile } from 'ts-morph';

const ALLOWLIST_PATH_FRAGMENTS = [
	'src/lib/config/tokens.ts',
	'src/lib/config/network.ts',
	'token-lookup-violation.ts'
];

const TARGET_OBJECTS = new Set(['TOKENS', 'ALL_TOKENS']);

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });

let totalRewrites = 0;
let totalSkipped = 0;
const filesNeedingImport = new Set<SourceFile>();

/**
 * Walk a predicate body / expression and return the address argument expression
 * if (and only if) the predicate is a simple address-equality of one of:
 *
 *   t.address === addr
 *   t.address.toLowerCase() === addr.toLowerCase()
 *   t.address.toLowerCase() === addr
 *   t.address === addr.toLowerCase()
 *
 * Any compound predicate (`&&`, chainId filter, symbol filter, etc.) returns null.
 */
function extractAddressArg(predicate: Node): string | null {
	// Unwrap arrow function: `(t) => <body>` or `(t) => { return <body>; }`
	if (predicate.getKind() !== SyntaxKind.ArrowFunction) return null;
	const arrow = predicate.asKindOrThrow(SyntaxKind.ArrowFunction);
	const body = arrow.getBody();

	let expr: Node | undefined;
	if (body.getKind() === SyntaxKind.Block) {
		// Single `return X;` block
		const block = body.asKindOrThrow(SyntaxKind.Block);
		const stmts = block.getStatements();
		if (stmts.length !== 1) return null;
		const ret = stmts[0];
		if (ret.getKind() !== SyntaxKind.ReturnStatement) return null;
		expr = ret.asKindOrThrow(SyntaxKind.ReturnStatement).getExpression();
	} else {
		expr = body;
	}
	if (!expr) return null;

	if (expr.getKind() !== SyntaxKind.BinaryExpression) return null;
	const bin = expr.asKindOrThrow(SyntaxKind.BinaryExpression);
	const op = bin.getOperatorToken().getText();
	if (op !== '===' && op !== '==') return null;

	// Identify which side references `t.address` (with or without .toLowerCase()).
	const left = bin.getLeft();
	const right = bin.getRight();

	const leftIsAddrAccess = isParamAddressAccess(left, arrow);
	const rightIsAddrAccess = isParamAddressAccess(right, arrow);

	if (leftIsAddrAccess && !rightIsAddrAccess) {
		return stripToLowerCase(right);
	}
	if (rightIsAddrAccess && !leftIsAddrAccess) {
		return stripToLowerCase(left);
	}
	return null;
}

/** Strip a trailing `.toLowerCase()` call, returning the underlying expression text. */
function stripToLowerCase(node: Node): string {
	if (node.getKind() === SyntaxKind.CallExpression) {
		const call = node.asKindOrThrow(SyntaxKind.CallExpression);
		const callee = call.getExpression();
		if (
			callee.getKind() === SyntaxKind.PropertyAccessExpression &&
			callee.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getName() === 'toLowerCase' &&
			call.getArguments().length === 0
		) {
			return callee.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getExpression().getText();
		}
	}
	return node.getText();
}

/**
 * True if `node` is a property access referring to `<paramName>.address`
 * (optionally followed by `.toLowerCase()`), where `<paramName>` is the first
 * parameter of `arrow`.
 */
function isParamAddressAccess(node: Node, arrow: Node): boolean {
	const params = arrow.asKindOrThrow(SyntaxKind.ArrowFunction).getParameters();
	if (params.length === 0) return false;
	const paramName = params[0].getName();

	// Strip outer `.toLowerCase()` call.
	let target = node;
	if (target.getKind() === SyntaxKind.CallExpression) {
		const call = target.asKindOrThrow(SyntaxKind.CallExpression);
		const callee = call.getExpression();
		if (
			callee.getKind() === SyntaxKind.PropertyAccessExpression &&
			callee.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getName() === 'toLowerCase' &&
			call.getArguments().length === 0
		) {
			target = callee.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getExpression();
		}
	}
	if (target.getKind() !== SyntaxKind.PropertyAccessExpression) return false;
	const prop = target.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
	if (prop.getName() !== 'address') return false;
	const obj = prop.getExpression();
	return obj.getKind() === SyntaxKind.Identifier && obj.getText() === paramName;
}

for (const sourceFile of project.getSourceFiles()) {
	const filePath = sourceFile.getFilePath();
	if (ALLOWLIST_PATH_FRAGMENTS.some((p) => filePath.includes(p))) continue;
	if (filePath.endsWith('.svelte')) continue;

	const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).reverse();

	for (const node of calls) {
		if (node.wasForgotten()) continue;
		const callee = node.getExpression();
		if (callee.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
		const prop = callee.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
		if (prop.getName() !== 'find') continue;
		const obj = prop.getExpression();
		if (obj.getKind() !== SyntaxKind.Identifier) continue;
		const objName = obj.getText();
		if (!TARGET_OBJECTS.has(objName)) continue;

		const args = node.getArguments();
		if (args.length !== 1) continue;
		const predicate = args[0];

		const addrExpr = extractAddressArg(predicate);
		if (!addrExpr) {
			totalSkipped += 1;
			console.warn(
				`[migrate-token-find] SKIP non-simple predicate at ${filePath}:${node.getStartLineNumber()} — leaving call-site unchanged. Hand-resolve with eslint-disable + justification.`
			);
			continue;
		}

		node.replaceWithText(`getTokenByAnyAddress(${addrExpr})`);
		filesNeedingImport.add(sourceFile);
		totalRewrites += 1;
	}
}

// Add the named import to each file that received a rewrite.
for (const sourceFile of filesNeedingImport) {
	const existingImport = sourceFile.getImportDeclaration(
		(d) =>
			d.getModuleSpecifierValue() === '$lib/config/tokens' ||
			d.getModuleSpecifierValue() === '$lib/config/network'
	);
	if (existingImport) {
		const existingNamed = existingImport.getNamedImports().map((n) => n.getName());
		if (!existingNamed.includes('getTokenByAnyAddress')) {
			existingImport.addNamedImport('getTokenByAnyAddress');
		}
	} else {
		sourceFile.addImportDeclaration({
			moduleSpecifier: '$lib/config/tokens',
			namedImports: ['getTokenByAnyAddress']
		});
	}
}

await project.save();

const fileList = Array.from(filesNeedingImport)
	.map((sf) => `  ${sf.getFilePath()}`)
	.join('\n');
console.log(
	`[migrate-token-find] Rewrote ${totalRewrites} call(s) across ${filesNeedingImport.size} file(s); skipped ${totalSkipped} non-simple predicate(s).${fileList ? '\n' + fileList : ''}`
);
