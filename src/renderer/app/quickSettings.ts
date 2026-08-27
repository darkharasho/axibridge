import type { IParserSettings, IStatsViewSettings } from '../global.d';

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
 * `credentialsPresent` is deliberately independent of the two enabled flags —
 * the rows are shown only when R2 is connected, and if switching one off also
 * hid its row there would be no way to switch it back on.
 *
 * Replay and slice are separate R2 objects written by separate codepaths, so
 * each carries its own flag rather than sharing one "hosting" switch.
 */
export interface QuickR2Hosting {
    credentialsPresent: boolean;
    replayEnabled: boolean;
    sliceEnabled: boolean;
}

export interface QuickSettingsContext {
    /** Null until `getEiSettings` resolves; EI-backed rows stay disabled meanwhile. */
    parserSettings: IParserSettings | null;
    setParserSetting: (key: keyof IParserSettings, value: boolean) => void;
    statsViewSettings: IStatsViewSettings;
    setStatsViewSettings: (next: IStatsViewSettings) => void;
    /** Null until the main process answers; the R2 rows stay hidden meanwhile. */
    r2Hosting: QuickR2Hosting | null;
    setR2ReplayEnabled: (value: boolean) => void;
    setR2SliceEnabled: (value: boolean) => void;
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

const parserToggle = (
    key: Extract<keyof IParserSettings, 'parseCombatReplay'>,
    label: string,
    hint: string,
): QuickSetting => ({
    id: key,
    label,
    hint,
    kind: 'boolean',
    read: (ctx) => Boolean(ctx.parserSettings?.[key]),
    write: (ctx, value) => ctx.setParserSetting(key, value),
    isReady: (ctx) => ctx.parserSettings !== null,
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
    parserToggle(
        'parseCombatReplay',
        'Combat Replay',
        'Keep per-player position data. Required for Map Replay; off shrinks each log considerably.',
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
        // Keyed to `r2HostingEnabled`, the original single toggle. It always
        // said "replay" on the tin; now it only does replay.
        id: 'r2HostingEnabled',
        label: 'Host Replay on R2',
        hint: 'Upload map replay data to Cloudflare R2. Off publishes the replay to GitHub Pages instead, '
            + 'where it is dropped if too large.',
        kind: 'boolean',
        read: (ctx) => Boolean(ctx.r2Hosting?.replayEnabled),
        write: (ctx, value) => ctx.setR2ReplayEnabled(value),
        isReady: (ctx) => ctx.r2Hosting !== null,
        isRelevant: (ctx) => Boolean(ctx.r2Hosting?.credentialsPresent),
    },
    {
        id: 'r2SliceEnabled',
        label: 'Host Fight Slices on R2',
        hint: 'Upload per-fight slice data to Cloudflare R2, so a published report can be filtered by fight. '
            + 'Off publishes the report without the slicer — slice data is never written to GitHub Pages.',
        kind: 'boolean',
        read: (ctx) => Boolean(ctx.r2Hosting?.sliceEnabled),
        write: (ctx, value) => ctx.setR2SliceEnabled(value),
        isReady: (ctx) => ctx.r2Hosting !== null,
        isRelevant: (ctx) => Boolean(ctx.r2Hosting?.credentialsPresent),
    },
];
