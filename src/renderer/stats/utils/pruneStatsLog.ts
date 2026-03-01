const pick = (obj: any, keys: string[]) => {
    const out: any = {};
    keys.forEach((key) => {
        if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
            out[key] = obj[key];
        }
    });
    return out;
};

export const isStatsPrunedLog = (value: any): boolean => Boolean(value && value.__statsPruned === true);

const pruneMetaMap = (source: any, options?: { includeClassification?: boolean; includeStacking?: boolean }) => {
    if (!source || typeof source !== 'object') return source;
    const out: Record<string, any> = {};
    Object.entries(source).forEach(([key, value]) => {
        if (!value || typeof value !== 'object') return;
        const next: Record<string, any> = {};
        if (typeof (value as any).name === 'string') next.name = (value as any).name;
        if (typeof (value as any).icon === 'string') next.icon = (value as any).icon;
        if (options?.includeClassification && typeof (value as any).classification === 'string') {
            next.classification = (value as any).classification;
        }
        if (options?.includeStacking) {
            if (typeof (value as any).stacking === 'boolean') {
                next.stacking = (value as any).stacking;
            } else if (typeof (value as any).stacking === 'number') {
                next.stacking = Boolean((value as any).stacking);
            }
        }
        if (Object.keys(next).length > 0) {
            out[key] = next;
        }
    });
    return out;
};

const playerHasDirectTagDistance = (player: any) => {
    const stats = player?.statsAll?.[0];
    if (!stats || typeof stats !== 'object') return false;
    if (stats.distToCom !== undefined && stats.distToCom !== 'Infinity') return true;
    if (stats.stackDist !== undefined) return true;
    return false;
};

const pruneCombatReplayData = (value: any, keepPositions: boolean) => {
    const pruneEntry = (entry: any) => {
        if (!entry || typeof entry !== 'object') return null;
        const out = pick(entry, ['start', 'down', 'dead']);
        if (keepPositions && Array.isArray(entry.positions)) {
            out.positions = entry.positions;
        }
        return out;
    };
    if (Array.isArray(value)) {
        return value
            .map((entry) => pruneEntry(entry))
            .filter((entry): entry is Record<string, any> => Boolean(entry));
    }
    if (value && typeof value === 'object') {
        return pruneEntry(value);
    }
    return value;
};

export const pruneDetailsForStats = (details: any) => {
    if (!details || typeof details !== 'object') return details;
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
    pruned.skillMap = pruneMetaMap(pruned.skillMap, { includeClassification: false, includeStacking: false });
    pruned.buffMap = pruneMetaMap(pruned.buffMap, { includeClassification: true, includeStacking: true });
    if (Array.isArray(pruned.players)) {
        const sourcePlayers = details.players as any[];
        const squadPlayers = sourcePlayers.filter((player: any) => !player?.notInSquad);
        const needsReplayDistanceFallback = squadPlayers.some((player: any) => (
            !player?.hasCommanderTag && !playerHasDirectTagDistance(player)
        ));
        pruned.players = sourcePlayers.map((player: any) => {
            const out = pick(player, [
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
                'hasCommanderTag',
                'notInSquad',
                'account',
                'activeTimes',
                'teamID',
                'teamId',
                'team',
                'teamColor',
                'team_color'
            ]);
            const minions = Array.isArray(player?.minions) ? player.minions : [];
            out.minions = minions.map((minion: any) => pick(minion, ['name', 'totalDamageTakenDist']));
            const keepReplayPositions = (player?.hasCommanderTag && !player?.notInSquad)
                || (
                    needsReplayDistanceFallback
                    && !player?.notInSquad
                    && !playerHasDirectTagDistance(player)
                );
            out.combatReplayData = pruneCombatReplayData(player?.combatReplayData, keepReplayPositions);
            return out;
        });
    }
    if (Array.isArray(pruned.targets)) {
        pruned.targets = pruned.targets.map((target: any) => {
            const out = pick(target, [
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
                'totalDamageTaken',
                'totalDamageTakenDist',
                'damageTaken',
                'powerDamage1S',
                'damage1S',
                'profession',
                'teamID',
                'teamId',
                'team',
                'teamColor',
                'team_color'
            ]);
            out.combatReplayData = pruneCombatReplayData(target?.combatReplayData, false);
            return out;
        });
    }
    return pruned;
};

export const pruneLogForStats = (log: any) => {
    if (!log || typeof log !== 'object') return log;
    if (isStatsPrunedLog(log)) return log;
    const pruned: any = { ...log };
    if (log.details) {
        pruned.details = pruneDetailsForStats(log.details);
    } else {
        pruned.details = pruneDetailsForStats(log);
    }
    pruned.__statsPruned = true;
    return pruned;
};
