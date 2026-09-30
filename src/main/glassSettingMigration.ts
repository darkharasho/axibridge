import { LEGACY_THEME_TO_PALETTE, axiThemeFromLegacyGlass } from '../shared/webThemes';

/** The slice of electron-store's API this migration needs. */
export interface GlassMigrationStore {
    get(key: string, fallback?: unknown): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
    has(key: string): boolean;
}

/**
 * Collapses the three appearance booleans into one appearance setting, carries that
 * setting from the `glass` boolean to an `axiTheme` id, and finishes the older
 * `uiTheme` migration if it is still pending.
 *
 * Two generations of the same setting end here. `uiTheme` named a whole look;
 * `glassSurfaces`/`glassmorphic`/`axiDesign` were three booleans for one; `glass` was
 * the single boolean those collapsed into, which was the right shape for exactly as
 * long as there was one theme to turn on. `axiTheme` is that setting once the package
 * shipped a second one.
 *
 * Runs unconditionally on every launch, NOT inside a `uiTheme` guard: most
 * existing users have no `uiTheme` left but do have `glassSurfaces` /
 * `glassmorphic` / `axiDesign`, and a guarded migration would silently skip
 * every one of them.
 *
 * Because it runs every launch and deletes its own inputs, it must only write
 * `axiTheme` when the key is absent. Re-deriving would read a deleted `glass` as
 * false on the second launch and switch a user's glass back off permanently.
 *
 * `glassmorphic` (Lillifox Mode) folding into `glass` is a deliberate visible
 * change: it was an aurora-background variant of glass with rounded cards, and
 * it becomes upstream glass. That is the intended consequence of "one toggle",
 * not a claim of visual equivalence.
 */
export function migrateGlassSetting(store: GlassMigrationStore): void {
    const legacyUiTheme = store.get('uiTheme') as string | undefined;
    if (legacyUiTheme) {
        const mapping = LEGACY_THEME_TO_PALETTE[legacyUiTheme] ?? { palette: 'electric-blue', glass: false };
        store.set('colorPalette', mapping.palette);
        // Only the palette carries over. `mapping.glass` records which legacy
        // themes were glassy, but glass is opt-in now, so it is not replayed.
        store.delete('uiTheme');
        store.delete('githubWebTheme');
        store.delete('kineticFontStyle');
        store.delete('kineticThemeVariant');
        store.delete('dashboardLayout');
    }

    // Glass is opt-in, never inherited. Deriving it from the legacy
    // `glassSurfaces` / `glassmorphic` keys made glass the effective default for
    // everyone who had ever switched the old theme on, which is the opposite of
    // "default is axi-design with a single toggle for glass for those who want
    // it". Everyone lands on the default theme and opts in from Settings.
    //
    // The second step, from that boolean to a theme id, is the one place a user's
    // existing look is at stake: `glass: true` has to arrive as `glass` and
    // `glass: false` as `default`, never as `flat`, which is a theme nobody has ever
    // been looking at. Same "only when absent" discipline as everything else here,
    // for the same reason — this runs every launch and deletes its own input, so a
    // second pass would read an absent `glass` as false and silently turn a user's
    // glass off.
    if (!store.has('axiTheme')) {
        store.set('axiTheme', axiThemeFromLegacyGlass(store.get('glass')));
    }

    store.delete('glass');
    store.delete('glassSurfaces');
    store.delete('glassmorphic');
    store.delete('axiDesign');
}

/**
 * The same collapse for a plain settings object, used by the settings-import
 * handler. Kept here beside `migrateGlassSetting` so the two cannot drift: an
 * imported file and a live store carry the same keys and deserve the same answer.
 *
 * Must be called OUTSIDE the import handler's `uiTheme` guard. A settings file
 * exported by the version that shipped the three booleans carries them and no
 * `uiTheme`, so a guarded collapse would land the import with no `glass` key at
 * all and silently switch the setting off.
 */
export function collapseGlassKeys(settings: Record<string, any>): void {
    if (settings.axiTheme === undefined) {
        const glass = typeof settings.glass === 'boolean'
            ? settings.glass
            : settings.glassSurfaces === true || settings.glassmorphic === true;
        settings.axiTheme = axiThemeFromLegacyGlass(glass);
    }
    delete settings.glass;
    delete settings.glassSurfaces;
    delete settings.glassmorphic;
    delete settings.axiDesign;
}
