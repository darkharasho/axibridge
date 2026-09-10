
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

/** One caster's share of a single utility, for the utility row's expansion.
 *  Casters who cast the utility without ever being credited a revive are
 *  included with `revives: 0` — omitting them would make the per-caster casts
 *  fail to sum to the row's own cast count. */
export interface ReviveUtilityCasterRow {
    key: string;
    account: string;
    profession: string;
    casts: number;
    revives: number;
    revivesPerCast: number;
}

export interface ReviveUtilityRow {
    skillId: number;
    name: string;
    /** Skill icon URL taken from the log's own skill map. Null when the log
     *  carried none, and absent entirely on reports published before this
     *  field existed — render the name without an icon in both cases. */
    icon?: string | null;
    casts: number;
    revives: number;
    revivesPerCast: number;
    topCasterKey: string | null;
    /** Absent on reports published before the expansion shipped; the row still
     *  renders, it simply does not expand. */
    casters?: ReviveUtilityCasterRow[];
}

/** Upper bound in milliseconds for each time-to-re-down bucket; the final
 *  bucket is unbounded. Bucketed at finalize rather than carrying the raw
 *  times, so a published report grows by a fixed handful of integers no matter
 *  how many fights it covers. */
export const REVIVE_RE_DOWN_BUCKETS_MS = [5000, 10000, 20000, 60000] as const;

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
        /** Histogram of time from standing up to going down again, one count
         *  per `REVIVE_RE_DOWN_BUCKETS_MS` boundary plus a trailing unbounded
         *  bucket. Sums to `reDowned`; survivors are not in it. Absent on
         *  reports published before the graph shipped. */
        timeToReDownBuckets?: number[];
    } | null;
}

export interface ReviveDetailFrame {
    acc: import('./computeReviveDetail').ReviveDetailAccumulator;
}
