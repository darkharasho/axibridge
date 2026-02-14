import { computeStatsAggregation } from '../stats/computeStatsAggregation';

type WorkerPayload = {
    logs: any[];
    precomputedStats?: any;
    mvpWeights?: any;
    statsViewSettings?: any;
    disruptionMethod?: any;
};

let latestPayload: WorkerPayload | null = null;
let dirty = false;
let timer: number | null = null;
let computeId = 0;
let currentToken = 0;
let pendingFlushId: number | null = null;

const pruneDetailsForStats = (details: any) => {
    if (!details || typeof details !== 'object') return details;
    const pick = (obj: any, keys: string[]) => {
        const out: any = {};
        keys.forEach((key) => {
            if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
                out[key] = obj[key];
            }
        });
        return out;
    };
    const pruned: any = pick(details, [
        'players',
        'targets',
        'durationMS',
        'uploadTime',
        'timeStart',
        'timeStartStd',
        'timeEnd',
        'timeEndStd',
        'fightName',
        'zone',
        'mapName',
        'map',
        'location',
        'permalink',
        'uploadLinks',
        'success',
        'teamBreakdown',
        'teamCounts',
        'combatReplayMetaData',
        'skillMap',
        'buffMap',
        'encounterDuration',
        'player_damage_mitigation',
        'player_minion_damage_mitigation',
        'playerDamageMitigation',
        'playerMinionDamageMitigation'
    ]);
    if (Array.isArray(pruned.players)) {
        pruned.players = pruned.players.map((player: any) => pick(player, [
            'name',
            'display_name',
            'character_name',
            'profession',
            'elite_spec',
            'group',
            'dpsAll',
            'statsAll',
            'dpsTargets',
            'statsTargets',
            'defenses',
            'support',
            'rotation',
            'extHealingStats',
            'extBarrierStats',
            'squadBuffVolumes',
            'selfBuffs',
            'groupBuffs',
            'squadBuffs',
            'selfBuffsActive',
            'groupBuffsActive',
            'squadBuffsActive',
            'buffUptimes',
            'totalDamageDist',
            'targetDamageDist',
            'damage1S',
            'targetDamage1S',
            'powerDamageTaken1S',
            'targetPowerDamage1S',
            'totalDamageTaken',
            'totalDamageTakenDist',
            'minions',
            'combatReplayData',
            'hasCommanderTag',
            'notInSquad',
            'account',
            'activeTimes',
            'teamID',
            'teamId',
            'team',
            'teamColor',
            'team_color'
        ]));
    }
    if (Array.isArray(pruned.targets)) {
        pruned.targets = pruned.targets.map((target: any) =>
            pick(target, [
                'id',
                'name',
                'isFake',
                'dpsAll',
                'statsAll',
                'defenses',
                'totalHealth',
                'healthPercentBurned',
                'enemyPlayer',
                'totalDamageDist',
                'powerDamage1S',
                'damage1S',
                'profession',
                'teamID',
                'teamId',
                'team',
                'teamColor',
                'team_color'
            ])
        );
    }
    return pruned;
};

const pruneLogForStats = (log: any) => {
    if (!log || typeof log !== 'object') return log;
    const pruned = { ...log };
    if (log.details) {
        pruned.details = pruneDetailsForStats(log.details);
    } else {
        pruned.details = pruneDetailsForStats(log);
    }
    return pruned;
};

const computeAndPost = () => {
    if (!dirty || !latestPayload) return;
    dirty = false;
    computeId += 1;
    const flushId = pendingFlushId;
    pendingFlushId = null;
    const result = computeStatsAggregation(latestPayload);
    (self as any).postMessage({
        type: 'result',
        result,
        computeId,
        logCount: latestPayload.logs.length,
        token: currentToken,
        completedAt: Date.now(),
        flushId
    });
};

const ensureTimer = () => {
    if (timer !== null) return;
    timer = setInterval(() => {
        computeAndPost();
    }, 5000) as unknown as number;
};

self.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (data?.type === 'reset') {
        latestPayload = { logs: [] };
        if (typeof data.token === 'number') {
            currentToken = data.token;
        }
        dirty = true;
        ensureTimer();
        return;
    }
    if (data?.type === 'settings') {
        latestPayload = {
            logs: latestPayload?.logs || [],
            precomputedStats: data.payload?.precomputedStats,
            mvpWeights: data.payload?.mvpWeights,
            statsViewSettings: data.payload?.statsViewSettings,
            disruptionMethod: data.payload?.disruptionMethod
        };
        dirty = true;
        ensureTimer();
        return;
    }
    if (data?.type === 'log') {
        if (!latestPayload) {
            latestPayload = { logs: [] };
        }
        latestPayload.logs.push(pruneLogForStats(data.payload));
        dirty = true;
        ensureTimer();
        return;
    }
    if (data?.type === 'flush') {
        if (typeof data.flushId === 'number') {
            pendingFlushId = data.flushId;
        }
        dirty = true;
        computeAndPost();
    }
};
