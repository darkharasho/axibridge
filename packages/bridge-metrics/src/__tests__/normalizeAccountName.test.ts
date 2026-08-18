import { describe, it, expect } from 'vitest';
import { getPlayerAccountKey, normalizeAccountName } from '../playerIdentity';
import { getEntityAccountKey } from '../nativeRoster';

/**
 * arcdps writes every account into the agent name buffer as `:Name.1234`.
 * axilog carried that colon through until 0.3.7, so logs parsed by the native
 * engine before that fix have it baked into their persisted details, and web
 * reports published from them have it baked into their JSON.
 *
 * The fold matters most for cross-report identity: the rollup keys players on
 * the account string, so without it a user with reports from both eras sees
 * every player split into two people with their history divided between them.
 */
describe('normalizeAccountName', () => {
    it('strips the arcdps leading colon', () => {
        expect(normalizeAccountName(':Foo.1234')).toBe('Foo.1234');
    });

    it('is idempotent, so a post-0.3.7 account is untouched', () => {
        expect(normalizeAccountName('Foo.1234')).toBe('Foo.1234');
        expect(normalizeAccountName(normalizeAccountName(':Foo.1234'))).toBe('Foo.1234');
    });

    it('leaves empty and degenerate values alone', () => {
        // '' means "unknown account" to every caller; a lone colon must not be
        // turned into it, and vice versa.
        expect(normalizeAccountName('')).toBe('');
        expect(normalizeAccountName(':')).toBe(':');
    });

    it('does not touch a colon anywhere but the front', () => {
        expect(normalizeAccountName('Foo:Bar.1234')).toBe('Foo:Bar.1234');
    });
});

describe('account identity folds across the 0.3.7 spelling change', () => {
    it('keys an EI-shaped player the same either way', () => {
        expect(getPlayerAccountKey({ account: ':Foo.1234' }))
            .toBe(getPlayerAccountKey({ account: 'Foo.1234' }));
        expect(getPlayerAccountKey({ account: ':Foo.1234' })).toBe('acct:Foo.1234');
    });

    it('keys a native entity the same either way, and the same as a player', () => {
        expect(getEntityAccountKey({ id: 1, account: ':Foo.1234' }))
            .toBe(getEntityAccountKey({ id: 1, account: 'Foo.1234' }));
        // The two shapes share a key spelling for the duration of the migration.
        expect(getEntityAccountKey({ id: 1, account: ':Foo.1234' }))
            .toBe(getPlayerAccountKey({ account: 'Foo.1234' }));
    });
});
