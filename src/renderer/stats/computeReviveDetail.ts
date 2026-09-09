import { deriveReviveLogSummary, type RevivePlayerCounts } from '@axiapps/bridge-metrics';
import type { ReviveDetailFrame, ReviveDetailSummary } from './statsTypes';

interface ReviveDetailPlayer extends RevivePlayerCounts {
    account: string;
    profession: string;
}

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
    utilities: Map<number, { name: string; casts: number; revives: number; byCaster: Map<string, number> }>;
    iol: { revives: number; survived: number; reDowned: number; timesToReDownMs: number[] };
}

export function createReviveDetailAccumulator(): ReviveDetailAccumulator {
    return {
        logsWithData: 0,
        logsWithoutData: 0,
        squad: { downs: 0, recovered: 0, died: 0, hand: 0, utility: 0, self: 0, unattributed: 0 },
        players: new Map(),
        utilities: new Map(),
        iol: { revives: 0, survived: 0, reDowned: 0, timesToReDownMs: [] },
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
                account, profession, attempts: 0, attemptTimeMs: 0, handRevives: 0,
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
            row = { name: utility.name, casts: 0, revives: 0, byCaster: new Map() };
            acc.utilities.set(skillId, row);
        }
        row.casts += utility.casts;
        row.revives += utility.revives;
        utility.byCaster.forEach((count, caster) => row!.byCaster.set(caster, (row!.byCaster.get(caster) || 0) + count));
    });

    const roster = Array.isArray(details?.players) ? details.players : [];
    for (const revive of summary.iolRevives) {
        acc.iol.revives += 1;
        const down = roster[revive.playerIndex]?.combatReplayData?.down;
        const next = (Array.isArray(down) ? down : [])
            .map((interval: number[]) => interval[0])
            .filter((start: number) => start > revive.at)
            .sort((a: number, b: number) => a - b)[0];
        if (next === undefined) acc.iol.survived += 1;
        else {
            acc.iol.reDowned += 1;
            acc.iol.timesToReDownMs.push(next - revive.at);
        }
    }
}

const median = (values: number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

export function finalizeReviveDetail(acc: ReviveDetailAccumulator): ReviveDetailSummary {
    const players = Array.from(acc.players.entries()).map(([key, row]) => ({
        key,
        account: row.account,
        profession: row.profession,
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
        row.byCaster.forEach((count, caster) => {
            if (count > topCount) {
                topCount = count;
                topCasterKey = caster;
            }
        });
        return {
            skillId,
            name: row.name,
            casts: row.casts,
            revives: row.revives,
            revivesPerCast: row.casts > 0 ? row.revives / row.casts : 0,
            topCasterKey,
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
                medianTimeToReDownMs: median(acc.iol.timesToReDownMs),
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
            row = { name: sourceRow.name, casts: 0, revives: 0, byCaster: new Map() };
            target.utilities.set(skillId, row);
        }
        row.casts += sourceRow.casts;
        row.revives += sourceRow.revives;
        sourceRow.byCaster.forEach((count, caster) => row!.byCaster.set(caster, (row!.byCaster.get(caster) || 0) + count));
    });

    target.iol.revives += source.iol.revives;
    target.iol.survived += source.iol.survived;
    target.iol.reDowned += source.iol.reDowned;
    target.iol.timesToReDownMs.push(...source.iol.timesToReDownMs);
}
