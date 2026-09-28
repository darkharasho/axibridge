import { describe, it, expect } from 'vitest';
import { LEGACY_THEME_TO_PALETTE } from '../../shared/webThemes';
import { collapseGlassKeys, migrateGlassSetting } from '../glassSettingMigration';
import { normalizeImportedSettings } from '../handlers/settingsHandlers';

/** Minimal stand-in for the electron-store surface the migration uses. */
const makeStore = (initial: Record<string, unknown> = {}) => {
    const data: Record<string, unknown> = { ...initial };
    return {
        data,
        get: (key: string, fallback?: unknown) => (key in data ? data[key] : fallback),
        set: (key: string, value: unknown) => { data[key] = value; },
        delete: (key: string) => { delete data[key]; },
        has: (key: string) => key in data,
    };
};

describe('LEGACY_THEME_TO_PALETTE', () => {
    it('maps every legacy uiTheme, and dark-glass is the one that carried glass', () => {
        expect(LEGACY_THEME_TO_PALETTE['classic']).toEqual({ palette: 'electric-blue', glass: false });
        expect(LEGACY_THEME_TO_PALETTE['modern']).toEqual({ palette: 'electric-blue', glass: false });
        expect(LEGACY_THEME_TO_PALETTE['matte']).toEqual({ palette: 'refined-cyan', glass: false });
        expect(LEGACY_THEME_TO_PALETTE['crt']).toEqual({ palette: 'emerald-mint', glass: false });
        expect(LEGACY_THEME_TO_PALETTE['kinetic']).toEqual({ palette: 'amber-warm', glass: false });
        expect(LEGACY_THEME_TO_PALETTE['dark-glass']).toEqual({ palette: 'electric-blue', glass: true });
    });
});

describe('migrateGlassSetting', () => {
    it('maps a legacy uiTheme to a palette and the glass boolean', () => {
        const store = makeStore({ uiTheme: 'dark-glass' });
        migrateGlassSetting(store);
        expect(store.data.colorPalette).toBe('electric-blue');
        expect(store.data.glass).toBe(true);
        expect(store.data.uiTheme).toBeUndefined();
    });

    it('drops the dead companion keys alongside uiTheme', () => {
        const store = makeStore({
            uiTheme: 'kinetic',
            githubWebTheme: 'x',
            kineticFontStyle: 'y',
            kineticThemeVariant: 'z',
            dashboardLayout: 'w',
        });
        migrateGlassSetting(store);
        for (const key of ['uiTheme', 'githubWebTheme', 'kineticFontStyle', 'kineticThemeVariant', 'dashboardLayout']) {
            expect(store.data[key], key).toBeUndefined();
        }
    });

    // The reason the collapse cannot sit inside the `if (legacyUiTheme)` guard it
    // used to share: most users have no uiTheme left but do have the three
    // booleans, so a guarded migration would silently skip every one of them.
    it('collapses the booleans with no uiTheme present', () => {
        const store = makeStore({ glassSurfaces: true, glassmorphic: false, axiDesign: true });
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(true);
        expect(store.data.glassSurfaces).toBeUndefined();
        expect(store.data.glassmorphic).toBeUndefined();
        expect(store.data.axiDesign).toBeUndefined();
    });

    it('folds glassmorphic alone into glass', () => {
        const store = makeStore({ glassmorphic: true });
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(true);
    });

    it('leaves glass off when neither glass boolean was set', () => {
        const store = makeStore({ axiDesign: true });
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(false);
    });

    // Review Focus 1: glassSurfaces/glassmorphic are deleted by the first run, so
    // re-deriving on every launch would read `undefined || undefined` and switch a
    // user's glass back off for good.
    it('does not clobber an existing glass value on a second launch', () => {
        const store = makeStore({ glassSurfaces: true });
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(true);
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(true);
    });

    it('does not clobber a user who has since turned glass off', () => {
        const store = makeStore({ glass: false });
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(false);
    });

    it('is a no-op on a fresh store', () => {
        const store = makeStore({});
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(false);
        expect(Object.keys(store.data)).toEqual(['glass']);
    });
});

// Review Focus 2: settings *import* reads a plain object, not the store, and its
// uiTheme guard would skip a file exported by the version that shipped the three
// booleans — which carries them and no uiTheme. Same collapse, same module.
describe('collapseGlassKeys', () => {
    it('collapses the booleans on an imported settings object', () => {
        const settings: Record<string, any> = { colorPalette: 'rose-pink', glassSurfaces: true, axiDesign: true };
        collapseGlassKeys(settings);
        expect(settings.glass).toBe(true);
        expect(settings.glassSurfaces).toBeUndefined();
        expect(settings.axiDesign).toBeUndefined();
        expect(settings.colorPalette).toBe('rose-pink');
    });

    it('folds glassmorphic alone into glass', () => {
        const settings: Record<string, any> = { glassmorphic: true };
        collapseGlassKeys(settings);
        expect(settings.glass).toBe(true);
    });

    it('respects a glass key the file already carries', () => {
        const settings: Record<string, any> = { glass: false, glassSurfaces: true };
        collapseGlassKeys(settings);
        expect(settings.glass).toBe(false);
    });

    it('writes glass: false for a file that carries neither', () => {
        const settings: Record<string, any> = { colorPalette: 'slate-silver' };
        collapseGlassKeys(settings);
        expect(settings.glass).toBe(false);
    });
});

// Fix round 1: normalizeImportedSettings is what select-settings-file must run on
// `parsed` before returning it — that handler is the live import path (SettingsView.tsx
// calls selectSettingsFile(), not the dead import-settings IPC). These tests exercise
// it directly against the shape select-settings-file hands the renderer.
describe('normalizeImportedSettings', () => {
    it('collapses glassSurfaces on a file with no glass and no uiTheme', () => {
        const settings: Record<string, any> = { colorPalette: 'rose-pink', glassSurfaces: true };
        normalizeImportedSettings(settings);
        expect(settings.glass).toBe(true);
        expect(settings.glassSurfaces).toBeUndefined();
        expect(settings.glassmorphic).toBeUndefined();
        expect(settings.axiDesign).toBeUndefined();
    });

    it('collapses glassmorphic alone', () => {
        const settings: Record<string, any> = { glassmorphic: true };
        normalizeImportedSettings(settings);
        expect(settings.glass).toBe(true);
    });

    it('maps a legacy uiTheme to its palette and glass value', () => {
        // dark-glass is the one legacy theme LEGACY_THEME_TO_PALETTE marks glass: true.
        const settings: Record<string, any> = { uiTheme: 'dark-glass' };
        normalizeImportedSettings(settings);
        expect(settings.colorPalette).toBe('electric-blue');
        expect(settings.glass).toBe(true);
        expect(settings.uiTheme).toBeUndefined();
    });

    // Review Focus 2, restated: collapseGlassKeys already fabricates glass: false
    // when neither legacy boolean is true and no glass key is present — this is
    // existing behaviour (see 'writes glass: false for a file that carries
    // neither' above), not something normalizeImportedSettings changes or fixes.
    it('leaves glass false (collapseGlassKeys default) for a file with none of the legacy keys', () => {
        const settings: Record<string, any> = { colorPalette: 'slate-silver' };
        normalizeImportedSettings(settings);
        expect(settings.glass).toBe(false);
    });
});
