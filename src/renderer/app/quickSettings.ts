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
export interface QuickSettingsContext {
    /** Null until `getEiSettings` resolves; EI-backed rows stay disabled meanwhile. */
    eiSettings: IEiParserSettings | null;
    setEiSetting: (key: keyof IEiParserSettings, value: boolean) => void;
    statsViewSettings: IStatsViewSettings;
    setStatsViewSettings: (next: IStatsViewSettings) => void;
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
];
