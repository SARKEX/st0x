/**
 * One-shot ts-morph codemod for TRADE-01 (Phase 2).
 *
 * Rewrites direct property reads of `inputTokenAddress` / `outputTokenAddress`
 * / `inputIOIndex` / `outputIOIndex` on ProcessedQuote-shaped receivers into
 * calls to the helper accessors in `$lib/types/orderPerspective.ts`:
 *
 *   quote.inputTokenAddress   → getMakerInputTokenAddress(quote)
 *   quote.outputTokenAddress  → getMakerOutputTokenAddress(quote)
 *   quote.inputIOIndex        → getMakerInputIOIndex(quote)
 *   quote.outputIOIndex       → getMakerOutputIOIndex(quote)
 *
 * `.svelte` files are NOT processed — RESEARCH §"Pattern 2" recommends
 * hand-editing them because building a Svelte preprocessor extraction step
 * costs more than the manual edits.
 *
 * Run once via `npx tsx scripts/codemod-trade-01.ts`. Per Decision D-02
 * (codemod-first, then flip), this script lands in this PR alongside its
 * output; whether to delete it post-merge is a Plan 02-08 phase-exit call.
 */
import { Project, SyntaxKind, type SourceFile } from 'ts-morph';

const TARGET_PROPERTIES = new Map<string, string>([
	['inputTokenAddress', 'getMakerInputTokenAddress'],
	['outputTokenAddress', 'getMakerOutputTokenAddress'],
	['inputIOIndex', 'getMakerInputIOIndex'],
	['outputIOIndex', 'getMakerOutputIOIndex']
]);

// Files that ARE the IO-perspective boundary or are codegen output. Their
// raw reads / declarations are legitimate and must not be rewritten.
const ALLOWLIST_PATH_FRAGMENTS = [
	'orderPerspective.ts',
	'utils/orderbook.ts',
	'api/orders.ts',
	'generated-graphql.ts',
	// The fixture is intentionally a violation; do NOT rewrite it.
	'io-perspective-violation.ts'
];

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });

let totalRewrites = 0;
const filesNeedingImport = new Set<SourceFile>();

for (const sourceFile of project.getSourceFiles()) {
	const filePath = sourceFile.getFilePath();
	if (ALLOWLIST_PATH_FRAGMENTS.some((p) => filePath.includes(p))) continue;
	// Skip .svelte files — they are hand-edited per RESEARCH §"Pattern 2".
	if (filePath.endsWith('.svelte')) continue;

	// Iterate in reverse so that rewriting a deeper node (e.g. `fill.quote.inputIOIndex`)
	// does NOT invalidate an outer node we already collected. PropertyAccessExpression
	// matches `obj.prop` reads ONLY — not PropertyAssignment (object-literal
	// `{ prop: value }`) and not interface/type member declarations. Pitfall 1
	// in RESEARCH covers this.
	const propertyAccesses = sourceFile
		.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
		.reverse();

	for (const node of propertyAccesses) {
		// `wasForgotten` guards against the case where a parent rewrite invalidated
		// this node — common when nested matches occur in the same expression chain.
		if (node.wasForgotten()) continue;
		const propName = node.getName();
		const helper = TARGET_PROPERTIES.get(propName);
		if (!helper) continue;

		const receiverText = node.getExpression().getText();
		// `replaceWithText` preserves leading trivia (whitespace + comments).
		node.replaceWithText(`${helper}(${receiverText})`);
		filesNeedingImport.add(sourceFile);
		totalRewrites += 1;
	}
}

// Add the named import to each file that received a rewrite.
for (const sourceFile of filesNeedingImport) {
	const importsNeeded = new Set<string>();

	// Re-scan for helper-call-shaped expressions to determine what's needed.
	sourceFile.forEachDescendant((node) => {
		if (node.getKind() !== SyntaxKind.CallExpression) return;
		const callee = node.getFirstChild()?.getText();
		if (!callee) return;
		if (Array.from(TARGET_PROPERTIES.values()).includes(callee)) {
			importsNeeded.add(callee);
		}
	});

	const existingImport = sourceFile.getImportDeclaration(
		(d) => d.getModuleSpecifierValue() === '$lib/types/orderPerspective'
	);
	if (existingImport) {
		const existingNamed = existingImport.getNamedImports().map((n) => n.getName());
		const toAdd = Array.from(importsNeeded).filter((n) => !existingNamed.includes(n));
		if (toAdd.length > 0) existingImport.addNamedImports(toAdd);
	} else {
		sourceFile.addImportDeclaration({
			moduleSpecifier: '$lib/types/orderPerspective',
			namedImports: Array.from(importsNeeded)
		});
	}
}

await project.save();

const fileList = Array.from(filesNeedingImport)
	.map((sf) => `  ${sf.getFilePath()}`)
	.join('\n');
console.log(
	`[codemod-trade-01] Rewrote ${totalRewrites} property reads across ${filesNeedingImport.size} files:\n${fileList}`
);
