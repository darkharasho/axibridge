
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
}

export interface SkillUsageLogRecord {
    id: string;
    label: string;
    timestamp: number;
    skillEntries: Record<string, { name: string; players: Record<string, number> }>;
    playerActiveSeconds?: Record<string, number>;
    durationSeconds?: number;
}

export interface SkillUsageSummary {
    logRecords: SkillUsageLogRecord[];
    players: SkillUsagePlayer[];
    skillOptions: SkillOption[];
    resUtilitySkills?: Array<{ id: string; name: string }>;
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
    apm: number;
    apmNoAuto: number;
    aps: number;
    apsNoAuto: number;
}

export interface ApmSkillEntry {
    id: string;
    name: string;
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
    skills: ApmSkillEntry[];
    skillMap: Map<string, ApmSkillEntry>;
}
