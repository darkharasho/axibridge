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
            ])
        );
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
