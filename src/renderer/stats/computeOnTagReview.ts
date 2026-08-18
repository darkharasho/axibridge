/**
 * "On Tag Review" — classifies every squad death by distance to the commander
 * tag, mirroring GW2_EI_log_combiner's table (On_Tag = 600, Run_Back = 5000):
 *   On-Tag ≤ 600 · Off-Tag ≤ 5000 (range recorded) · Run-Back > 5000.
 * After-Tag is an overlay count (subset of Total) for downs that started after
 * the tag's first death in that fight.
 */
import { buildNativeMovement, positionAt, positionAtOrBefore } from '../../shared/movementData';
import { getDistanceScalars } from '@axiapps/bridge-metrics/nativePositioning';
import { getEntityProfession, squadEntities } from '@axiapps/bridge-metrics/nativeRoster';

export const ON_TAG_RANGE = 600;
export const RUN_BACK_RANGE = 5000;

export type OnTagDeath = {
    range: number;
    afterTag: boolean;
};

/** One player's contribution from a single fight. */
export type OnTagReviewContribution = {
    account: string;
    profession: string;
    isCommander: boolean;
    fightId: string;
    /** Mean distance to tag while alive and before the tag died; null if unknown. */
    avgDist: number | null;
    deaths: OnTagDeath[];
};

export type OnTagReviewRow = {
    account: string;
    profession: string;
    professionList: string[];
    fightCount: number;
    avgDist: number | null;
    onTag: number;
    offTag: number;
    afterTag: number;
    runBack: number;
    total: number;
    offTagRanges: number[];
    isCommander: boolean;
};

export type OnTagReviewResult = {
    rows: OnTagReviewRow[];
    usableFightCount: number;
};

const isCommanderEntity = (e: any): boolean => {
    const c = e?.commander;
    return !!c && typeof c === 'object' && Array.isArray(c.segments) && c.segments.length > 0;
};

/** `blocks.replay.by_entity[id].dead` — present even without `--replay`. */
const deadIntervals = (details: any, entityId: number): Array<[number, number]> => {
    const raw = details?.native?.blocks?.replay?.by_entity?.[entityId]?.dead;
    if (!Array.isArray(raw)) return [];
    return raw.filter((e: any) => Array.isArray(e) && Number.isFinite(Number(e[0]))) as Array<[number, number]>;
};

const coarseDistToCom = (scalars: Map<number, { distToCom: number | null }>, id: number): number | null => {
    const v = scalars.get(id)?.distToCom;
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= RUN_BACK_RANGE ? v : null;
};

export const ingestLogOnTagReview = (log: any, fightIndex: number): OnTagReviewContribution[] => {
    const details = log?.details;
    const fightId = log?.filePath || `fight-${fightIndex}`;

    const squad = squadEntities(details?.native ?? {});
    if (squad.length === 0) return [];

    const movement = buildNativeMovement(details);
    const scalars = getDistanceScalars(details);
    const commander = squad.find(isCommanderEntity);
    const tagTrack = commander && movement ? movement.tracks.get(commander.id) ?? null : null;
    if (!commander || !movement || !tagTrack || tagTrack.samples.length === 0) return [];

    // Tag death = first dead interval starting after fight start. Compared as a
    // TIMESTAMP; the old path converted it to a poll index and compared indices,
    // which mixed two different derivations of the same instant.
    const tagDeaths = deadIntervals(details, commander.id).filter(([t]) => t > 0);
    const tagDied = tagDeaths.length > 0;
    const tagDeathMs = tagDied ? tagDeaths[0][0] : Infinity;

    const out: OnTagReviewContribution[] = [];

    for (const entity of squad) {
        const account = entity?.account || 'Unknown';
        // EI's `profession` is native's `elite_spec`, which is what the icon
        // and colour lookups are keyed on. `getEntityProfession` applies that;
        // reading `entity.profession` here yields the BASE class, so the row
        // rendered an Elementalist icon for a Tempest.
        const profession = getEntityProfession(entity) || 'Unknown';
        const isCommanderPlayer = entity.id === commander.id;

        const track = movement.tracks.get(entity.id) ?? null;

        const deaths: OnTagDeath[] = [];
        let firstDeathMs = Infinity;

        if (track && track.samples.length > 0) {
            for (const [deathMs] of deadIntervals(details, entity.id)) {
                if (deathMs < 0) continue;
                // A death is an arcdps timestamp, not a poll instant.
                const p = positionAtOrBefore(track, deathMs, movement.pollMs);
                const tag = positionAtOrBefore(tagTrack, deathMs, movement.pollMs);
                if (!p || !tag) continue;
                const range = isCommanderPlayer ? 0 : Math.round(Math.hypot(p[0] - tag[0], p[1] - tag[1]));
                deaths.push({ range, afterTag: tagDied && deathMs > tagDeathMs });
                firstDeathMs = Math.min(firstDeathMs, deathMs);
            }
        }

        // Avg distance to tag over the samples before the player's first death
        // and the tag's death — "how far from tag while it mattered".
        let avgDist: number | null = null;
        if (track && track.samples.length > 0) {
            const limitMs = Math.min(firstDeathMs, tagDeathMs);
            let sum = 0;
            let count = 0;
            for (const [t] of track.samples) {
                if (t >= limitMs) break;
                const p = positionAt(track, t);
                const tag = positionAt(tagTrack, t);
                if (!p || !tag) continue;
                sum += isCommanderPlayer ? 0 : Math.hypot(p[0] - tag[0], p[1] - tag[1]);
                count++;
            }
            if (count > 0) {
                const mean = sum / count;
                if (mean <= RUN_BACK_RANGE) avgDist = mean;
            }
        }
        if (avgDist === null) avgDist = coarseDistToCom(scalars, entity.id);

        // Nothing measurable this fight — skip so the player doesn't get a hollow row.
        if (deaths.length === 0 && avgDist === null) continue;

        out.push({ account, profession, isCommander: isCommanderPlayer, fightId, avgDist, deaths });
    }

    return out;
};

export const finalizeOnTagReview = (contributions: OnTagReviewContribution[]): OnTagReviewResult => {
    if (contributions.length === 0) return { rows: [], usableFightCount: 0 };

    const byAccount = new Map<string, OnTagReviewContribution[]>();
    const allFightIds = new Set<string>();
    for (const c of contributions) {
        allFightIds.add(c.fightId);
        const list = byAccount.get(c.account);
        if (list) list.push(c);
        else byAccount.set(c.account, [c]);
    }

    const rows: OnTagReviewRow[] = [];

    for (const [account, list] of byAccount) {
        const fightIds = new Set<string>();
        let onTag = 0;
        let offTag = 0;
        let afterTag = 0;
        let runBack = 0;
        const offTagRanges: number[] = [];
        const avgValues: number[] = [];

        for (const c of list) {
            fightIds.add(c.fightId);
            if (c.avgDist !== null) avgValues.push(c.avgDist);
            for (const d of c.deaths) {
                if (d.afterTag) afterTag++;
                if (d.range <= ON_TAG_RANGE) onTag++;
                else if (d.range <= RUN_BACK_RANGE) {
                    offTag++;
                    offTagRanges.push(d.range);
                } else runBack++;
            }
        }

        const professionList = Array.from(new Set(list.map(c => c.profession).filter(p => p && p !== 'Unknown')));
        const avgDist = avgValues.length > 0
            ? Math.round(avgValues.reduce((s, v) => s + v, 0) / avgValues.length)
            : null;

        rows.push({
            account,
            profession: list[list.length - 1].profession,
            professionList,
            fightCount: fightIds.size,
            avgDist,
            onTag,
            offTag,
            afterTag,
            runBack,
            total: onTag + offTag + runBack,
            offTagRanges: offTagRanges.sort((a, b) => b - a),
            isCommander: list.some(c => c.isCommander),
        });
    }

    rows.sort((a, b) => (b.total - a.total) || a.account.localeCompare(b.account));

    return { rows, usableFightCount: allFightIds.size };
};

export const computeOnTagReview = (sortedFightLogs: Array<{ log: any }>): OnTagReviewResult => {
    const all: OnTagReviewContribution[] = [];
    sortedFightLogs.forEach(({ log }, idx) => {
        all.push(...ingestLogOnTagReview(log, idx));
    });
    return finalizeOnTagReview(all);
};
