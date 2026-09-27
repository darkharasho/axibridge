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

import { canonicalSkillId } from '@axiapps/bridge-metrics';
import { isPlaceholderSkillName } from './computeSkillUsageData';
import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';
import { resolveFightTimestamp } from './utils/timestampUtils';

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

/** Ids axilog cannot name from any source but that we can label ourselves. */
const SPECIAL_SKILL_NAMES: Record<number, string> = {
    23275: 'Dodge',
    [-28]: 'Death',
};

/** Shown when no curated name exists. A raw id is never user-facing. */
const UNKNOWN_SKILL_NAME = 'Unknown Skill';

export interface DecodedCast {
    skillId: number;
    name: string;
    icon?: string | number;
    /** Absolute ms from fight start. Negative means it began before the log did. */
    castTime: number;
    duration: number;
    interrupted: boolean;
}

export function ingestLogRotationTimeline(log: any, acc: RotationTimelineAccumulator): void {
    const details = log?.details;
    if (!details) return;
    const allPlayers = Array.isArray(details.players) ? details.players : [];
    const squadPlayers = allPlayers.filter((p: any) => !p?.notInSquad);
    if (squadPlayers.length === 0) return;
    const fightId = String(log?.filePath || log?.id || '');
    if (!fightId) return;
    const durationMs = Math.max(0, Number(details?.durationMS || 0));
    if (durationMs <= 0) return;

    const skillMap = details.skillMap || {};

    // Palette slots are allocated on first use, so indices are dense and the
    // common skills land on single-digit numbers.
    const palette: RotationSkill[] = [];
    const slotById = new Map<number, number>();
    const slotFor = (rawId: number): number => {
        const skillId = canonicalSkillId(details, rawId);
        const existing = slotById.get(skillId);
        if (existing !== undefined) return existing;
        const entry = skillMap[`s${skillId}`];
        const mapped = entry?.name;
        const name = isPlaceholderSkillName(mapped, skillId)
            ? (SPECIAL_SKILL_NAMES[skillId] || UNKNOWN_SKILL_NAME)
            : String(mapped);
        const skill: RotationSkill = { id: skillId, name };
        if (entry?.icon) skill.icon = entry.icon;
        const slot = palette.length;
        palette.push(skill);
        slotById.set(skillId, slot);
        return slot;
    };

    const players: RotationPlayerData[] = [];

    squadPlayers.forEach((p: any) => {
        const rotation = Array.isArray(p?.rotation) ? p.rotation : [];
        // Flatten EI's group-by-skill nesting into one time-ordered list.
        // The source is NOT globally sorted; delta encoding requires it.
        const flat: Array<{ slot: number; castTime: number; duration: number; interrupted: boolean }> = [];
        rotation.forEach((rot: any) => {
            if (!rot?.id) return;
            const skills = Array.isArray(rot.skills) ? rot.skills : [];
            if (skills.length === 0) return;
            const slot = slotFor(Number(rot.id));
            skills.forEach((s: any) => {
                const castTime = Number(s?.castTime || 0);
                const duration = Number(s?.duration || 0);
                flat.push({
                    slot, castTime, duration,
                    // EI marks an interrupted/cancelled cast by giving back
                    // exactly the time it would have taken.
                    interrupted: Number(s?.timeGained) === -duration,
                });
            });
        });
        if (flat.length === 0) return;
        flat.sort((a, b) => a.castTime - b.castTime);

        const skill: number[] = [];
        const dt: number[] = [];
        const dur: number[] = [];
        const interrupted: number[] = [];
        let prev = 0;
        flat.forEach((cast, i) => {
            skill.push(cast.slot);
            dt.push(i === 0 ? cast.castTime : cast.castTime - prev);
            prev = cast.castTime;
            dur.push(cast.duration);
            if (cast.interrupted) interrupted.push(i);
        });

        const account = String(p?.account || p?.name || 'Unknown');
        const profession = String(p?.profession || 'Unknown');
        players.push({
            key: `${account}|${profession}`,
            displayName: String(p?.name || account),
            profession,
            group: Number(p?.group || 0),
            activeMs: Number(Array.isArray(p?.activeTimes) ? p.activeTimes[0] : 0) || 0,
            skill, dt, dur, interrupted,
        });
    });

    // A fight nobody cast in carries no information; omitting it keeps the
    // picker honest instead of offering an empty husk.
    if (players.length === 0) return;

    acc.recorded = true;
    acc.fights.push({
        id: fightId,
        label: buildFightLabelV2({
            zone: details.fightName || log?.fightName || `Fight ${acc.fights.length + 1}`,
            durationMs,
            avgPosition: computeFightAvgPosition(details),
        }),
        durationMs,
        palette,
        players,
        timestampMs: resolveFightTimestamp(details, log),
    });
}

/**
 * Expands one player's delta arrays back into absolute casts, in time order.
 * The only inverse of the encoding above; nothing outside this module should
 * read `dt`/`skill`/`interrupted` directly.
 */
export function decodeRotation(
    fight: RotationFightData, player: RotationPlayerData,
): DecodedCast[] {
    if (!fight || !player) return [];
    const interrupted = new Set(player.interrupted || []);
    const out: DecodedCast[] = [];
    let t = 0;
    for (let i = 0; i < player.skill.length; i++) {
        t = i === 0 ? player.dt[i] : t + player.dt[i];
        const entry = fight.palette[player.skill[i]];
        out.push({
            skillId: entry?.id ?? 0,
            name: entry?.name || UNKNOWN_SKILL_NAME,
            icon: entry?.icon,
            castTime: t,
            duration: player.dur[i],
            interrupted: interrupted.has(i),
        });
    }
    return out;
}
