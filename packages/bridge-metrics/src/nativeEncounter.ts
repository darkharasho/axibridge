import type { NativeReportLike } from './nativeRoster';

/**
 * Encounter-block readers.
 *
 * Every reader takes the EI details object and reaches through `.native`, so
 * call sites migrate by swapping one expression rather than by re-plumbing the
 * details flow. They return `null` — never `0`, `''` or a default — when the
 * fact is absent, so callers keep their own fallback and no absent value is
 * ever mistaken for a measured one.
 */
export interface NativeEncounterLike {
    map?: unknown;
    duration_ms?: unknown;
    started_at_unix?: unknown;
    kind?: unknown;
    teams?: Array<{ team_id?: unknown; color?: unknown }>;
}

export const getNativeReport = (details: any): NativeReportLike | null => {
    const native = details?.native;
    return native && typeof native === 'object' ? (native as NativeReportLike) : null;
};

const encounterOf = (details: any): NativeEncounterLike | null => {
    const enc = (getNativeReport(details) as any)?.encounter;
    return enc && typeof enc === 'object' ? (enc as NativeEncounterLike) : null;
};

const finiteOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

export const getEncounterDurationMs = (details: any): number | null =>
    finiteOrNull(encounterOf(details)?.duration_ms);

export const getEncounterZone = (details: any): string | null => {
    const map = encounterOf(details)?.map;
    if (typeof map !== 'string') return null;
    const trimmed = map.trim();
    return trimmed.length > 0 ? trimmed : null;
};

export const getEncounterStartMs = (details: any): number | null => {
    const started = finiteOrNull(encounterOf(details)?.started_at_unix);
    return started === null ? null : started * 1000;
};

export const getEncounterEndMs = (details: any): number | null => {
    const start = getEncounterStartMs(details);
    if (start === null) return null;
    return start + (getEncounterDurationMs(details) ?? 0);
};

/**
 * `encounter.teams` is authoritative per log — it comes from the same arcdps
 * team statechange EI exposes as `wvWMapData`, but keyed by colour directly,
 * so no id-table guessing is needed. The `unknown`-coloured team (id 0) is
 * present in every log and is not a team; it is dropped rather than given a
 * slot.
 */
export const getEncounterTeamMap = (details: any): { red: number; green: number; blue: number } | null => {
    const teams = encounterOf(details)?.teams;
    if (!Array.isArray(teams)) return null;
    const out = { red: 0, green: 0, blue: 0 };
    for (const team of teams) {
        const id = finiteOrNull(team?.team_id);
        const color = typeof team?.color === 'string' ? team.color : '';
        if (id === null || id <= 0) continue;
        if (color === 'red' || color === 'green' || color === 'blue') out[color] = id;
    }
    return out;
};
