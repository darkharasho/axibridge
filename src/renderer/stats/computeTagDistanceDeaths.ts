import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';
import { getFightOutcome } from './computePlayerAggregation';
import { buildNativeMovement, positionAtOrBefore } from '../../shared/movementData';
import { squadEntities } from '@axiapps/bridge-metrics/nativeRoster';

export type TagDistanceDeathEvent = {
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    isWin: boolean | null;
    playerAccount: string;
    timeIntoFightMs: number;
    timeIntoFightSec: number;
    distanceFromTag: number;
    isCommander: boolean;
};

export type TagDistanceDeathFightSummary = {
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    isWin: boolean | null;
    avgDistance: number;
    events: TagDistanceDeathEvent[];
    eventCount: number;
    hasReplayData: boolean;
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

const resolveFightOutcome = (details: any, log: any): boolean | null => {
    const players = Array.isArray(details?.players) ? details.players : [];
    if (players.length > 0) return getFightOutcome(details);
    if (typeof details?.success === 'boolean') return details.success;
    const summary = log?.dashboardSummary;
    if (summary && typeof summary === 'object') {
        if (summary.isWin === true) return true;
        if (summary.isWin === false) return false;
    }
    return null;
};

export function ingestLogTagDistanceDeaths(log: any, fightIndex: number): TagDistanceDeathFightSummary {
    const details = log?.details;
    const fightId = log?.filePath || `fight-${fightIndex}`;
    const shortLabel = `F${fightIndex + 1}`;
    const fullLabel = buildFightLabelV2({
        zone: details?.fightName || log?.encounterName || `Fight ${fightIndex + 1}`,
        durationMs: details?.durationMS,
        avgPosition: computeFightAvgPosition(details),
    });
    const isWin = resolveFightOutcome(details, log);

    const squad = squadEntities(details?.native ?? {});
    const movement = buildNativeMovement(details);
    const commander = squad.find(isCommanderEntity);
    const tagTrack = commander && movement ? movement.tracks.get(commander.id) ?? null : null;

    if (!commander || !movement || !tagTrack || tagTrack.samples.length === 0) {
        return {
            fightId, shortLabel, fullLabel, isWin,
            avgDistance: 0, events: [], eventCount: 0, hasReplayData: false,
        };
    }

    const events: TagDistanceDeathEvent[] = [];

    for (const entity of squad) {
        const isCommanderPlayer = entity.id === commander.id;
        const track = movement.tracks.get(entity.id);
        if (!track || track.samples.length === 0) continue;

        // Native's `dead` intervals ARE the deaths. The old path had to infer
        // them — "a down entry whose linkedDeathMs appears in the dead set" —
        // only because EI's down/dead arrays were unlinked.
        for (const [deathStartMs] of deadIntervals(details, entity.id)) {
            if (!Number.isFinite(deathStartMs) || deathStartMs < 0) continue;

            // A death is an arcdps timestamp, not a poll instant, so ask where
            // the actor was last seen rather than demanding an exact sample.
            const p = positionAtOrBefore(track, deathStartMs, movement.pollMs);
            const tag = positionAtOrBefore(tagTrack, deathStartMs, movement.pollMs);
            if (!p || !tag) continue;

            const distanceFromTag = isCommanderPlayer
                ? 0
                : Math.round(Math.hypot(p[0] - tag[0], p[1] - tag[1]));

            events.push({
                fightId, shortLabel, fullLabel, isWin,
                playerAccount: entity.account || 'Unknown',
                isCommander: isCommanderPlayer,
                timeIntoFightMs: deathStartMs,
                timeIntoFightSec: Math.round(deathStartMs / 1000),
                distanceFromTag,
            });
        }
    }
    events.sort((a, b) => a.timeIntoFightMs - b.timeIntoFightMs);

    const avgDistance = events.length > 0
        ? Math.round(events.reduce((sum, e) => sum + e.distanceFromTag, 0) / events.length)
        : 0;

    return {
        fightId, shortLabel, fullLabel, isWin,
        avgDistance, events, eventCount: events.length, hasReplayData: true,
    };
}

export const computeTagDistanceDeaths = (
    sortedFightLogs: Array<{ log: any }>
): TagDistanceDeathFightSummary[] => {
    return sortedFightLogs.map(({ log }, idx) => ingestLogTagDistanceDeaths(log, idx));
};
