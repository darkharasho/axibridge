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
}

export interface Player {
    name: string;
    display_name: string;
    character_name: string;
    profession: string;
    elite_spec: number;
    group: number;
    dpsAll: StatsAll[];
    defenses: Defenses[];
    support: Support[];
    extHealingStats?: {
        outgoingHealingAllies?: { healing: number }[][];
    };
    extBarrierStats?: {
        outgoingBarrierAllies?: { barrier: number }[][];
    };
    squadBuffVolumes?: SquadBuffVolume[];
    buffUptimes?: BuffUptimes[];
    totalDamageDist?: TotalDamageDist[][];
    totalDamageTaken?: TotalDamageTaken[][];
    statsTargets?: StatsTarget[][];
    notInSquad?: boolean;
    account?: string;
    stabGeneration?: number; // Calculated field
}

export interface StatsAll {
    dps: number;
    damage: number;
    breakbarDamage: number;
    downContribution?: number; // Added back as optional
    stackDist?: number;
    distToCom?: number;
}

// Correct Defenses interface based on standard Elite Insights JSON
export interface Defenses {
    downCount: number;
    deadCount: number;
    missedCount: number;
    blockedCount: number;
    evadedCount: number;
    dodgeCount: number;
    interruptedCount: number;
    damageTaken: number;
    boonStrips?: number; // Incoming strips often appear here or in support depending on parsing context, adding as optional
}

export interface SquadBuffVolume {
    id: number;
    buffVolumeData: { outgoing: number }[];
}

export interface BuffUptimes {
    id: number;
    buffData: { uptime: number }[];
    statesPerSource: { [key: string]: number[][] };
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
    max: number;
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
}

export interface StatsTarget {
    killed: number;
    downed: number;
    downContribution: number;
    againstDownedCount: number;
    againstDownedDamage: number;
}


export interface Support {
    condiCleanse: number;
    condiCleanseSelf: number;
    boonStrips: number;
    resurrects: number;
}
