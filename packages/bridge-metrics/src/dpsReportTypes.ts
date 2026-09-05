export interface DamageModifierInfo {
    name: string;
    icon: string;
    description: string;
    nonMultiplier?: boolean;
    skillBased?: boolean;
    approximate?: boolean;
    incoming: boolean;
}

export interface DamageModifierData {
    id: number;
    damageModifiers: Array<{
        hitCount: number;
        totalHitCount: number;
        damageGain: number;
        totalDamage: number;
    }>;
}

export interface DPSReportJSON {
    evtc: {
        type: string;
        version: string;
        bossId: number;
    };
    encounterDuration: string;
    recordedBy: string;
    uploadTime: number;
    players: Player[];
    targets: Target[];
    durationMS: number;
    fightName: string;
    success: boolean;
    skillMap?: { [key: string]: { name: string; icon: string; autoAttack?: boolean; isTraitProc?: boolean; isGearProc?: boolean; isUnconditionalProc?: boolean } };
    buffMap?: { [key: string]: { name: string; stacking: boolean; icon?: string; classification?: string } };
    combatReplayMetaData?: {
        inchToPixel?: number;
        pollingRate?: number;
        sizes?: [number, number];
        maps?: Array<{ url?: string }>;
    };
    wvWMapData?: {
        redTeamID?: number;
        greenTeamID?: number;
        blueTeamID?: number;
        redShardID?: number;
        greenShardID?: number;
        blueShardID?: number;
    };
    damageModMap?: Record<string, DamageModifierInfo>;
    personalDamageMods?: Record<string, number[]>;
}

export interface Target {
    id: number;
    name: string;
    isFake: boolean;
    dpsAll: StatsAll[];
    statsAll: StatsAll[];
    defenses: Defenses[];
    totalHealth: number;
    healthPercentBurned: number;
    enemyPlayer: boolean;
    teamID?: number;
}

export interface Player {
    name: string;
    display_name: string;
    character_name: string;
    profession: string;
    teamID?: number;
    elite_spec: number;
    group: number;
    dpsAll: StatsAll[];
    statsAll?: StatsAll[]; // Contains stackDist (distance to tag)
    dpsTargets?: StatsTarget[][];
    defenses: Defenses[];
    support: Support[];
    rotation?: Array<{
        id: number;
        /** Per-instance cast events for this skill. castTime is ms from fight start. */
        skills?: Array<{ castTime: number; duration: number; timeGained?: number; quickness?: number }>;
    }>;
    extHealingStats?: {
        outgoingHealingAllies?: { healing: number; downedHealing?: number }[][];
        totalHealingDist?: Array<Array<{
            id: number;
            totalHealing: number;
            totalDownedHealing?: number;
            hits: number;
            min: number;
            max: number;
            indirectHealing?: boolean;
        }>>;
        /** Cumulative total outgoing healing per second (to all targets). Shape: [phase][time]. Diff to get per-second. */
        healing1S?: number[][];
        /** Cumulative healing received per second (from all sources). Shape: [phase][time]. Diff to get per-second. */
        healingReceived1S?: number[][];
    };
    extBarrierStats?: {
        outgoingBarrierAllies?: { barrier: number }[][];
        totalBarrierDist?: Array<Array<{
            id: number;
            totalBarrier: number;
            hits: number;
            min: number;
            max: number;
            indirectBarrier?: boolean;
        }>>;
    };
    squadBuffVolumes?: SquadBuffVolume[];
    selfBuffs?: BuffGeneration[];
    groupBuffs?: BuffGeneration[];
    squadBuffs?: BuffGeneration[];
    selfBuffsActive?: BuffGeneration[];
    groupBuffsActive?: BuffGeneration[];
    squadBuffsActive?: BuffGeneration[];
    buffUptimes?: BuffUptimesEntry[];
    totalDamageDist?: TotalDamageDist[][];
    targetDamageDist?: TotalDamageDist[][][];
    totalDamageTaken?: TotalDamageTaken[][];
    statsTargets?: StatsTarget[][];
    combatReplayData?: {
        positions?: Array<[number, number]>;
        dead?: Array<[number, number]>;
        down?: Array<[number, number]>;
        start?: number;
    };
    healthPercents?: Array<[number, number]>;
    hasCommanderTag?: boolean;
    notInSquad?: boolean;
    account?: string;
    stabGeneration?: number; // Calculated field
    activeTimes?: number[];
    damageModifiers?: DamageModifierData[];
    incomingDamageModifiers?: DamageModifierData[];
    // Per-second cumulative damage arrays – shape: [phase][time] or [target][phase][time]
    damage1S?: number[][];
    targetDamage1S?: number[][][];
    /** Cumulative incoming damage per second. Shape: [phase][time]. Diff adjacent entries to get per-second values. */
    damageTaken1S?: number[][];
}

export interface StatsAll {
    dps: number;
    damage: number;
    breakbarDamage: number;
    downContribution?: number; // Added back as optional
    stackDist?: number;
    distToCom?: number;
    appliedCrowdControl?: number;
    appliedCrowdControlDuration?: number;
}

// Defenses interface based on standard hosted JSON output
export interface Defenses {
    downCount: number;
    deadCount: number;
    missedCount: number;
    blockedCount: number;
    evadedCount: number;
    dodgeCount: number;
    interruptedCount: number;
    damageTaken: number;
    /** Boons stripped from this player by enemies. */
    boonStrips?: number;
    boonStripsTime?: number;
    /** Conditions cleansed from this player (by self or allies). */
    conditionCleanses?: number;
    conditionCleansesTime?: number;
    /** Number of condition damage hits received. */
    conditionDamageTakenCount?: number;
    receivedCrowdControl?: number;
    receivedCrowdControlDuration?: number;
    /**
     * Stun breaks performed by this player. EI v3.24+ emits these here (breaking a
     * stun is a defensive event); older EI / dps.report emit them on `Support`.
     */
    stunBreak?: number;
    removedStunDuration?: number;
}

export interface SquadBuffVolume {
    id: number;
    buffVolumeData: { outgoing: number }[];
}

export interface BuffGeneration {
    id: number;
    buffData?: { generation?: number; wasted?: number }[];
}

/** @deprecated Use BuffUptimesEntry */
export interface BuffUptimes {
    id: number;
    buffData: { uptime: number }[];
    statesPerSource: { [key: string]: number[][] };
}

/**
 * Per-player per-buff entry in the `buffUptimes` array.
 * `states` is an array of `[timeMs, stackCount]` pairs recording state-change
 * events throughout the fight.  The value at any given millisecond is the last
 * `stackCount` whose `timeMs` is ≤ the queried time.
 */
export interface BuffUptimesEntry {
    id: number;
    buffData: { uptime: number; presence?: number }[];
    /** `[timeMs, stackCount]` state-change pairs, sorted by time ascending. */
    states?: Array<[number, number]>;
    statesPerSource?: { [key: string]: Array<[number, number]> };
}

export interface TotalDamageDist {
    id: number;
    hits: number;
    connectedHits: number;
    flank: number;
    crit: number;
    glance: number;
    totalDamage: number;
    missed: number;
    interrupted: number;
    evaded: number;
    blocked: number;
    min: number;
    max: number;
    downContribution?: number;
}

export interface TotalDamageTaken {
    id: number;
    hits: number;
    connectedHits: number;
    flank: number;
    crit: number;
    glance: number;
    totalDamage: number;
    missed: number;
    interrupted: number;
    evaded: number;
    blocked: number;
    min: number;
    max: number;
    indirectDamage: boolean;
    /**
     * axilog extension (>= 1.13.1), absent from GW2EI and from anything an
     * older axilog produced. The portion of `totalDamage` dealt by a player or
     * a player's minion -- the rest being siege, guards and NPCs -- so that
     * incoming damage can be shown the way the arcdps in-game filters do.
     *
     * It REFINES `totalDamage` rather than partitioning it: `playerTotal <=
     * totalDamage`, and sums over `totalDamage` are unaffected. Absent means
     * "not measured", never "no player damage".
     */
    playerTotal?: number;
}

export interface StatsTarget {
    killed: number;
    downed: number;
    downContribution: number;
    againstDownedCount: number;
    againstDownedDamage: number;
    interrupts?: number;
}


export interface Support {
    condiCleanse: number;
    condiCleanseTime?: number;
    condiCleanseSelf: number;
    /**
     * axilog extension, absent on genuine Elite Insights exports: conditions
     * cleansed off a MINION owned by a squad player. EI's cleanse count is
     * `log.PlayerList`-scoped and omits these entirely; the in-game arcdps
     * meter counts them, hence the ~3-4% gap between the two. Optional —
     * treat a missing value as "unknown", never as zero.
     */
    condiCleanseMinions?: number;
    /**
     * axilog extension: cleanses counted the way the in-game arcdps meter
     * counts them, transcribed from the meter's own source. NOT the same
     * population as `condiCleanse + condiCleanseSelf + condiCleanseMinions` —
     * arcdps additionally drops single-stack stability removals, drops
     * self-consumed blinds, and subtracts the self-removal burst that going
     * down produces. Base bucket = player-on-player, both meter inclusion
     * toggles off.
     *
     * There is no single "arcdps number": the meter's displayed total depends
     * on that window's "vs npcs" / "from npcs" toggles, so the two buckets
     * below are additive on top of the base rather than folded in.
     * Optional — treat a missing value as "unknown", never as zero.
     */
    condiCleanseArcdps?: number;
    /** Cleanses performed BY a minion, credited to its master ("from npcs"). */
    condiCleanseArcdpsByMinion?: number;
    /** Cleanses performed ON a minion ("vs npcs"). Matches `condiCleanseMinions`. */
    condiCleanseArcdpsOnMinion?: number;
    /** Boon strips under the same arcdps methodology. @see condiCleanseArcdps */
    boonStripsArcdps?: number;
    /** Strips performed BY a minion, credited to its master ("from npcs"). */
    boonStripsArcdpsByMinion?: number;
    /** Strips performed ON a minion ("vs npcs"). */
    boonStripsArcdpsOnMinion?: number;
    condiCleanseTimeSelf?: number;
    boonStrips: number;
    boonStripsTime?: number;
    boonStripDownContribution?: number;
    boonStripDownContributionTime?: number;
    stunBreak?: number;
    removedStunDuration?: number;
    resurrects: number;
    resurrectTime?: number;
}
