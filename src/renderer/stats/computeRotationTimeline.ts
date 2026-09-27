/**
 * Per-fight precomputed per-cast rotation for the Rotation section.
 *
 * Like `computeControlTimeline`, this must run during aggregation so the web
 * report — which has no log details at render time — can still draw it.
 *
 * The wire shape is columnar and delta-encoded on purpose. Verbatim EI
 * rotation measures ~70 bytes/cast: one 3m18s / 53-player fight is 405 KB
 * minified, which is ~8 MB for a 20-fight session against a ~38 MB GitHub
 * blob ceiling and a `report.json` that is already ~31 MB. The encoding
 * below is ~12 bytes/cast. `decodeRotation` is its only inverse; nothing
 * outside this module reads the raw arrays.
 */

/**
 * One palette entry. `icon` is spelled exactly that, on an object, because
 * the published-report build indexes icon URLs by walking `stats` for keys
 * literally named `icon` (`githubHandlers.ts`) and `expandIconIndex`
 * reverses it the same way. A parallel `icons: string[]` would silently miss
 * both passes and ship ~84 raw CDN chars per palette entry per fight.
 */
export interface RotationSkill {
    id: number;
    name: string;
    /** A number in a published report, expanded back to a URL on read. */
    icon?: string | number;
}

export interface RotationPlayerData {
    /** `${account}|${profession}`, matching `computeSkillUsageData`. */
    key: string;
    displayName: string;
    profession: string;
    group: number;
    /** `activeTimes[0]`, for cast density. */
    activeMs: number;
    /** Palette indices, one per cast, in cast-time order. */
    skill: number[];
    /** Cast times: `dt[0]` absolute (may be negative), the rest deltas. */
    dt: number[];
    /** Cast durations, ms. */
    dur: number[];
    /** Sparse ascending indices into the arrays above. */
    interrupted: number[];
}

export interface RotationFightData {
    id: string;
    /**
     * Human fight label, built here rather than in the section because the
     * web report has lost the zone and average position it derives from.
     */
    label: string;
    durationMs: number;
    palette: RotationSkill[];
    players: RotationPlayerData[];
    /** Fight start, for chronological ordering. */
    timestampMs?: number;
}

export interface RotationTimelineAccumulator {
    fights: RotationFightData[];
    /**
     * False until one ingested log carried rotation data. Lets the UI tell
     * "this history predates axilog / was parsed with rotation off" apart
     * from "the upload trimmer dropped this", which look identical
     * otherwise.
     */
    recorded: boolean;
}

export type RotationTimelineFrame = RotationTimelineAccumulator;

export function createRotationTimelineAccumulator(): RotationTimelineAccumulator {
    return { fights: [], recorded: false };
}
