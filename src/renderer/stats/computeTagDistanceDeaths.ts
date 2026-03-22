import { sanitizeWvwLabel, buildFightLabel, resolveMapName } from './utils/labelUtils';
import { getFightOutcome } from './computePlayerAggregation';

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

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

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

export const computeTagDistanceDeaths = (
    sortedFightLogs: Array<{ log: any }>
): TagDistanceDeathFightSummary[] => {
    return sortedFightLogs.map(({ log }, idx) => {
        const details = log?.details;
        const fightId = log?.filePath || `fight-${idx}`;
        const fightName = sanitizeWvwLabel(details?.fightName || log?.encounterName || `Fight ${idx + 1}`);
        const mapName = resolveMapName(details, log);
        const shortLabel = `F${idx + 1}`;
        const fullLabel = buildFightLabel(fightName, String(mapName || ''));
        const isWin = resolveFightOutcome(details, log);

        const players = Array.isArray(details?.players) ? details.players : [];
        const squadPlayers = players.filter((p: any) => !p?.notInSquad);
        const replayMeta = (details as any)?.combatReplayMetaData || {};
        const pollingRate = replayMeta?.pollingRate > 0 ? replayMeta.pollingRate : 0;
        const inchToPixel = replayMeta?.inchToPixel > 0 ? replayMeta.inchToPixel : 0;

        const commander = squadPlayers.find((p: any) => p?.hasCommanderTag);
        const tagPositions: Array<[number, number]> = commander?.combatReplayData?.positions || [];

        if (!commander || tagPositions.length === 0 || pollingRate <= 0 || inchToPixel <= 0) {
            return {
                fightId, shortLabel, fullLabel, isWin,
                avgDistance: 0, events: [], eventCount: 0, hasReplayData: false,
            };
        }

        const events: TagDistanceDeathEvent[] = [];

        for (const player of squadPlayers) {
            const isCommanderPlayer = !!player.hasCommanderTag;
            const replay = player?.combatReplayData;
            if (!replay?.positions || !Array.isArray(replay.dead) || !Array.isArray(replay.down)) continue;

            const playerPositions: Array<[number, number]> = replay.positions;
            const playerStart = Number(replay.start || 0);
            const playerOffset = Math.floor(playerStart / pollingRate);

            const deadSet = new Set<number>();
            for (const entry of replay.dead) {
                if (Array.isArray(entry) && Number.isFinite(entry[0]) && entry[0] > 0) {
                    deadSet.add(entry[0]);
                }
            }

            for (const entry of replay.down) {
                if (!Array.isArray(entry)) continue;
                const downStartMs = Number(entry[0]);
                const linkedDeathMs = Number(entry[1]);
                if (!Number.isFinite(downStartMs) || downStartMs < 0) continue;
                if (!deadSet.has(linkedDeathMs)) continue;

                const pollIndex = Math.floor(downStartMs / pollingRate);
                const playerIdx = clamp(pollIndex - playerOffset, 0, playerPositions.length - 1);
                const tagIdx = clamp(pollIndex, 0, tagPositions.length - 1);

                const [px, py] = playerPositions[playerIdx];
                const [tx, ty] = tagPositions[tagIdx];
                const distanceFromTag = isCommanderPlayer ? 0 : Math.round(Math.hypot(px - tx, py - ty) / inchToPixel);

                events.push({
                    fightId, shortLabel, fullLabel, isWin,
                    playerAccount: player.account || 'Unknown',
                    isCommander: isCommanderPlayer,
                    timeIntoFightMs: downStartMs,
                    timeIntoFightSec: Math.round(downStartMs / 1000),
                    distanceFromTag,
                });
            }
        }

        const avgDistance = events.length > 0
            ? Math.round(events.reduce((sum, e) => sum + e.distanceFromTag, 0) / events.length)
            : 0;

        return {
            fightId, shortLabel, fullLabel, isWin,
            avgDistance, events, eventCount: events.length, hasReplayData: true,
        };
    });
};
