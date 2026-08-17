/**
 * The migration overrides a setting the user chose by hand, so the tests are
 * mostly about the three ways it must refuse to. Two of the refusals are
 * load-bearing rather than defensive: it must not run twice (or it would fight
 * a user who deliberately re-picks Elite Insights), and it must not burn its
 * one chance on a launch where the Axilog binding failed to load (or a partial
 * install would strand that user on Elite Insights forever).
 */
import { describe, it, expect } from 'vitest';
import {
    migrateParserBackendToAxilog,
    PARSER_BACKEND_MIGRATION_KEY,
    PARSER_BACKEND_MIGRATION_NOTICE_KEY,
} from '../parserBackendMigration';

const fakeStore = (initial: Record<string, unknown> = {}) => {
    const data: Record<string, unknown> = { ...initial };
    return {
        data,
        get: (key: string) => data[key],
        set: (key: string, value: unknown) => { data[key] = value; },
    };
};

describe('migrateParserBackendToAxilog', () => {
    it('moves an explicit elite-insights selection onto axilog and flags the notice', () => {
        const store = fakeStore({ parserBackend: 'elite-insights' });
        expect(migrateParserBackendToAxilog(store, true)).toBe('migrated');
        expect(store.data.parserBackend).toBe('axilog');
        expect(store.data[PARSER_BACKEND_MIGRATION_NOTICE_KEY]).toBe(true);
        expect(store.data[PARSER_BACKEND_MIGRATION_KEY]).toBe(true);
    });

    it('runs once: a later re-pick of elite-insights survives', () => {
        const store = fakeStore({ parserBackend: 'elite-insights' });
        migrateParserBackendToAxilog(store, true);
        store.data.parserBackend = 'elite-insights';

        expect(migrateParserBackendToAxilog(store, true)).toBe('already-run');
        expect(store.data.parserBackend).toBe('elite-insights');
    });

    it('does not spend its one chance when the axilog binding is unavailable', () => {
        const store = fakeStore({ parserBackend: 'elite-insights' });

        expect(migrateParserBackendToAxilog(store, false)).toBe('axilog-unavailable');
        expect(store.data.parserBackend).toBe('elite-insights');
        expect(store.data[PARSER_BACKEND_MIGRATION_KEY]).toBeUndefined();

        // A later launch where the binding loads still migrates them.
        expect(migrateParserBackendToAxilog(store, true)).toBe('migrated');
        expect(store.data.parserBackend).toBe('axilog');
    });

    it('marks itself done without a notice when there was nothing to migrate', () => {
        for (const stored of [undefined, 'axilog', 'nonsense']) {
            const store = fakeStore(stored === undefined ? {} : { parserBackend: stored });

            expect(migrateParserBackendToAxilog(store, true)).toBe('nothing-to-migrate');
            expect(store.data.parserBackend).toBe(stored);
            expect(store.data[PARSER_BACKEND_MIGRATION_KEY]).toBe(true);
            expect(store.data[PARSER_BACKEND_MIGRATION_NOTICE_KEY]).toBeUndefined();
        }
    });
});
