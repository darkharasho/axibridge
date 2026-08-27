/**
 * User-tunable parser settings.
 *
 * These were once the Elite Insights CLI's `settings.conf` keys, and the store
 * key is still `eiParserSettings` for that reason — renaming it would need a
 * migration and buys nothing, since no user ever sees the key.
 *
 * Only the three settings below survived the removal of the Elite Insights
 * backend. The other nine (`saveOutHTML`, `lightTheme`, `singleThreaded`,
 * `memoryLimit`, `parsePhases`, `detailledWvW`, `anonymous`, `customTooShort`,
 * `skipFailedTries`) were lines in a .NET CLI config file with no axilog
 * equivalent; they are ignored on read, so a persisted settings object from an
 * older build still loads cleanly.
 */
export interface ParserSettings {
    /**
     * Compute combat-replay positions.
     *
     * NOT a pure performance toggle: it governs whether the app KEEPS the
     * positions (`pruneDetailsForStats`), not whether axilog computes them.
     * axilog is always asked for `replay: true`, because turning it off also
     * drops `dist_to_com`/`stack_dist` and zeroes Closest-to-Tag for the whole
     * squad (issue #31).
     */
    parseCombatReplay: boolean;
    computeDamageModifiers: boolean;
    rawTimelineArrays: boolean;
}

export const DEFAULT_PARSER_SETTINGS: ParserSettings = {
    parseCombatReplay: false,
    computeDamageModifiers: true,
    rawTimelineArrays: true,
};

/** The `electron-store` key. Retained from the Elite Insights era on purpose. */
export const PARSER_SETTINGS_STORE_KEY = 'eiParserSettings';
