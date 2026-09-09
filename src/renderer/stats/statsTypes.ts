
export type { ReplayFightPayload, ReplayDpsSample, ReplayKillEvent,
    DamageSpikeEvent, RallyEvent, TargetFocusSample } from './map/replayTypes';
export type { PlayerSkillDamageEntry, PlayerHealingSkillEntry } from '@axiapps/bridge-metrics/aggregationTypes';
import type { PlayerSkillDamageEntry, PlayerHealingSkillEntry } from '@axiapps/bridge-metrics/aggregationTypes';

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
    hasHealAddon: boolean;
}

export interface RoleClassificationEntry {
    account: string;
    profession?: string;
    professionList?: string[];
    role: 'support' | 'damage';
    supportScore?: number;
    confidenceScore?: number;
    threshold?: number;
    factors?: unknown[];
}

export interface RevivePlayerRow {
    key: string;
    account: string;
    profession: string;
    /** Summed active time over the covered logs this player appeared in, used
     *  as the denominator for the section's per-1s / per-60s rate toggle. It is
     *  accumulated alongside the counts under the SAME player key, so the rate
     *  denominator can never be looked up under a different key convention.
     *  Absent (or 0) on reports published before this field existed — the
     *  section renders a dash rather than inventing a denominator. */
    activeMs: number;
    attempts: number;
    attemptTimeMs: number;
    handRevives: number;
    successRate: number;
    utilityCasts: number;
    utilityRevives: number;
    revivesPerCast: number;
    assists: number;
    totalRevives: number;
}

export interface ReviveUtilityRow {
    skillId: number;
    name: string;
    casts: number;
    revives: number;
    revivesPerCast: number;
    topCasterKey: string | null;
}

export interface ReviveDetailSummary {
    coverage: { logsWithData: number; logsWithoutData: number };
    squad: {
        downs: number;
        recovered: number;
        died: number;
        hand: number;
        utility: number;
        self: number;
        unattributed: number;
    };
    players: RevivePlayerRow[];
    utilities: ReviveUtilityRow[];
    iol: {
        revives: number;
        survived: number;
        reDowned: number;
        medianTimeToReDownMs: number | null;
    } | null;
}

export interface ReviveDetailFrame {
    acc: import('./computeReviveDetail').ReviveDetailAccumulator;
}
