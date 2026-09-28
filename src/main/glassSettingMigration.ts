import { LEGACY_THEME_TO_PALETTE } from '../shared/webThemes';

/** The slice of electron-store's API this migration needs. */
export interface GlassMigrationStore {
    get(key: string, fallback?: unknown): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
    has(key: string): boolean;
}

/**
 * Collapses the three appearance booleans into one `glass`, and finishes the
 * older `uiTheme` migration if it is still pending.
 *
 * Runs unconditionally on every launch, NOT inside a `uiTheme` guard: most
 * existing users have no `uiTheme` left but do have `glassSurfaces` /
 * `glassmorphic` / `axiDesign`, and a guarded migration would silently skip
 * every one of them.
 *
 * Because it runs every launch and deletes its own inputs, it must only write
 * `glass` when the key is absent. Re-deriving would read `undefined || undefined`
 * on the second launch and switch a user's glass back off permanently.
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
        if (mapping.glass) store.set('glassSurfaces', true);
        store.delete('uiTheme');
        store.delete('githubWebTheme');
        store.delete('kineticFontStyle');
        store.delete('kineticThemeVariant');
        store.delete('dashboardLayout');
    }

    if (!store.has('glass')) {
        const glassSurfaces = store.get('glassSurfaces', false) === true;
        const glassmorphic = store.get('glassmorphic', false) === true;
        store.set('glass', glassSurfaces || glassmorphic);
    }

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
    if (typeof settings.glass !== 'boolean') {
        settings.glass = settings.glassSurfaces === true || settings.glassmorphic === true;
    }
    delete settings.glassSurfaces;
    delete settings.glassmorphic;
    delete settings.axiDesign;
}
