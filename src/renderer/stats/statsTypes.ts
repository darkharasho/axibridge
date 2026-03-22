
export interface SkillUsagePlayer {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    logs: number;
    totalActiveSeconds?: number;
    skillTotals: Record<string, number>;
}

export interface SkillOption {
    id: string;
    name: string;
    total: number;
    autoAttack?: boolean;
    isTraitProc?: boolean;
    isGearProc?: boolean;
    isUnconditionalProc?: boolean;
    icon?: string;
}

export interface SkillUsageLogRecord {
    id: string;
    label: string;
    timestamp: number;
    skillEntries: Record<string, { name: string; icon?: string; players: Record<string, number> }>;
    playerActiveSeconds?: Record<string, number>;
    durationSeconds?: number;
}

export interface SkillUsageSummary {
    logRecords: SkillUsageLogRecord[];
    players: SkillUsagePlayer[];
    skillOptions: SkillOption[];
    resUtilitySkills?: Array<{ id: string; name: string; icon?: string }>;
}

export interface PlayerSkillDamageEntry {
    id: string;
    name: string;
    icon?: string;
    damage: number;
    downContribution: number;
}

export interface PlayerSkillBreakdown {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    totalFightMs: number;
    skills: PlayerSkillDamageEntry[];
    skillMap?: Record<string, PlayerSkillDamageEntry>;
}

export interface ApmPlayerRow {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    logs: number;
    totalActiveSeconds: number;
    totalCasts: number;
    totalAutoCasts: number;
    totalProcCasts: number;
    apm: number;
    apmNoAuto: number;
    apmNoProcs: number;
    aps: number;
    apsNoAuto: number;
    apsNoProcs: number;
}

export interface ApmSkillEntry {
    id: string;
    name: string;
    icon?: string;
    totalCasts: number;
    playerCounts: Map<string, number>;
}

export interface ApmSpecBucket {
    profession: string;
    players: SkillUsagePlayer[];
    playerRows: ApmPlayerRow[];
    totalActiveSeconds: number;
    totalCasts: number;
    totalAutoCasts: number;
    totalProcCasts: number;
    skills: ApmSkillEntry[];
    skillMap: Map<string, ApmSkillEntry>;
}

export interface PlayerHealingSkillEntry {
    id: string;
    name: string;
    icon?: string;
    total: number;
    hits: number;
    max: number;
}

export interface PlayerHealingBreakdown {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    totalHealing: number;
    totalBarrier: number;
    healingSkills: PlayerHealingSkillEntry[];
    barrierSkills: PlayerHealingSkillEntry[];
}
