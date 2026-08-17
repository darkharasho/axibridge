/**
 * Moves users who had explicitly selected Elite Insights onto Axilog, once.
 *
 * `parserBackend` is only ever written by a click in Settings, so a stored
 * `elite-insights` was a real choice — but it was a choice made when the picker
 * advertised Elite Insights as "the most complete statistics surface". After the
 * Axilog migration that is backwards: Elite Insights emits no Axilog data, so
 * roughly twenty `compute*` readers render its logs empty, and the user keeps
 * paying a ~90 MB download for the privilege. Leaving them there honours the
 * letter of an old click while breaking what they actually wanted.
 *
 * So the override runs exactly once, and the flag that records it is what stops
 * this from becoming a fight: anyone who re-picks Elite Insights afterwards
 * keeps it forever, because the migration never looks again.
 */

import { DEFAULT_PARSER_BACKEND } from './axilogParser';

/** Set once the migration has had its single chance to run. */
export const PARSER_BACKEND_MIGRATION_KEY = 'parserBackendMigratedToAxilog';

/**
 * Set only when the migration actually changed something. Cleared by the
 * renderer once it has told the user; it outlives a restart on purpose, so a
 * silent engine change cannot slip past someone who was not watching.
 */
export const PARSER_BACKEND_MIGRATION_NOTICE_KEY = 'parserBackendMigrationNotice';

interface MigrationStore {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
}

export type ParserBackendMigrationOutcome =
    /** Already ran on a previous launch. Whatever is stored now is the user's. */
    | 'already-run'
    /**
     * The Axilog binding did not load, so there is nothing to migrate onto.
     * Deliberately does NOT burn the one chance: a binding that fails to load
     * on one launch (a partial install, a platform without a prebuilt binary
     * yet) must not strand the user on Elite Insights permanently.
     */
    | 'axilog-unavailable'
    /** Nothing stored, or already Axilog — no override needed. */
    | 'nothing-to-migrate'
    /** Was `elite-insights`; now Axilog, and the user will be told. */
    | 'migrated';

/**
 * Run the one-time move. Returns what it did, for the startup log.
 *
 * Call after the {@link AxilogManager} exists — `axilogAvailable` is the
 * difference between a migration and stranding someone with no parser at all.
 */
export function migrateParserBackendToAxilog(
    store: MigrationStore,
    axilogAvailable: boolean,
): ParserBackendMigrationOutcome {
    if (store.get(PARSER_BACKEND_MIGRATION_KEY)) return 'already-run';
    if (!axilogAvailable) return 'axilog-unavailable';

    const stored = store.get('parserBackend');
    store.set(PARSER_BACKEND_MIGRATION_KEY, true);

    if (stored !== 'elite-insights') return 'nothing-to-migrate';

    store.set('parserBackend', DEFAULT_PARSER_BACKEND);
    store.set(PARSER_BACKEND_MIGRATION_NOTICE_KEY, true);
    return 'migrated';
}
