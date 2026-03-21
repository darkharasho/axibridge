/**
 * Pure functions for processing EI JSON (dps.report detail payloads).
 *
 * No Electron, no fs, no store — safe to unit-test directly.
 */

import { computeOutgoingConditions } from '../shared/conditionsMetrics';
import { TIMESTAMP_MS_THRESHOLD } from '../shared/constants';

// ─── Timestamp helpers ────────────────────────────────────────────────────────

/**
 * Coerce any value to a Unix timestamp in seconds.
 * Accepts: number (ms or s), ISO string, numeric string.
 * Returns `undefined` for invalid / missing inputs.
 */
export const resolveTimestampSeconds = (value: any): number | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) return undefined;
        return value > TIMESTAMP_MS_THRESHOLD ? Math.floor(value / 1000) : Math.floor(value);
    }
    const raw = String(value).trim();
    if (!raw) return undefined;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric > TIMESTAMP_MS_THRESHOLD ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed / 1000);
    const normalized = raw.replace(/([+-]\d{2})$/, '$1:00');
    const reparsed = Date.parse(normalized);
    if (Number.isFinite(reparsed) && reparsed > 0) return Math.floor(reparsed / 1000);
    return undefined;
};

/**
 * Pick the best available upload timestamp from a details payload.
 * Falls back through multiple candidate fields.
 */
export const resolveDetailsUploadTime = (details: any, fallback?: any): number | undefined =>
    resolveTimestampSeconds(
        details?.uploadTime
        ?? fallback?.uploadTime
        ?? details?.timeStartStd
        ?? details?.timeStart
        ?? details?.timeEndStd
        ?? details?.timeEnd
    );

// ─── Details pruning ──────────────────────────────────────────────────────────

const pick = (obj: any, keys: string[]): any => {
    const out: any = {};
    keys.forEach((key) => {
        if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
            out[key] = obj[key];
        }
    });
    return out;
};

const pruneCombatReplayData = (value: any): any => {
    const pruneEntry = (entry: any) => {
        if (!entry || typeof entry !== 'object') return null;
        return pick(entry, ['start', 'down', 'dead']);
    };
    if (Array.isArray(value)) {
        return value
            .map((entry) => pruneEntry(entry))
            .filter((entry): entry is Record<string, any> => Boolean(entry));
    }
    if (value && typeof value === 'object') return pruneEntry(value);
    return value;
};

const PLAYER_KEYS = [
    'name', 'display_name', 'character_name', 'profession', 'elite_spec', 'group',
    'dpsAll', 'statsAll', 'dpsTargets', 'statsTargets', 'defenses', 'support',
    'rotation', 'extHealingStats', 'extBarrierStats', 'squadBuffVolumes',
    'selfBuffs', 'groupBuffs', 'squadBuffs', 'selfBuffsActive', 'groupBuffsActive', 'squadBuffsActive',
    'buffUptimes', 'totalDamageDist', 'targetDamageDist', 'damage1S', 'targetDamage1S',
    'powerDamage1S', 'conditionDamage1S', 'powerDamageTaken1S', 'targetPowerDamage1S',
    'totalDamageTaken', 'totalDamageTakenDist', 'minions', 'combatReplayData',
    'hasCommanderTag', 'notInSquad', 'account', 'activeTimes',
    'teamID', 'teamId', 'team', 'teamColor', 'team_color',
    'damageModifiers', 'incomingDamageModifiers'
];

const TARGET_KEYS = [
    'id', 'name', 'isFake', 'dpsAll', 'statsAll', 'defenses',
    'totalHealth', 'healthPercentBurned', 'enemyPlayer',
    'totalDamageDist', 'totalDamageTaken', 'totalDamageTakenDist',
    'damageTaken', 'powerDamage1S', 'damage1S',
    'profession', 'teamID', 'teamId', 'team', 'teamColor', 'team_color',
    'buffs'
];

const TOP_LEVEL_KEYS = [
    'players', 'targets', 'durationMS', 'uploadTime', 'timeStart', 'timeStartStd',
    'timeEnd', 'timeEndStd', 'fightName', 'zone', 'mapName', 'map', 'location',
    'permalink', 'uploadLinks', 'success', 'teamBreakdown', 'teamCounts',
    'combatReplayMetaData', 'skillMap', 'buffMap', 'encounterDuration',
    'player_damage_mitigation', 'player_minion_damage_mitigation',
    'playerDamageMitigation', 'playerMinionDamageMitigation',
    'damageModMap',
    'personalDamageMods',
    'conditionMetrics'
];

/**
 * Strip fields not needed by the stats pipeline from a full EI JSON payload.
 * Reduces memory footprint and IPC transfer size.
 * Pure — no I/O, no side effects.
 */
export const pruneDetailsForStats = (details: any): any => {
    if (!details || typeof details !== 'object') return details;
    const pruned: any = pick(details, TOP_LEVEL_KEYS);
    if (Array.isArray(pruned.players)) {
        pruned.players = pruned.players.map((player: any) => pick(player, PLAYER_KEYS));
    }
    if (Array.isArray(pruned.targets)) {
        pruned.targets = pruned.targets.map((target: any) => {
            const base = pick(target, TARGET_KEYS);
            base.combatReplayData = pruneCombatReplayData(target?.combatReplayData);
            return base;
        });
    }
    return pruned;
};

// ─── Dashboard summary ────────────────────────────────────────────────────────

export type DashboardSummary = {
    hasPlayers: boolean;
    hasTargets: boolean;
    squadCount: number;
    enemyCount: number;
    isWin: boolean | null;
    squadDeaths: number;
    enemyDeaths: number;
};

/**
 * Derive a lightweight fight summary from an EI JSON payload.
 * Pure — no I/O.
 */
export const buildDashboardSummaryFromDetails = (details: any): DashboardSummary => {
    const players: any[] = Array.isArray(details?.players) ? details.players : [];
    const targets: any[] = Array.isArray(details?.targets) ? details.targets : [];
    let squadCount = 0;
    let enemyCount = 0;
    let squadDownsDeaths = 0;
    let enemyDownsDeaths = 0;
    let squadDeaths = 0;
    let enemyDeaths = 0;

    players.forEach((player) => {
        if (player?.notInSquad) return;
        squadCount += 1;
        const defenses = player?.defenses?.[0];
        if (defenses) {
            const downCount = Number(defenses.downCount || 0);
            const deadCount = Number(defenses.deadCount || 0);
            squadDownsDeaths += downCount + deadCount;
            squadDeaths += deadCount;
        }
        const statsTargets: any[] = Array.isArray(player?.statsTargets) ? player.statsTargets : [];
        statsTargets.forEach((targetStats) => {
            const phase = Array.isArray(targetStats) ? targetStats[0] : null;
            if (!phase) return;
            enemyDownsDeaths += Number(phase.downed || 0) + Number(phase.killed || 0);
            enemyDeaths += Number(phase.killed || 0);
        });
    });

    targets.forEach((target) => {
        if (!target?.isFake) enemyCount += 1;
    });

    let isWin: boolean | null = null;
    if (players.length > 0) {
        if (squadDownsDeaths > 0 || enemyDownsDeaths > 0) {
            isWin = enemyDownsDeaths > squadDownsDeaths;
        } else if (typeof details?.success === 'boolean') {
            isWin = details.success;
        } else {
            isWin = false;
        }
    }

    return { hasPlayers: players.length > 0, hasTargets: targets.length > 0, squadCount, enemyCount, isWin, squadDeaths, enemyDeaths };
};

// ─── Manifest building ────────────────────────────────────────────────────────

/**
 * Build a dev-dataset manifest entry from an EI JSON payload.
 * Pure — no I/O.
 */
export const buildManifestEntry = (details: any, filePath: string, index: number) => {
    const players: any[] = Array.isArray(details?.players) ? details.players : [];
    const squadCount = players.filter((p) => !p?.notInSquad).length;
    const nonSquadCount = players.filter((p) => p?.notInSquad).length;
    return {
        id: details?.id || `dev-log-${index + 1}`,
        filePath,
        fightName: details?.fightName,
        encounterDuration: details?.encounterDuration,
        uploadTime: resolveDetailsUploadTime(details),
        timeStart: details?.timeStart,
        timeStartStd: details?.timeStartStd,
        durationMS: details?.durationMS,
        success: details?.success,
        playerCount: players.length,
        squadCount,
        nonSquadCount
    };
};

// ─── Condition metrics ────────────────────────────────────────────────────────

/**
 * Lazily attach condition metrics to a details payload if not already present.
 * Mutates `details` in place (same behaviour as the original code).
 */
export const attachConditionMetrics = (details: any): any => {
    if (!details || details.conditionMetrics) return details;
    const players = Array.isArray(details.players) ? details.players : [];
    const targets = Array.isArray(details.targets) ? details.targets : [];
    if (!players.length || !targets.length) return details;
    try {
        details.conditionMetrics = computeOutgoingConditions({
            players,
            targets,
            skillMap: details.skillMap,
            buffMap: details.buffMap
        });
    } catch (err: any) {
        console.warn('[Main] Condition metrics failed:', err?.message || err);
    }
    return details;
};

// ─── Fight details validation ─────────────────────────────────────────────────

/** Returns true when the details payload contains at least one player. */
export const hasUsableFightDetails = (details: any): boolean => {
    const players = Array.isArray(details?.players) ? details.players : [];
    return players.length > 0;
};

/** Returns true when the permalink fetch returned a 404. */
export const isDetailsPermalinkNotFound = (payload: any): boolean => {
    const code = String(payload?.error || '').toLowerCase();
    const statusCode = Number(payload?.statusCode || 0);
    return code === 'details-http-error' && statusCode === 404;
};
