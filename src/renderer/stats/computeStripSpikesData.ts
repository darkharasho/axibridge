import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { applyLabel, type FrameFightLabels } from './slice/frameLabels';

export type StripFightValue = {
    strips: number;
    stripTime: number;
    stripDownContrib: number;
};

export type StripFight = {
    id: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    values: Record<string, StripFightValue>;
    maxStrips: number;
    maxStripTime: number;
    maxStripDownContrib: number;
};

export type StripPlayer = {
    key: string;
    account: string;
    displayName: string;
    characterName: string;
    profession: string;
    professionList: string[];
    logs: number;
    totalStrips: number;
    totalStripTime: number;
    totalStripDownContrib: number;
    peakStrips: number;
    peakStripTime: number;
    peakStripDownContrib: number;
    peakFightLabel: string;
};

export type StripSpikesData = {
    fights: StripFight[];
    players: StripPlayer[];
};

export interface StripSpikesPlayerSeed {
    account: string;
    characterName: string;
    profession: string;
}

export interface StripSpikesAccumulator {
    fights: StripFight[];
    playerMap: Map<string, StripPlayer>;
    /** Running fight index counter (incremented per ingested log with details). */
    fightIndex: number;
    /** Per-fight player identity, parallel to `fights`. Slice frames only —
     *  never part of any finalize output. */
    fightSeeds: Array<Record<string, StripSpikesPlayerSeed>>;
}

export function createStripSpikesAccumulator(): StripSpikesAccumulator {
    return {
        fights: [],
        playerMap: new Map(),
        fightIndex: 0,
        fightSeeds: [],
    };
}

export interface StripSpikesIngestOptions {
    splitPlayersByClass?: boolean;
}

/**
 * Fold one fight's strip values into the running player map. Shared by
 * `ingestLogStripSpikes` and `mergeStripSpikesFrame` so slice-mode totals
 * cannot drift from all-fights totals.
 */
export function foldStripFightIntoPlayers(
    fight: StripFight,
    seeds: Record<string, StripSpikesPlayerSeed>,
    playerMap: Map<string, StripPlayer>,
): void {
    Object.entries(fight.values).forEach(([key, value]) => {
        const seed = seeds[key] || { account: key, characterName: '', profession: 'Unknown' };
        const { strips, stripTime, stripDownContrib } = value;
        const existing = playerMap.get(key);
        if (existing) {
            existing.logs += 1;
            existing.totalStrips += strips;
            existing.totalStripTime += stripTime;
            existing.totalStripDownContrib += stripDownContrib;
            if (!existing.professionList.includes(seed.profession)) {
                existing.professionList.push(seed.profession);
            }
            if (strips > existing.peakStrips) {
                existing.peakStrips = strips;
                existing.peakFightLabel = fight.fullLabel;
            }
            if (stripTime > existing.peakStripTime) existing.peakStripTime = stripTime;
            if (stripDownContrib > existing.peakStripDownContrib) existing.peakStripDownContrib = stripDownContrib;
        } else {
            playerMap.set(key, {
                key,
                account: seed.account,
                displayName: seed.account,
                characterName: seed.characterName,
                profession: seed.profession,
                professionList: [seed.profession],
                logs: 1,
                totalStrips: strips,
                totalStripTime: stripTime,
                totalStripDownContrib: stripDownContrib,
                peakStrips: strips,
                peakStripTime: stripTime,
                peakStripDownContrib: stripDownContrib,
                peakFightLabel: fight.fullLabel,
            });
        }
    });
}

export function ingestLogStripSpikes(log: any, acc: StripSpikesAccumulator, options: StripSpikesIngestOptions = {}): void {
    const splitPlayersByClass = options.splitPlayersByClass ?? false;
    const details = log?.details;
    if (!details) return;

    const index = acc.fightIndex++;
    const fullLabel = buildFightLabelV2({
        zone: details.fightName || log.fightName || `Fight ${index + 1}`,
        durationMs: details.durationMS,
        avgPosition: computeFightAvgPosition(details),
    });
    const fightId = log.filePath || log.id || `fight-${index + 1}`;
    const shortLabel = `F${index + 1}`;
    const timestamp = resolveFightTimestamp(details, log);

    const values: Record<string, StripFightValue> = {};
    const seeds: Record<string, StripSpikesPlayerSeed> = {};
    let maxStrips = 0;
    let maxStripTime = 0;
    let maxStripDownContrib = 0;

    const players = Array.isArray(details.players) ? details.players : [];
    players.forEach((player: any) => {
        if (player?.notInSquad) return;
        const account = String(player?.account || player?.name || 'Unknown');
        const characterName = String(player?.character_name || player?.display_name || player?.name || '');
        const profession = String(player?.profession || 'Unknown');
        const key = splitPlayersByClass && profession !== 'Unknown' ? `${account}::${profession}` : account;

        const support = Array.isArray(player?.support) ? player.support[0] : player?.support;
        const strips = Number(support?.boonStrips || 0);
        const stripTime = Number(support?.boonStripsTime || 0);
        const stripDownContrib = Number(support?.boonStripDownContribution || 0);

        values[key] = { strips, stripTime, stripDownContrib };
        seeds[key] = { account, characterName, profession };

        if (strips > maxStrips) maxStrips = strips;
        if (stripTime > maxStripTime) maxStripTime = stripTime;
        if (stripDownContrib > maxStripDownContrib) maxStripDownContrib = stripDownContrib;
    });

    const fight: StripFight = {
        id: fightId,
        shortLabel,
        fullLabel,
        timestamp,
        values,
        maxStrips,
        maxStripTime,
        maxStripDownContrib,
    };
    acc.fights.push(fight);
    acc.fightSeeds.push(seeds);
    foldStripFightIntoPlayers(fight, seeds, acc.playerMap);
}

export function finalizeStripSpikes(acc: StripSpikesAccumulator): StripSpikesData {
    const players = Array.from(acc.playerMap.values())
        .sort((a, b) => b.totalStrips - a.totalStrips || a.displayName.localeCompare(b.displayName));

    // Sort fights chronologically and reassign shortLabels so F1=oldest.
    // In the incremental path, fights are pushed in ingestion order which may
    // not match timestamp order, causing scrambled fight numbers on the chart.
    const fights = [...acc.fights]
        .sort((a, b) => {
            if (a.timestamp > 0 && b.timestamp > 0 && a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
            return a.shortLabel.localeCompare(b.shortLabel, undefined, { numeric: true });
        })
        .map((fight, i) => ({ ...fight, shortLabel: `F${i + 1}` }));

    return { fights, players };
}

export interface StripSpikesFrame {
    fight: StripFight;
    seeds: Record<string, StripSpikesPlayerSeed>;
}

export function extractStripSpikesFrame(acc: StripSpikesAccumulator): StripSpikesFrame {
    if (acc.fights.length !== 1) {
        throw new Error(`extractStripSpikesFrame expects exactly one fight, got ${acc.fights.length}`);
    }
    return { fight: acc.fights[0], seeds: acc.fightSeeds[0] || {} };
}


/**
 * `labels` re-states the ordinal-derived strings at the merge ordinal. A frame
 * is always built by a solo aggregator, so `fight.id` / `shortLabel` are baked
 * at ordinal 0 and `fullLabel` carries the `Fight 1` zone fallback whenever the
 * log named no zone. They are rewritten BEFORE the player fold, so the fold's
 * `peakFightLabel` picks up the corrected string for free.
 */
export function mergeStripSpikesFrame(target: StripSpikesAccumulator, frame: StripSpikesFrame, labels: FrameFightLabels): void {
    applyLabel(frame.fight, 'id', labels.fightId);
    applyLabel(frame.fight, 'shortLabel', labels.shortLabel);
    applyLabel(frame.fight, 'fullLabel', labels.fullLabel);
    target.fightIndex += 1;
    target.fights.push(frame.fight);
    target.fightSeeds.push(frame.seeds);
    foldStripFightIntoPlayers(frame.fight, frame.seeds, target.playerMap);
}

export function computeStripSpikesData(validLogs: any[], splitPlayersByClass = false): StripSpikesData {
    const sorted = validLogs
        .map((log) => ({ log, ts: resolveFightTimestamp(log?.details, log) }))
        .sort((a, b) => a.ts - b.ts)
        .map(({ log }) => log);

    const acc = createStripSpikesAccumulator();
    for (const log of sorted) ingestLogStripSpikes(log, acc, { splitPlayersByClass });
    return finalizeStripSpikes(acc);
}
