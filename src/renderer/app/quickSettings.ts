import type { IEiParserSettings, IStatsViewSettings } from '../global.d';

/**
 * Everything a quick setting needs to read and write itself.
 *
 * The two backing stores persist differently — EI parser settings are written
 * one key at a time over `ei:save-settings`, while stats view settings are
 * saved as a whole object through `saveSettings` — so both setters here are
 * expected to be *persisting* setters supplied by App, not raw React state
 * setters. Descriptors stay pure routing; where a value lands is App's problem.
 */
/**
 * R2 hosting state, or null while it is still being read from the main process.
 *
 * `credentialsPresent` is deliberately independent of `enabled` — the row is
 * shown only when R2 is set up, and if switching it off also hid the row there
 * would be no way to switch it back on.
 */
export interface QuickR2Hosting {
    credentialsPresent: boolean;
    enabled: boolean;
}

export interface QuickSettingsContext {
    /** Null until `getEiSettings` resolves; EI-backed rows stay disabled meanwhile. */
    eiSettings: IEiParserSettings | null;
    setEiSetting: (key: keyof IEiParserSettings, value: boolean) => void;
    statsViewSettings: IStatsViewSettings;
    setStatsViewSettings: (next: IStatsViewSettings) => void;
    /** Null until the main process answers; the R2 row stays hidden meanwhile. */
    r2Hosting: QuickR2Hosting | null;
    setR2HostingEnabled: (value: boolean) => void;
}

export interface QuickSetting {
    id: string;
    label: string;
    hint?: string;
    /**
     * Only 'boolean' today. The field exists so a segmented control ('enum')
     * can be added later without reshaping every descriptor.
     */
    kind: 'boolean';
    read: (ctx: QuickSettingsContext) => boolean;
    write: (ctx: QuickSettingsContext, value: boolean) => void;
    /** False while this entry's backing store is still loading. */
    isReady: (ctx: QuickSettingsContext) => boolean;
    /**
     * Whether this setting applies at all. Defaults to always. Used to keep
     * rows that mean nothing for the current setup out of the card entirely,
     * rather than showing a permanently disabled switch.
     */
    isRelevant?: (ctx: QuickSettingsContext) => boolean;
}

const eiToggle = (
    key: Extract<keyof IEiParserSettings, 'parseCombatReplay' | 'anonymous'>,
    label: string,
    hint: string,
): QuickSetting => ({
    id: key,
    label,
    hint,
    kind: 'boolean',
    read: (ctx) => Boolean(ctx.eiSettings?.[key]),
    write: (ctx, value) => ctx.setEiSetting(key, value),
    isReady: (ctx) => ctx.eiSettings !== null,
});

const statsViewToggle = (
    key: Extract<keyof IStatsViewSettings, 'noEgoMode' | 'splitPlayersByClass'>,
    label: string,
    hint: string,
): QuickSetting => ({
    id: key,
    label,
    hint,
    kind: 'boolean',
    read: (ctx) => Boolean(ctx.statsViewSettings[key]),
    write: (ctx, value) => ctx.setStatsViewSettings({ ...ctx.statsViewSettings, [key]: value }),
    isReady: () => true,
});

/**
 * The toggles surfaced on the dashboard, below the Session card.
 *
 * Deliberately short: these are the settings worth flipping between runs, not
 * a mirror of the Settings view. Adding one is a single entry here — the card
 * renders whatever this list holds and knows nothing about individual keys.
 */
export const QUICK_SETTINGS: QuickSetting[] = [
    eiToggle(
        'parseCombatReplay',
        'Combat Replay',
        'Keep per-player position data. Required for Map Replay; off shrinks each log considerably.',
    ),
    eiToggle(
        'anonymous',
        'Anonymize Players',
        'Replace account names with placeholders at parse time.',
    ),
    statsViewToggle(
        'noEgoMode',
        'No Ego Mode',
        'Hide MVP and rankings; show squad averages and spread instead.',
    ),
    statsViewToggle(
        'splitPlayersByClass',
        'Split Players by Class',
        'One row per class instead of combining each player.',
    ),
    {
        id: 'r2HostingEnabled',
        label: 'Host Replay on R2',
        hint: 'Upload replay and fight slice data to Cloudflare R2. Off publishes to GitHub Pages alone, '
            + 'without the map replay or per-fight slicing.',
        kind: 'boolean',
        read: (ctx) => Boolean(ctx.r2Hosting?.enabled),
        write: (ctx, value) => ctx.setR2HostingEnabled(value),
        isReady: (ctx) => ctx.r2Hosting !== null,
        isRelevant: (ctx) => Boolean(ctx.r2Hosting?.credentialsPresent),
    },
];
