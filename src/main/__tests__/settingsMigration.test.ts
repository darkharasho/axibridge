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
    it('maps a legacy uiTheme to a palette, landing on the main theme', () => {
        const store = makeStore({ uiTheme: 'dark-glass' });
        migrateGlassSetting(store);
        expect(store.data.colorPalette).toBe('electric-blue');
        // The palette carries over; the legacy theme's glassiness does not.
        expect(store.data.axiTheme).toBe('default');
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

    // Glass is opt-in. The legacy booleans are retired, not carried forward:
    // deriving `glass` from them made glass the effective default for everyone
    // who had ever switched the old theme on, which is the opposite of the one
    // toggle this feature is supposed to be.
    it('retires the legacy booleans without enabling glass', () => {
        const store = makeStore({ glassSurfaces: true, glassmorphic: false, axiDesign: true });
        migrateGlassSetting(store);
        expect(store.data.axiTheme).toBe('default');
        expect(store.data.glassSurfaces).toBeUndefined();
        expect(store.data.glassmorphic).toBeUndefined();
        expect(store.data.axiDesign).toBeUndefined();
    });

    it('does not fold glassmorphic into glass', () => {
        const store = makeStore({ glassmorphic: true });
        migrateGlassSetting(store);
        expect(store.data.axiTheme).toBe('default');
    });

    it('leaves glass off when neither glass boolean was set', () => {
        const store = makeStore({ axiDesign: true });
        migrateGlassSetting(store);
        expect(store.data.axiTheme).toBe('default');
    });

    // The whole point of the second generation of this migration: a user who had
    // glass on has to still have glass on. This is the one assertion here where a
    // regression is visible to someone on the next launch.
    it('carries a user who had glass on to the glass theme', () => {
        const store = makeStore({ glass: true });
        migrateGlassSetting(store);
        expect(store.data.axiTheme).toBe('glass');
        expect(store.data.glass).toBeUndefined();
    });

    // `false` meant the main theme, which is what those users were looking at. It
    // must never arrive as `flat` — a theme nobody has ever seen.
    it('carries a user who had glass off to the main theme, never to flat', () => {
        const store = makeStore({ glass: false });
        migrateGlassSetting(store);
        expect(store.data.axiTheme).toBe('default');
    });

    // The `!store.has('axiTheme')` guard. This runs every launch and deletes its own
    // input, so without the guard the second pass would read an absent `glass` as
    // false and switch a user's theme back to the default permanently.
    it('does not clobber the choice on a second launch', () => {
        const store = makeStore({ glass: true });
        migrateGlassSetting(store);
        expect(store.data.axiTheme).toBe('glass');
        migrateGlassSetting(store);
        expect(store.data.axiTheme).toBe('glass');
    });

    it('leaves a theme only reachable through the picker alone', () => {
        // flat can only have come from the picker — no legacy key maps to it — so a
        // launch must not touch it.
        const store = makeStore({ axiTheme: 'flat' });
        migrateGlassSetting(store);
        migrateGlassSetting(store);
        expect(store.data.axiTheme).toBe('flat');
    });

    it('is a no-op on a fresh store', () => {
        const store = makeStore({});
        migrateGlassSetting(store);
        expect(store.data.axiTheme).toBe('default');
        expect(Object.keys(store.data)).toEqual(['axiTheme']);
    });
});

// Review Focus 2: settings *import* reads a plain object, not the store, and its
// uiTheme guard would skip a file exported by the version that shipped the three
// booleans — which carries them and no uiTheme. Same collapse, same module.
describe('collapseGlassKeys', () => {
    it('collapses the booleans on an imported settings object', () => {
        const settings: Record<string, any> = { colorPalette: 'rose-pink', glassSurfaces: true, axiDesign: true };
        collapseGlassKeys(settings);
        expect(settings.axiTheme).toBe('glass');
        expect(settings.glass).toBeUndefined();
        expect(settings.glassSurfaces).toBeUndefined();
        expect(settings.axiDesign).toBeUndefined();
        expect(settings.colorPalette).toBe('rose-pink');
    });

    it('folds glassmorphic alone into glass', () => {
        const settings: Record<string, any> = { glassmorphic: true };
        collapseGlassKeys(settings);
        expect(settings.axiTheme).toBe('glass');
    });

    // An export written by a build that had the theme picker: the id wins outright,
    // including over booleans that disagree with it, because the booleans cannot say
    // flat and reading them first would flatten every flat export to the default.
    it('prefers an axiTheme the file already carries', () => {
        const settings: Record<string, any> = { axiTheme: 'flat', glass: true, glassSurfaces: true };
        collapseGlassKeys(settings);
        expect(settings.axiTheme).toBe('flat');
        expect(settings.glass).toBeUndefined();
    });

    it('respects a glass key the file already carries', () => {
        const settings: Record<string, any> = { glass: false, glassSurfaces: true };
        collapseGlassKeys(settings);
        expect(settings.axiTheme).toBe('default');
    });

    it('writes the main theme for a file that carries neither', () => {
        const settings: Record<string, any> = { colorPalette: 'slate-silver' };
        collapseGlassKeys(settings);
        expect(settings.axiTheme).toBe('default');
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
        expect(settings.axiTheme).toBe('glass');
        expect(settings.glass).toBeUndefined();
        expect(settings.glassSurfaces).toBeUndefined();
        expect(settings.glassmorphic).toBeUndefined();
        expect(settings.axiDesign).toBeUndefined();
    });

    it('collapses glassmorphic alone', () => {
        const settings: Record<string, any> = { glassmorphic: true };
        normalizeImportedSettings(settings);
        expect(settings.axiTheme).toBe('glass');
    });

    it('maps a legacy uiTheme to its palette and theme', () => {
        // dark-glass is the one legacy theme LEGACY_THEME_TO_PALETTE marks glass: true.
        const settings: Record<string, any> = { uiTheme: 'dark-glass' };
        normalizeImportedSettings(settings);
        expect(settings.colorPalette).toBe('electric-blue');
        expect(settings.axiTheme).toBe('glass');
        expect(settings.uiTheme).toBeUndefined();
    });

    // Review Focus 2, restated: collapseGlassKeys already fabricates a theme when
    // neither legacy boolean is true and no theme key is present — this is existing
    // behaviour (see 'writes the main theme for a file that carries neither' above),
    // not something normalizeImportedSettings changes or fixes.
    it('lands on the main theme for a file with none of the legacy keys', () => {
        const settings: Record<string, any> = { colorPalette: 'slate-silver' };
        normalizeImportedSettings(settings);
        expect(settings.axiTheme).toBe('default');
    });
});

describe('normalizeImportedSettings: legacy favourites', () => {
    it('turns githubFavoriteRepos into githubSites and drops the key', () => {
        const settings: Record<string, any> = { githubRepoOwner: 'guild', githubRepoName: 'site', githubFavoriteRepos: ['x/y', 'bad'] };
        normalizeImportedSettings(settings);
        expect(settings).not.toHaveProperty('githubFavoriteRepos');
        expect(settings.githubSites.map((x: any) => `${x.owner}/${x.repo}`)).toEqual(['guild/site', 'x/y']);
    });
    it('keeps an existing githubSites and still drops the favourites', () => {
        const sites = [{ owner: 'a', repo: 'b', addedVia: 'manual', addedAt: '' }];
        const settings: Record<string, any> = { githubSites: sites, githubFavoriteRepos: ['x/y'] };
        normalizeImportedSettings(settings);
        expect(settings.githubSites).toBe(sites);
        expect(settings).not.toHaveProperty('githubFavoriteRepos');
    });
});
