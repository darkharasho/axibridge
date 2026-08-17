import { buildNativeMovement, positionAt } from '../../shared/movementData';
import { getDistanceScalars, NO_DISTANCE } from '@axiapps/bridge-metrics/nativePositioning';
import { squadEntities } from '@axiapps/bridge-metrics/nativeRoster';

export type DistanceContributionSource = 'replay' | 'fightAvg';

/** One player's contribution from a single fight. */
export type DistanceContribution = {
    account: string;
    profession: string;
    isCommander: boolean;
    fightId: string;
    source: DistanceContributionSource;
    /** When source==='replay': raw per-tick distance samples for this fight. */
    samples: number[];
    /** Per-fight mean distance (used in per-fight aggregation mode). */
    fightMean: number;
};

export type DistanceToTagRow = {
    account: string;
    profession: string;
    professionList: string[];
    fightCount: number;
    sampleCount: number;
    avg: number;
    p25: number;
    median: number;
    p75: number;
    p95: number;
    source: 'replay' | 'fightAvg' | 'mixed';
    isCommander: boolean;
};

export type DistanceToTagResult = {
    rows: DistanceToTagRow[];
    /** Number of distinct commander accounts across all fights. */
    commanderCount: number;
};

const finiteOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Per-fight distance-to-tag, read from axilog's native replay block.
 *
 * Distances are WORLD INCHES straight from the samples. The old EI path
 * computed `hypot(pixels) / combatReplayMetaData.inchToPixel`, and EI rounds
 * that scale to three decimals (0.009 against a true 0.0087193), so every
 * number this table showed read 3.12% short.
 *
 * Sample alignment is by TIMESTAMP. The old path re-derived each actor's first
 * poll as `floor(start / pollingRate)` where `ceil` is correct, shifting the
 * whole track one tick against the tag for anyone whose replay did not begin
 * on the polling grid — 36 of 42 players on the committed fixture.
 */
export const ingestLogDistanceToTag = (log: any, fightIndex: number): DistanceContribution[] => {
    const details = log?.details;
    const fightId = log?.filePath || `fight-${fightIndex}`;

    const squad = squadEntities(details?.native ?? {});
    if (squad.length === 0) return [];

    const movement = buildNativeMovement(details);
    const scalars = getDistanceScalars(details);
    const commander = squad.find((e: any) => {
        const c = (e as any)?.commander;
        return !!c && typeof c === 'object' && Array.isArray(c.segments) && c.segments.length > 0;
    });
    const tagTrack = commander && movement ? movement.tracks.get(commander.id) ?? null : null;

    const out: DistanceContribution[] = [];

    for (const entity of squad) {
        const account = entity?.account || 'Unknown';
        const profession = entity?.profession || 'Unknown';
        const isCommander = entity.id === commander?.id;

        const track = movement?.tracks.get(entity.id) ?? null;
        if (tagTrack && track && track.samples.length > 0) {
            const samples: number[] = [];
            for (const [t] of track.samples) {
                const p = positionAt(track, t);
                const tag = positionAt(tagTrack, t);
                if (!p || !tag) continue;
                samples.push(isCommander ? 0 : Math.hypot(p[0] - tag[0], p[1] - tag[1]));
            }
            if (samples.length > 0) {
                const fightMean = samples.reduce((s, v) => s + v, 0) / samples.length;
                out.push({ account, profession, isCommander, fightId, source: 'replay', samples, fightMean });
                continue;
            }
        }

        // Coarse mode: no tracks, but axilog's in-core `stack_dist` survives
        // `pruneDetailsForStats` and is already world inches.
        const stack = finiteOrNull(scalars.get(entity.id)?.stackDist);
        if (stack === null || stack === NO_DISTANCE) continue;
        out.push({
            account, profession, isCommander, fightId,
            source: 'fightAvg', samples: [], fightMean: stack,
        });
    }

    return out;
};

const median = (sortedAsc: number[]): number => {
    if (sortedAsc.length === 0) return 0;
    const n = sortedAsc.length;
    if (n % 2 === 1) return sortedAsc[(n - 1) / 2];
    return (sortedAsc[n / 2 - 1] + sortedAsc[n / 2]) / 2;
};

const nearestRankPercentile = (sortedAsc: number[], percentile: number): number => {
    if (sortedAsc.length === 0) return 0;
    const idx = Math.max(0, Math.ceil(percentile * sortedAsc.length) - 1);
    return sortedAsc[idx];
};

export const finalizeDistanceToTag = (contributions: DistanceContribution[]): DistanceToTagResult => {
    if (contributions.length === 0) return { rows: [], commanderCount: 0 };

    // Group contributions by account.
    const byAccount = new Map<string, DistanceContribution[]>();
    for (const c of contributions) {
        const list = byAccount.get(c.account);
        if (list) list.push(c);
        else byAccount.set(c.account, [c]);
    }

    // Identify commander accounts (any fight where they were commander).
    const commanderAccounts = new Set<string>();
    for (const [account, list] of byAccount) {
        if (list.some(c => c.isCommander)) commanderAccounts.add(account);
    }
    const commanderCount = commanderAccounts.size;
    const includeCommanders = commanderCount > 2;

    const rows: DistanceToTagRow[] = [];

    for (const [account, list] of byAccount) {
        const isCommander = commanderAccounts.has(account);
        if (isCommander && !includeCommanders) continue;

        const fightIds = new Set<string>();
        const sources = new Set<DistanceContributionSource>();
        for (const c of list) {
            fightIds.add(c.fightId);
            sources.add(c.source);
        }

        const sourceLabel: DistanceToTagRow['source'] =
            sources.size > 1 ? 'mixed' : (sources.has('replay') ? 'replay' : 'fightAvg');

        // Profession bookkeeping.
        const professionList = Array.from(new Set(list.map(c => c.profession).filter(p => p && p !== 'Unknown')));
        const profession = list[list.length - 1].profession;

        let values: number[];
        if (sourceLabel === 'replay') {
            // Pure replay: pool every sample.
            values = [];
            for (const c of list) {
                if (c.samples.length > 0) {
                    for (const s of c.samples) values.push(s);
                } else {
                    values.push(c.fightMean);
                }
            }
        } else {
            // fightAvg or mixed: per-fight values.
            values = list.map(c => c.fightMean);
        }

        if (values.length === 0) continue;

        const sorted = [...values].sort((a, b) => a - b);
        const avg = values.reduce((s, v) => s + v, 0) / values.length;

        rows.push({
            account,
            profession,
            professionList,
            fightCount: fightIds.size,
            sampleCount: values.length,
            avg: Math.round(avg),
            p25: Math.round(nearestRankPercentile(sorted, 0.25)),
            median: Math.round(median(sorted)),
            p75: Math.round(nearestRankPercentile(sorted, 0.75)),
            p95: Math.round(nearestRankPercentile(sorted, 0.95)),
            source: sourceLabel,
            isCommander,
        });
    }

    return { rows, commanderCount };
};

export const computeDistanceToTag = (sortedFightLogs: Array<{ log: any }>): DistanceToTagResult => {
    const all: DistanceContribution[] = [];
    sortedFightLogs.forEach(({ log }, idx) => {
        all.push(...ingestLogDistanceToTag(log, idx));
    });
    return finalizeDistanceToTag(all);
};
