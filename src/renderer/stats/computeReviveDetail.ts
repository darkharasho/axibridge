import {
    DEATH_MATCH_TOLERANCE_MS, deriveReviveLogSummary, reviveePlayerKey, type RevivePlayerCounts,
} from '@axiapps/bridge-metrics';
import { REVIVE_RE_DOWN_BUCKETS_MS } from './statsTypes';
import type { ReviveDetailFrame, ReviveDetailSummary, ReviveUtilityCasterRow } from './statsTypes';

/** A down shorter than this that ends in death is arcdps recording a player who
 *  skipped the downed state — under Illusion of Life, the buff running out or
 *  being killed through. A real downed state lasts seconds; across 400 real
 *  logs every such death after an IoL stand-up was under 50ms. */
const INSTANT_DEATH_MAX_DOWN_MS = 250;

const intervals = (value: unknown): number[][] =>
    (Array.isArray(value) ? value : []).filter((entry): entry is number[] => Array.isArray(entry) && entry.length >= 2);

interface ReviveDetailPlayer extends RevivePlayerCounts {
    account: string;
    profession: string;
    /** Active time over the covered logs this player appeared in. Accumulated
     *  here, under the same key as the counts, so the rate denominator and the
     *  numerators can never drift onto two key conventions. */
    activeMs: number;
}

interface ReviveDetailUtility {
    name: string;
    icon: string | null;
    casts: number;
    revives: number;
    /** Per-caster casts AND revives. Both are needed: the expansion shows each
     *  caster's revives per cast, and a caster who never landed one still has
     *  to appear so the per-caster casts sum to the row's cast count. */
    byCaster: Map<string, { casts: number; revives: number }>;
}

/** Sums two per-caster maps into `target`, creating rows as needed. Shared by
 *  the ingest and frame-merge paths so they cannot drift apart. */
const mergeCasters = (
    target: ReviveDetailUtility,
    source: Map<string, { casts: number; revives: number }>
): void => {
    source.forEach((counts, caster) => {
        let entry = target.byCaster.get(caster);
        if (!entry) { entry = { casts: 0, revives: 0 }; target.byCaster.set(caster, entry); }
        entry.casts += counts.casts;
        entry.revives += counts.revives;
    });
};

export interface ReviveDetailAccumulator {
    logsWithData: number;
    logsWithoutData: number;
    squad: {
        downs: number;
        recovered: number;
        died: number;
        hand: number;
        utility: number;
        self: number;
        unattributed: number;
    };
    players: Map<string, ReviveDetailPlayer>;
    utilities: Map<number, ReviveDetailUtility>;
    iol: { revives: number; survived: number; reDowned: number; diedUnderIol: number; timesToReDownMs: number[] };
}

export function createReviveDetailAccumulator(): ReviveDetailAccumulator {
    return {
        logsWithData: 0,
        logsWithoutData: 0,
        squad: { downs: 0, recovered: 0, died: 0, hand: 0, utility: 0, self: 0, unattributed: 0 },
        players: new Map(),
        utilities: new Map(),
        iol: { revives: 0, survived: 0, reDowned: 0, diedUnderIol: 0, timesToReDownMs: [] },
    };
}

export function ingestLogReviveDetail(log: any, acc: ReviveDetailAccumulator): void {
    const details = log?.details;
    const summary = deriveReviveLogSummary(details);

    // An uncovered log contributes NO zeros to any counter — it is absent data,
    // not evidence that nobody was revived.
    if (!summary.hasData) {
        acc.logsWithoutData += 1;
        return;
    }
    acc.logsWithData += 1;

    acc.squad.downs += summary.downs;
    acc.squad.recovered += summary.recovered;
    acc.squad.died += summary.died;
    for (const kind of ['hand', 'utility', 'self', 'unattributed'] as const) {
        acc.squad[kind] += summary.byKind[kind];
    }

    summary.players.forEach((counts, key) => {
        let row = acc.players.get(key);
        if (!row) {
            const [account, profession] = key.split('|');
            row = {
                account, profession, activeMs: 0, attempts: 0, attemptTimeMs: 0, handRevives: 0,
                utilityCasts: 0, utilityRevives: 0, selfRevives: 0, assists: 0,
            };
            acc.players.set(key, row);
        }
        row.attempts += counts.attempts;
        row.attemptTimeMs += counts.attemptTimeMs;
        row.handRevives += counts.handRevives;
        row.utilityCasts += counts.utilityCasts;
        row.utilityRevives += counts.utilityRevives;
        row.selfRevives += counts.selfRevives;
        row.assists += counts.assists;
    });

    summary.utilities.forEach((utility, skillId) => {
        let row = acc.utilities.get(skillId);
        if (!row) {
            row = { name: utility.name, icon: utility.icon, casts: 0, revives: 0, byCaster: new Map() };
            acc.utilities.set(skillId, row);
        }
        // A log parsed without a skill map contributes no icon; a later log that
        // has one fills it in rather than leaving the row iconless forever.
        if (!row.icon && utility.icon) row.icon = utility.icon;
        row.casts += utility.casts;
        row.revives += utility.revives;
        mergeCasters(row, utility.byCaster);
    });

    const roster = Array.isArray(details?.players) ? details.players : [];

    // Per-player active time for the rate toggle. Only covered logs contribute,
    // matching the counts above: a log excluded from the numerators must be
    // excluded from the denominator too. Mirrors computePlayerAggregation's
    // definition of active time (activeTimes[0], else the fight duration).
    for (const player of roster) {
        if (player?.notInSquad) continue;
        const row = acc.players.get(reviveePlayerKey(player));
        if (!row) continue;
        const activeMs = Array.isArray(player?.activeTimes) && typeof player.activeTimes[0] === 'number'
            ? Number(player.activeTimes[0] || 0)
            : Number(details?.durationMS || 0);
        row.activeMs += Math.max(0, activeMs);
    }

    for (const revive of summary.iolRevives) {
        acc.iol.revives += 1;
        const replay = roster[revive.playerIndex]?.combatReplayData;
        const next = intervals(replay?.down)
            .filter(([start]) => start > revive.at)
            .sort((a, b) => a[0] - b[0])[0];
        if (next === undefined) {
            acc.iol.survived += 1;
            continue;
        }
        const [downStart, downEnd] = next;
        const diedInstantly = downEnd - downStart < INSTANT_DEATH_MAX_DOWN_MS
            && intervals(replay?.dead).some(([deadStart]) => Math.abs(deadStart - downEnd) <= DEATH_MATCH_TOLERANCE_MS);
        if (diedInstantly) acc.iol.diedUnderIol += 1;
        else {
            acc.iol.reDowned += 1;
            acc.iol.timesToReDownMs.push(downStart - revive.at);
        }
    }
}

const median = (values: number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

/**
 * Counts each time-to-re-down into `REVIVE_RE_DOWN_BUCKETS_MS` — one bucket per
 * boundary (upper bound exclusive) plus a trailing unbounded bucket, so the
 * result always sums to the number of re-downs.
 */
const bucketTimes = (values: number[]): number[] => {
    const buckets = new Array(REVIVE_RE_DOWN_BUCKETS_MS.length + 1).fill(0);
    for (const value of values) {
        const index = REVIVE_RE_DOWN_BUCKETS_MS.findIndex((bound) => value < bound);
        buckets[index === -1 ? REVIVE_RE_DOWN_BUCKETS_MS.length : index] += 1;
    }
    return buckets;
};

/**
 * `null` means "no measurement", not "zero revives". An accumulator that saw no
 * logs at all (e.g. a viewer that merged frames from an older sidecar which
 * carried no `reviveDetail` section) has nothing to report, and rendering it as
 * "Downs 0 · Recovered 0" would fabricate exactly the zero this whole module
 * exists to avoid. The section already renders a null summary as "no data".
 */
export function finalizeReviveDetail(acc: ReviveDetailAccumulator): ReviveDetailSummary | null {
    if (acc.logsWithData + acc.logsWithoutData === 0) return null;

    const players = Array.from(acc.players.entries()).map(([key, row]) => ({
        key,
        account: row.account,
        profession: row.profession,
        activeMs: row.activeMs,
        attempts: row.attempts,
        attemptTimeMs: row.attemptTimeMs,
        handRevives: row.handRevives,
        successRate: row.attempts > 0 ? row.handRevives / row.attempts : 0,
        utilityCasts: row.utilityCasts,
        utilityRevives: row.utilityRevives,
        revivesPerCast: row.utilityCasts > 0 ? row.utilityRevives / row.utilityCasts : 0,
        assists: row.assists,
        totalRevives: row.handRevives + row.utilityRevives,
    })).sort((a, b) => b.totalRevives - a.totalRevives);

    const utilities = Array.from(acc.utilities.entries()).map(([skillId, row]) => {
        let topCasterKey: string | null = null;
        let topCount = 0;
        const casters: ReviveUtilityCasterRow[] = [];
        row.byCaster.forEach((counts, caster) => {
            if (counts.revives > topCount) {
                topCount = counts.revives;
                topCasterKey = caster;
            }
            const [account, profession] = caster.split('|');
            casters.push({
                key: caster,
                account,
                profession,
                casts: counts.casts,
                revives: counts.revives,
                revivesPerCast: counts.casts > 0 ? counts.revives / counts.casts : 0,
            });
        });
        casters.sort((a, b) => (b.revives - a.revives) || (b.casts - a.casts));
        return {
            skillId,
            name: row.name,
            icon: row.icon,
            casts: row.casts,
            revives: row.revives,
            revivesPerCast: row.casts > 0 ? row.revives / row.casts : 0,
            topCasterKey,
            casters,
        };
    }).sort((a, b) => b.revives - a.revives);

    return {
        coverage: { logsWithData: acc.logsWithData, logsWithoutData: acc.logsWithoutData },
        squad: { ...acc.squad },
        players,
        utilities,
        iol: acc.iol.revives > 0
            ? {
                revives: acc.iol.revives,
                survived: acc.iol.survived,
                reDowned: acc.iol.reDowned,
                diedUnderIol: acc.iol.diedUnderIol,
                medianTimeToReDownMs: median(acc.iol.timesToReDownMs),
                timeToReDownBuckets: bucketTimes(acc.iol.timesToReDownMs),
            }
            : null,
    };
}

export function extractReviveDetailFrame(acc: ReviveDetailAccumulator): ReviveDetailFrame {
    const totalLogs = acc.logsWithData + acc.logsWithoutData;
    if (totalLogs !== 1) {
        throw new Error(`extractReviveDetailFrame expects exactly one log, got ${totalLogs}`);
    }
    return { acc };
}

export function mergeReviveDetailFrame(target: ReviveDetailAccumulator, frame: ReviveDetailFrame): void {
    const source = frame.acc;

    target.logsWithData += source.logsWithData;
    target.logsWithoutData += source.logsWithoutData;

    target.squad.downs += source.squad.downs;
    target.squad.recovered += source.squad.recovered;
    target.squad.died += source.squad.died;
    target.squad.hand += source.squad.hand;
    target.squad.utility += source.squad.utility;
    target.squad.self += source.squad.self;
    target.squad.unattributed += source.squad.unattributed;

    source.players.forEach((sourceRow, key) => {
        let row = target.players.get(key);
        if (!row) {
            target.players.set(key, { ...sourceRow });
            return;
        }
        row.activeMs += sourceRow.activeMs;
        row.attempts += sourceRow.attempts;
        row.attemptTimeMs += sourceRow.attemptTimeMs;
        row.handRevives += sourceRow.handRevives;
        row.utilityCasts += sourceRow.utilityCasts;
        row.utilityRevives += sourceRow.utilityRevives;
        row.selfRevives += sourceRow.selfRevives;
        row.assists += sourceRow.assists;
    });

    source.utilities.forEach((sourceRow, skillId) => {
        let row = target.utilities.get(skillId);
        if (!row) {
            row = { name: sourceRow.name, icon: sourceRow.icon, casts: 0, revives: 0, byCaster: new Map() };
            target.utilities.set(skillId, row);
        }
        if (!row.icon && sourceRow.icon) row.icon = sourceRow.icon;
        row.casts += sourceRow.casts;
        row.revives += sourceRow.revives;
        mergeCasters(row, sourceRow.byCaster);
    });

    target.iol.revives += source.iol.revives;
    target.iol.survived += source.iol.survived;
    target.iol.reDowned += source.iol.reDowned;
    target.iol.diedUnderIol += source.iol.diedUnderIol;
    target.iol.timesToReDownMs.push(...source.iol.timesToReDownMs);
}
