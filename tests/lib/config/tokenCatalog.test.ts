import { afterEach, describe, expect, it } from 'vitest';
import {
	PREVIOUS_SYMBOLS_BY_TOKEN,
	TOKEN_SYMBOLS,
	TOKENS,
	getTokenByAnyAddress,
	replaceTokenCatalog,
	type CategorizedToken
} from '../../../src/lib/config/tokens';
import { TOKEN_MIGRATION_MAPPINGS } from '../../../src/lib/config/tokenMigration';
import { TOKEN_WRAPPING_MAPPINGS } from '../../../src/lib/config/tokenWrapping';

function token(overrides: Partial<CategorizedToken> = {}): CategorizedToken {
	return {
		chainId: 8453,
		address: '0x0000000000000000000000000000000000000001',
		unwrappedAddress: '0x0000000000000000000000000000000000000002',
		legacyAddress: '0x0000000000000000000000000000000000000003',
		symbol: 'wtTEST',
		legacySymbol: 'tTEST',
		previousSymbols: ['wtOLD'],
		decimals: 18,
		name: 'Wrapped Test ST0x',
		priceFeedId: '0xfeed',
		migrationOrderHash: `0x${'1'.repeat(64)}`,
		category: 'ST0x',
		...overrides
	};
}

describe('runtime token catalog', () => {
	afterEach(() => replaceTokenCatalog([]));

	it('rebuilds lookups, wrapping mappings, and migration mappings in place', () => {
		replaceTokenCatalog([token()]);

		expect(TOKENS.map((item) => item.symbol)).toEqual(['wtTEST']);
		expect(TOKEN_SYMBOLS).toEqual(['wtTEST']);
		expect(PREVIOUS_SYMBOLS_BY_TOKEN.get('wtTEST')).toEqual(['wtOLD']);
		expect(getTokenByAnyAddress('0x0000000000000000000000000000000000000002')?.symbol).toBe(
			'wtTEST'
		);
		expect(TOKEN_WRAPPING_MAPPINGS).toHaveLength(1);
		expect(TOKEN_MIGRATION_MAPPINGS).toHaveLength(1);

		replaceTokenCatalog([
			token({
				address: '0x0000000000000000000000000000000000000004',
				unwrappedAddress: '0x0000000000000000000000000000000000000005',
				legacyAddress: undefined,
				symbol: 'wtNEXT',
				previousSymbols: undefined
			})
		]);

		expect(getTokenByAnyAddress('0x0000000000000000000000000000000000000001')).toBeNull();
		expect(TOKEN_WRAPPING_MAPPINGS[0]?.wrappedToken.symbol).toBe('wtNEXT');
		expect(TOKEN_MIGRATION_MAPPINGS).toHaveLength(0);
	});
});
