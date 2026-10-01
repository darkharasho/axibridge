import { useEffect, useMemo, useRef, useState } from 'react';
import { Brush, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { Clock3, Target, Route, Skull } from 'lucide-react';
import { CommanderTagIcon } from '../../ui/CommanderTagIcon';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';
import { ChartTooltip } from '../ui/ChartTooltip';

type CommanderFightRow = {
    id: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    mapName: string;
    durationMs: number;
    duration: string;
    isWin: boolean;
    squadCount: number;
    enemyCount: number;
    kills: number;
    downs: number;
    commanderDowns: number;
    commanderDeaths: number;
    alliesDown: number;
    alliesDead: number;
    damageTaken: number;
    damageTakenPerMinute: number;
    incomingBarrierAbsorbed: number;
    incomingBarrierAbsorbedPerMinute: number;
    incomingStrips: number;
    incomingStripsPerMinute: number;
    incomingCC: number;
    incomingCCPerMinute: number;
    timeToFirstEnemyDownMs: number | null;
    timeToFirstEnemyDeathMs: number | null;
    downToKillConversionMs: number | null;
    hadEarlyDown: boolean | null;
    wasStalledPush: boolean | null;
    downToKillConversionPct: number | null;
    failedDownEstimate: number;
    distanceTraveled: number | null;
    movementPerMinute: number | null;
    stationaryPct: number | null;
    movementBurstCount: number | null;
    commanderDiedAtMs: number | null;
    squadDeathsAfterTagDeath: number | null;
    enemyKillsAfterTagDeath: number | null;
    collapsedAfterTagDeath: boolean | null;
    recoveredAfterTagDeath: boolean | null;
    boonUptimePct: number;
    boonEntries: number;
    incomingDamageBySkill: Array<{ id: string; name: string; icon?: string; damage: number; hits: number }>;
    incomingBoonUptimes: Array<{ id: string; name: string; icon?: string; stacking: boolean; uptimePct: number; uptimeMs: number; buckets5s: number[] }>;
    incomingDamageBuckets5s: number[];
    incomingBoonBuckets5s: number[];
};

type CommanderSummaryRow = {
    key: string;
    account: string;
    characterNames: string[];
    profession: string;
    professionList: string[];
    fights: number;
    wins: number;
    losses: number;
    winRatePct: number;
    totalDurationMs: number;
    avgSquadSize: number;
    avgEnemySize: number;
    kills: number;
    downs: number;
    commanderDowns: number;
    commanderDeaths: number;
    alliesDown: number;
    alliesDead: number;
    kdr: number;
    damageTaken: number;
    damageTakenPerMinute: number;
    incomingBarrierAbsorbed: number;
    incomingBarrierAbsorbedPerMinute: number;
    incomingStrips: number;
    incomingStripsPerMinute: number;
    incomingCC: number;
    incomingCCPerMinute: number;
    avgTimeToFirstEnemyDownMs: number | null;
    avgTimeToFirstEnemyDeathMs: number | null;
    avgDownToKillConversionMs: number | null;
    pushesWithEarlyDownPct: number | null;
    stalledPushPct: number | null;
    downToKillConversionPct: number | null;
    avgKillsPerFight: number | null;
    avgDownsPerFight: number | null;
    failedDownEstimate: number;
    avgCommanderDistanceTraveled: number | null;
    avgCommanderMovementPerMinute: number | null;
    avgTagStationaryPct: number | null;
    avgTagMovementBurstCount: number | null;
    fightsWithCommanderDeath: number;
    avgSquadDeathsAfterTagDeath: number | null;
    avgEnemyKillsAfterTagDeath: number | null;
    squadCollapseAfterTagDeathPct: number | null;
    recoveryAfterTagDeathPct: number | null;
    boonUptimePct: number;
    boonEntries: number;
    incomingSkillBreakdown: Array<{ id: string; name: string; icon?: string; damage: number; hits: number }>;
    incomingBoonBreakdown: Array<{ id: string; name: string; icon?: string; stacking: boolean; uptimePct: number }>;
    fightsData: CommanderFightRow[];
};

type CommanderStatsSectionProps = {
    commanderStats: { rows?: CommanderSummaryRow[] } | null | undefined;
    getProfessionIconPath: (profession: string) => string | null;
};

// fightsData is stored oldest-first (shortLabel F1 = earliest); every
// per-fight list here shows the newest fight first.
const newestFirst = (fights: CommanderFightRow[] | undefined): CommanderFightRow[] => [...(fights || [])].reverse();

const formatDuration = (timeMs: number) => {
    const totalSeconds = Math.max(0, Math.floor(Number(timeMs || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    return `${seconds}s`;
};

const formatRate = (value: number, digits = 1) => Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
});

const formatInt = (value: number) => Math.round(Number(value || 0)).toLocaleString();
const formatNullableDuration = (value: number | null | undefined) => (
    typeof value === 'number' && Number.isFinite(value) ? formatDuration(value) : 'N/A'
);
const formatNullablePct = (value: number | null | undefined, digits = 1) => (
    typeof value === 'number' && Number.isFinite(value) ? `${formatRate(value, digits)}%` : 'N/A'
);
const formatNullableNumber = (value: number | null | undefined, digits = 1) => (
    typeof value === 'number' && Number.isFinite(value) ? formatRate(value, digits) : 'N/A'
);
/**
 * Every `avg*` field on a commander row is a mean over that commander's FIGHTS
 * (see computeCommanderStats.ts) — none of them average anything within a single
 * fight. A one-fight report therefore averages one sample: the value is just
 * that fight's, and the "Avg" prefix advertises a spread that cannot exist.
 * These headers drop it, and the two columns that become verbatim duplicates of
 * a neighbouring total are dropped outright.
 */
const avgLabel = (singleFight: boolean, averaged: string, plain: string) => (singleFight ? plain : averaged);

const pushTimingStatus = (fight: CommanderFightRow) => {
    if (fight.hadEarlyDown === null) return 'N/A';
    if (fight.wasStalledPush === true) return 'Stalled';
    if (fight.hadEarlyDown === true) return 'Early Down';
    return 'Slow Start';
};

export const CommanderTargetConversionSection = ({
    commanderStats
}: Omit<CommanderStatsSectionProps, 'getProfessionIconPath'>) => {
    const { singleFight } = useStatsSharedContext();
    const rows = useMemo(
        () => (Array.isArray(commanderStats?.rows) ? commanderStats?.rows || [] : []),
        [commanderStats]
    );
    const [selectedCommanderKey, setSelectedCommanderKey] = useState<string>('');

    useEffect(() => {
        if (rows.length === 0) {
            setSelectedCommanderKey('');
            return;
        }
        if (!selectedCommanderKey || !rows.some((row) => row.key === selectedCommanderKey)) {
            setSelectedCommanderKey(rows[0].key);
        }
    }, [rows, selectedCommanderKey]);

    const selectedCommander = useMemo(
        () => rows.find((row) => row.key === selectedCommanderKey) || rows[0] || null,
        [rows, selectedCommanderKey]
    );

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Target className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Target Conversion</h3>
                <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: 'var(--axi-text-dim)' }}>
                    {rows.length} Commanders
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="axi-empty">No target conversion data available.</div>
            ) : (
                <div className="space-y-4 min-w-0">
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="axi-table min-w-[700px]">
                            <thead>
                                <tr>
                                    <th>Commander</th>
                                    <th>Down To Kill %</th>
                                    {/* At one fight these are totalDowns/1 and
                                        totalKills/1 — the same numbers as Enemy
                                        Downs and Enemy Kills two columns over. */}
                                    {!singleFight && <th>Avg Downs / Fight</th>}
                                    {!singleFight && <th>Avg Kills / Fight</th>}
                                    <th>Failed Downs</th>
                                    <th>Enemy Downs</th>
                                    <th>Enemy Kills</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={`${row.key}-target-conversion`}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className="cursor-pointer transition-colors"
                                        aria-current={selectedCommander?.key === row.key ? true : undefined}
                                    >
                                        <td className="axi-ink-plain font-semibold truncate">{row.account}</td>
                                        <td className="axi-table__num">{formatNullablePct(row.downToKillConversionPct)}</td>
                                        {!singleFight && <td className="axi-table__num">{formatNullableNumber(row.avgDownsPerFight, 1)}</td>}
                                        {!singleFight && <td className="axi-table__num">{formatNullableNumber(row.avgKillsPerFight, 1)}</td>}
                                        <td className="axi-table__num">{formatInt(row.failedDownEstimate)}</td>
                                        <td className="axi-table__num">{formatInt(row.downs)}</td>
                                        <td className="axi-table__num">{formatInt(row.kills)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        <div className="overflow-x-auto min-w-0">
                            <table className="axi-table min-w-[620px]">
                                <thead>
                                    <tr>
                                        <th>Fight</th>
                                        <th>Enemy Downs</th>
                                        <th>Enemy Kills</th>
                                        <th>Conversion %</th>
                                        <th>Failed Downs</th>
                                        <th>Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {newestFirst(selectedCommander.fightsData).map((fight) => (
                                        <tr key={`${fight.id}-target-conversion`}>
                                            <td className="axi-ink-plain">{fight.shortLabel} • {fight.fullLabel || fight.mapName || 'Unknown'}</td>
                                            <td className="axi-table__num">{formatInt(fight.downs)}</td>
                                            <td className="axi-table__num">{formatInt(fight.kills)}</td>
                                            <td className="axi-table__num">{formatNullablePct(fight.downToKillConversionPct)}</td>
                                            <td className="axi-table__num">{formatInt(fight.failedDownEstimate)}</td>
                                            <td className={`py-2 px-3 text-right font-semibold ${fight.isWin ? 'axi-ink-ok' : 'axi-ink-danger'}`}>
                                                {fight.isWin ? 'Win' : 'Loss'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const CommanderTagMovementSection = ({
    commanderStats
}: Omit<CommanderStatsSectionProps, 'getProfessionIconPath'>) => {
    const { singleFight } = useStatsSharedContext();

    const rows = useMemo(
        () => (Array.isArray(commanderStats?.rows) ? commanderStats?.rows || [] : []),
        [commanderStats]
    );
    const [selectedCommanderKey, setSelectedCommanderKey] = useState<string>('');

    useEffect(() => {
        if (rows.length === 0) {
            setSelectedCommanderKey('');
            return;
        }
        if (!selectedCommanderKey || !rows.some((row) => row.key === selectedCommanderKey)) {
            setSelectedCommanderKey(rows[0].key);
        }
    }, [rows, selectedCommanderKey]);

    const selectedCommander = useMemo(
        () => rows.find((row) => row.key === selectedCommanderKey) || rows[0] || null,
        [rows, selectedCommanderKey]
    );
    const hasAnyMovementData = useMemo(
        () => rows.some((row) => (
            row.avgCommanderDistanceTraveled !== null
            || row.avgCommanderMovementPerMinute !== null
            || row.avgTagStationaryPct !== null
        )),
        [rows]
    );

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Route className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Tag Movement</h3>
                <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: 'var(--axi-text-dim)' }}>
                    {rows.length} Commanders
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="axi-empty">No tag movement data available.</div>
            ) : (
                <div className="space-y-4 min-w-0">
                    {!hasAnyMovementData ? (
                        <div className="axi-well axi-well--sm axi-edge-ok text-xs axi-ink-ok">
                            Tag movement is unavailable for these logs because commander replay positions were not present.
                        </div>
                    ) : null}
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="axi-table min-w-[700px]">
                            <thead>
                                <tr>
                                    <th>Commander</th>
                                    <th>{avgLabel(singleFight, 'Avg Distance', 'Distance')}</th>
                                    <th>Move / Min</th>
                                    <th>Stationary %</th>
                                    <th>Move Bursts</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={`${row.key}-tag-movement`}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className="cursor-pointer transition-colors"
                                        aria-current={selectedCommander?.key === row.key ? true : undefined}
                                    >
                                        <td className="axi-ink-plain font-semibold truncate">{row.account}</td>
                                        <td className="axi-table__num">{formatNullableNumber(row.avgCommanderDistanceTraveled, 0)}</td>
                                        <td className="axi-table__num">{formatNullableNumber(row.avgCommanderMovementPerMinute, 1)}</td>
                                        <td className="axi-table__num">{formatNullablePct(row.avgTagStationaryPct)}</td>
                                        <td className="axi-table__num">{formatNullableNumber(row.avgTagMovementBurstCount, 1)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        <div className="overflow-x-auto min-w-0">
                            <table className="axi-table min-w-[620px]">
                                <thead>
                                    <tr>
                                        <th>Fight</th>
                                        <th>Distance</th>
                                        <th>Move / Min</th>
                                        <th>Stationary %</th>
                                        <th>Bursts</th>
                                        <th>Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {newestFirst(selectedCommander.fightsData).map((fight) => (
                                        <tr key={`${fight.id}-tag-movement`}>
                                            <td className="axi-ink-plain">{fight.shortLabel} • {fight.fullLabel || fight.mapName || 'Unknown'}</td>
                                            <td className="axi-table__num">{formatNullableNumber(fight.distanceTraveled, 0)}</td>
                                            <td className="axi-table__num">{formatNullableNumber(fight.movementPerMinute, 1)}</td>
                                            <td className="axi-table__num">{formatNullablePct(fight.stationaryPct)}</td>
                                            <td className="axi-table__num">{formatNullableNumber(fight.movementBurstCount, 0)}</td>
                                            <td className={`py-2 px-3 text-right font-semibold ${fight.isWin ? 'axi-ink-ok' : 'axi-ink-danger'}`}>
                                                {fight.isWin ? 'Win' : 'Loss'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const CommanderTagDeathResponseSection = ({
    commanderStats
}: Omit<CommanderStatsSectionProps, 'getProfessionIconPath'>) => {
    const { singleFight } = useStatsSharedContext();

    const rows = useMemo(
        () => (Array.isArray(commanderStats?.rows) ? commanderStats?.rows || [] : []),
        [commanderStats]
    );
    const [selectedCommanderKey, setSelectedCommanderKey] = useState<string>('');

    useEffect(() => {
        if (rows.length === 0) {
            setSelectedCommanderKey('');
            return;
        }
        if (!selectedCommanderKey || !rows.some((row) => row.key === selectedCommanderKey)) {
            setSelectedCommanderKey(rows[0].key);
        }
    }, [rows, selectedCommanderKey]);

    const selectedCommander = useMemo(
        () => rows.find((row) => row.key === selectedCommanderKey) || rows[0] || null,
        [rows, selectedCommanderKey]
    );
    const deathFights = useMemo(
        () => newestFirst(selectedCommander?.fightsData).filter((fight) => fight.commanderDiedAtMs !== null),
        [selectedCommander]
    );
    const hasPostDeathEnemyData = useMemo(
        () => rows.some((row) => row.avgEnemyKillsAfterTagDeath !== null),
        [rows]
    );

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Skull className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Squad Response To Tag Death</h3>
                <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: 'var(--axi-text-dim)' }}>
                    {rows.length} Commanders
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="axi-empty">No commander death response data available.</div>
            ) : (
                <div className="space-y-4 min-w-0">
                    {!hasPostDeathEnemyData ? (
                        <div className="axi-well axi-well--sm axi-edge-danger text-xs axi-ink-danger">
                            Post-death enemy kill counts are unavailable for these logs because enemy replay death timestamps were not present.
                        </div>
                    ) : null}
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="axi-table min-w-[760px]">
                            <thead>
                                <tr>
                                    <th>Commander</th>
                                    <th>Fights With Tag Death</th>
                                    <th>Collapse Rate</th>
                                    <th>{avgLabel(singleFight, 'Avg Squad Deaths After', 'Squad Deaths After')}</th>
                                    <th>{avgLabel(singleFight, 'Avg Enemy Kills After', 'Enemy Kills After')}</th>
                                    <th>Recovery Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={`${row.key}-tag-death-response`}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className="cursor-pointer transition-colors"
                                        aria-current={selectedCommander?.key === row.key ? true : undefined}
                                    >
                                        <td className="axi-ink-plain font-semibold truncate">{row.account}</td>
                                        <td className="axi-table__num">{formatInt(row.fightsWithCommanderDeath)}</td>
                                        <td className="axi-table__num">{formatNullablePct(row.squadCollapseAfterTagDeathPct)}</td>
                                        <td className="axi-table__num">{formatNullableNumber(row.avgSquadDeathsAfterTagDeath, 1)}</td>
                                        <td className="axi-table__num">{formatNullableNumber(row.avgEnemyKillsAfterTagDeath, 1)}</td>
                                        <td className="axi-table__num">{formatNullablePct(row.recoveryAfterTagDeathPct)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        deathFights.length === 0 ? (
                            <div className="axi-empty">This commander has no fights with a recorded tag death.</div>
                        ) : (
                            <div className="overflow-x-auto min-w-0">
                                <table className="axi-table min-w-[700px]">
                                    <thead>
                                        <tr>
                                            <th>Fight</th>
                                            <th>Commander Died At</th>
                                            <th>Squad Deaths After</th>
                                            <th>Enemy Kills After</th>
                                            <th>Collapse</th>
                                            <th>Recovery</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {deathFights.map((fight) => (
                                            <tr key={`${fight.id}-tag-death-response`}>
                                                <td className="axi-ink-plain">{fight.shortLabel} • {fight.fullLabel || fight.mapName || 'Unknown'}</td>
                                                <td className="axi-table__num">{formatNullableDuration(fight.commanderDiedAtMs)}</td>
                                                <td className="axi-table__num">{formatNullableNumber(fight.squadDeathsAfterTagDeath, 0)}</td>
                                                <td className="axi-table__num">{formatNullableNumber(fight.enemyKillsAfterTagDeath, 0)}</td>
                                                <td
                                                    className={`py-2 px-3 text-right font-semibold ${
                                                        fight.collapsedAfterTagDeath === null
                                                            ? 'text-[color:var(--axi-text-dim)]'
                                                            : (fight.collapsedAfterTagDeath ? 'axi-ink-danger' : 'axi-ink-ok')
                                                    }`}
                                                >
                                                    {fight.collapsedAfterTagDeath === null ? 'N/A' : (fight.collapsedAfterTagDeath ? 'Yes' : 'No')}
                                                </td>
                                                <td
                                                    className={`py-2 px-3 text-right font-semibold ${
                                                        fight.recoveredAfterTagDeath === null
                                                            ? 'text-[color:var(--axi-text-dim)]'
                                                            : (fight.recoveredAfterTagDeath ? 'axi-ink-ok' : 'axi-ink-danger')
                                                    }`}
                                                >
                                                    {fight.recoveredAfterTagDeath === null ? 'N/A' : (fight.recoveredAfterTagDeath ? 'Yes' : 'No')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}
                </div>
            )}
        </div>
    );
};

export const CommanderPushTimingSection = ({
    commanderStats
}: Omit<CommanderStatsSectionProps, 'getProfessionIconPath'>) => {
    const { singleFight } = useStatsSharedContext();

    const rows = useMemo(
        () => (Array.isArray(commanderStats?.rows) ? commanderStats?.rows || [] : []),
        [commanderStats]
    );
    const [selectedCommanderKey, setSelectedCommanderKey] = useState<string>('');

    useEffect(() => {
        if (rows.length === 0) {
            setSelectedCommanderKey('');
            return;
        }
        if (!selectedCommanderKey || !rows.some((row) => row.key === selectedCommanderKey)) {
            setSelectedCommanderKey(rows[0].key);
        }
    }, [rows, selectedCommanderKey]);

    const selectedCommander = useMemo(
        () => rows.find((row) => row.key === selectedCommanderKey) || rows[0] || null,
        [rows, selectedCommanderKey]
    );
    const hasAnyTimingData = useMemo(
        () => rows.some((row) => (
            row.avgTimeToFirstEnemyDownMs !== null
            || row.avgTimeToFirstEnemyDeathMs !== null
            || row.avgDownToKillConversionMs !== null
        )),
        [rows]
    );

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Clock3 className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Push Timing</h3>
                <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: 'var(--axi-text-dim)' }}>
                    {rows.length} Commanders
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="axi-empty">No push timing data available.</div>
            ) : (
                <div className="space-y-4 min-w-0">
                    {!hasAnyTimingData ? (
                        <div className="axi-well axi-well--sm axi-edge-warn text-xs axi-ink-warn">
                            Exact push timing is unavailable for these logs because enemy replay down/death timestamps were not present.
                        </div>
                    ) : null}
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="axi-table min-w-[640px]">
                            <thead>
                                <tr>
                                    <th>Commander</th>
                                    <th>{avgLabel(singleFight, 'Avg To First Down', 'To First Down')}</th>
                                    <th>{avgLabel(singleFight, 'Avg To First Kill', 'To First Kill')}</th>
                                    <th>{avgLabel(singleFight, 'Avg Down To Kill', 'Down To Kill')}</th>
                                    <th>Early Push %</th>
                                    <th>Stalled %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={`${row.key}-push-summary`}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className="cursor-pointer transition-colors"
                                        aria-current={selectedCommander?.key === row.key ? true : undefined}
                                    >
                                        <td className="axi-ink-plain font-semibold truncate">{row.account}</td>
                                        <td className="axi-table__num">{formatNullableDuration(row.avgTimeToFirstEnemyDownMs)}</td>
                                        <td className="axi-table__num">{formatNullableDuration(row.avgTimeToFirstEnemyDeathMs)}</td>
                                        <td className="axi-table__num">{formatNullableDuration(row.avgDownToKillConversionMs)}</td>
                                        <td className="axi-table__num">{formatNullablePct(row.pushesWithEarlyDownPct)}</td>
                                        <td className="axi-table__num">{formatNullablePct(row.stalledPushPct)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        <div className="overflow-x-auto min-w-0">
                            <table className="axi-table min-w-[560px]">
                                <thead>
                                    <tr>
                                        <th>Fight</th>
                                        <th>Result</th>
                                        <th>To First Down</th>
                                        <th>To First Kill</th>
                                        <th>Down To Kill</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {newestFirst(selectedCommander.fightsData).map((fight) => (
                                        <tr key={`${fight.id}-push-timing`}>
                                            <td className="axi-ink-plain">{fight.shortLabel} • {fight.fullLabel || fight.mapName || 'Unknown'}</td>
                                            <td className={`py-2 px-3 text-right font-semibold ${fight.isWin ? 'axi-ink-ok' : 'axi-ink-danger'}`}>
                                                {fight.isWin ? 'Win' : 'Loss'}
                                            </td>
                                            <td className="axi-table__num">{formatNullableDuration(fight.timeToFirstEnemyDownMs)}</td>
                                            <td className="axi-table__num">{formatNullableDuration(fight.timeToFirstEnemyDeathMs)}</td>
                                            <td className="axi-table__num">{formatNullableDuration(fight.downToKillConversionMs)}</td>
                                            <td className="axi-table__num font-semibold">{pushTimingStatus(fight)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const CommanderStatsSection = ({
    commanderStats,
    getProfessionIconPath
}: CommanderStatsSectionProps) => {
    const { singleFight } = useStatsSharedContext();

    const rows = useMemo(
        () => (Array.isArray(commanderStats?.rows) ? commanderStats?.rows || [] : []),
        [commanderStats]
    );
    const [selectedCommanderKey, setSelectedCommanderKey] = useState<string>('');
    const [selectedFightId, setSelectedFightId] = useState<string>('');
    const [timelineMode, setTimelineMode] = useState<'incomingDamage' | 'incomingBoons'>('incomingDamage');
    const [selectedBucketIndex, setSelectedBucketIndex] = useState<number | null>(null);
    const chartContainerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (rows.length === 0) {
            setSelectedCommanderKey('');
            return;
        }
        if (!selectedCommanderKey || !rows.some((row) => row.key === selectedCommanderKey)) {
            setSelectedCommanderKey(rows[0].key);
        }
    }, [rows, selectedCommanderKey]);

    const selectedCommander = useMemo(
        () => rows.find((row) => row.key === selectedCommanderKey) || rows[0] || null,
        [rows, selectedCommanderKey]
    );

    useEffect(() => {
        const fights = selectedCommander?.fightsData || [];
        if (fights.length === 0) {
            setSelectedFightId('');
            return;
        }
        if (!selectedFightId || !fights.some((fight) => fight.id === selectedFightId)) {
            setSelectedFightId(fights[fights.length - 1].id);
        }
    }, [selectedCommander, selectedFightId]);

    const selectedFight = useMemo(() => {
        const fights = selectedCommander?.fightsData || [];
        return fights.find((fight) => fight.id === selectedFightId) || fights[fights.length - 1] || null;
    }, [selectedCommander, selectedFightId]);

    useEffect(() => {
        setSelectedBucketIndex(null);
    }, [selectedFightId, timelineMode, selectedCommanderKey]);

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            const root = chartContainerRef.current;
            if (!root) return;
            if (root.contains(event.target as Node)) return;
            setSelectedBucketIndex(null);
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, []);

    const timelineData = useMemo(() => {
        const fight = selectedFight;
        if (!fight) return [] as Array<{ bucket: string; value: number; index: number }>;
        const source = timelineMode === 'incomingDamage'
            ? (fight.incomingDamageBuckets5s || [])
            : (fight.incomingBoonBuckets5s || []);
        return source.map((value, idx) => ({
            bucket: `${idx * 5}-${idx * 5 + 5}s`,
            value: Number(value || 0),
            index: idx
        }));
    }, [selectedFight, timelineMode]);

    const filteredIncomingDamageRows = useMemo(() => {
        const rows = selectedFight?.incomingDamageBySkill || [];
        if (selectedBucketIndex === null || selectedBucketIndex < 0) return rows.slice(0, 12);
        const bucketTotal = Number(selectedFight?.incomingDamageBuckets5s?.[selectedBucketIndex] || 0);
        const totalDamage = Math.max(0, rows.reduce((sum, row) => sum + Number(row.damage || 0), 0));
        const estimated = rows.map((row) => {
            const share = totalDamage > 0 ? Number(row.damage || 0) / totalDamage : 0;
            const estDamage = bucketTotal * share;
            const estHits = Number(row.hits || 0) * share;
            return { ...row, damage: estDamage, hits: estHits };
        });
        return estimated
            .filter((row) => Number(row.damage || 0) > 0)
            .sort((a, b) => Number(b.damage || 0) - Number(a.damage || 0))
            .slice(0, 12);
    }, [selectedFight, selectedBucketIndex]);

    const filteredIncomingBoonRows = useMemo(() => {
        const rows = selectedFight?.incomingBoonUptimes || [];
        if (selectedBucketIndex === null || selectedBucketIndex < 0) return rows.slice(0, 12);
        return rows
            .map((row) => {
                const bucketPct = Number(row?.buckets5s?.[selectedBucketIndex] || 0);
                const uptimeMs = (bucketPct / 100) * 5000;
                return { ...row, uptimePct: bucketPct, uptimeMs };
            })
            .filter((row) => Number(row.uptimePct || 0) > 0)
            .sort((a, b) => Number(b.uptimePct || 0) - Number(a.uptimePct || 0))
            .slice(0, 12);
    }, [selectedFight, selectedBucketIndex]);

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <span className="flex shrink-0" style={{ color: 'var(--axi-accent)' }}><CommanderTagIcon className="w-4 h-4" /></span>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Commander Stats</h3>
                <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: 'var(--axi-text-dim)' }}>{rows.length} Commanders</span>
            </div>

            {rows.length === 0 ? (
                <div className="axi-empty">No commander-tag data available.</div>
            ) : (
                <div className="space-y-5 min-w-0">
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="axi-table min-w-[900px]">
                            <thead>
                                <tr>
                                    <th>Commander</th>
                                    {/* One fight, one result: these read 1, 1-0
                                        and 100% — the outcome badge in the page
                                        header, spread over three columns. */}
                                    {!singleFight && <th>Fights</th>}
                                    {!singleFight && <th>W/L</th>}
                                    {!singleFight && <th>Win %</th>}
                                    <th>Squad KDR</th>
                                    <th>{avgLabel(singleFight, 'Avg Squad', 'Squad')}</th>
                                    <th>{avgLabel(singleFight, 'Avg Enemy', 'Enemies')}</th>
                                    <th>Kills</th>
                                    <th>Downs</th>
                                    <th>Time Tagged</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={row.key}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className="cursor-pointer transition-colors"
                                        aria-current={selectedCommander?.key === row.key ? true : undefined}
                                    >
                                        <td>
                                            <div className="axi-table__who">
                                                {getProfessionIconPath(row.profession) ? (
                                                    <img
                                                        src={getProfessionIconPath(row.profession) as string}
                                                        alt={row.profession}
                                                        className="w-4 h-4 object-contain"
                                                    />
                                                ) : null}
                                                <div className="min-w-0">
                                                    <div className="axi-ink-plain font-semibold truncate">{row.account}</div>
                                                    <div className="text-[10px] text-[color:var(--axi-text-dim)] truncate">
                                                        {(row.characterNames || []).join(', ') || 'Unknown'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        {!singleFight && <td className="axi-table__num">{formatInt(row.fights)}</td>}
                                        {!singleFight && <td className="axi-table__num">{formatInt(row.wins)}-{formatInt(row.losses)}</td>}
                                        {!singleFight && <td className="axi-table__num">{formatRate(row.winRatePct, 1)}%</td>}
                                        <td className="axi-table__num">{formatRate(row.kdr, 2)}</td>
                                        <td className="axi-table__num">{formatRate(row.avgSquadSize, 1)}</td>
                                        <td className="axi-table__num">{formatRate(row.avgEnemySize, 1)}</td>
                                        <td className="axi-table__num">{formatInt(row.kills)}</td>
                                        <td className="axi-table__num">{formatInt(row.downs)}</td>
                                        <td className="axi-table__num">{formatDuration(row.totalDurationMs)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        <div className="space-y-4 min-w-0">
                            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
                                <div className="axi-well axi-well--sm" style={{ '--axi-well-pad': '8px 12px' } as React.CSSProperties}>
                                    <div className="text-[10px] uppercase tracking-widest text-[color:var(--axi-text-dim)]">Time Tagged</div>
                                    <div className="text-sm font-semibold axi-ink-plain">{formatDuration(selectedCommander.totalDurationMs)}</div>
                                </div>
                                <div className="axi-well axi-well--sm" style={{ '--axi-well-pad': '8px 12px' } as React.CSSProperties}>
                                    <div className="text-[10px] uppercase tracking-widest text-[color:var(--axi-text-dim)]">Inc. Strips</div>
                                    <div className="text-sm font-semibold axi-ink-plain">{formatInt(selectedCommander.incomingStrips)}</div>
                                </div>
                                <div className="axi-well axi-well--sm" style={{ '--axi-well-pad': '8px 12px' } as React.CSSProperties}>
                                    <div className="text-[10px] uppercase tracking-widest text-[color:var(--axi-text-dim)]">Inc. CC</div>
                                    <div className="text-sm font-semibold axi-ink-plain">{formatInt(selectedCommander.incomingCC)}</div>
                                </div>
                                <div className="axi-well axi-well--sm" style={{ '--axi-well-pad': '8px 12px' } as React.CSSProperties}>
                                    <div className="text-[10px] uppercase tracking-widest text-[color:var(--axi-text-dim)]">Damage Taken</div>
                                    <div className="text-sm font-semibold axi-ink-plain">{formatInt(selectedCommander.damageTaken)}</div>
                                </div>
                                <div className="axi-well axi-well--sm" style={{ '--axi-well-pad': '8px 12px' } as React.CSSProperties}>
                                    <div className="text-[10px] uppercase tracking-widest text-[color:var(--axi-text-dim)]">Barrier Absorbed</div>
                                    <div className="text-sm font-semibold axi-ink-plain">{formatInt(selectedCommander.incomingBarrierAbsorbed)}</div>
                                </div>
                                <div className="axi-well axi-well--sm" style={{ '--axi-well-pad': '8px 12px' } as React.CSSProperties}>
                                    <div className="text-[10px] uppercase tracking-widest text-[color:var(--axi-text-dim)]">Boon Uptime</div>
                                    <div className="text-sm font-semibold axi-ink-plain">{formatRate(selectedCommander.boonUptimePct, 1)}%</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0">
                                <div className="rounded-[var(--axi-radius-sm)] p-3 min-w-0 overflow-x-auto">
                                    <div className="text-xs uppercase tracking-widest text-[color:var(--axi-text-dim)] mb-2">Incoming Damage By Skill</div>
                                    <table className="axi-table min-w-[440px]">
                                        <thead>
                                            <tr>
                                                <th>Skill</th>
                                                <th>Hits</th>
                                                <th>Damage</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(selectedCommander.incomingSkillBreakdown || []).slice(0, 20).map((row) => (
                                                <tr key={row.id}>
                                                    <td className="axi-ink-plain">{row.name}</td>
                                                    <td className="axi-table__num">{formatInt(row.hits)}</td>
                                                    <td className="axi-table__num">{formatInt(row.damage)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="rounded-[var(--axi-radius-sm)] p-3 min-w-0 overflow-x-auto">
                                    <div className="text-xs uppercase tracking-widest text-[color:var(--axi-text-dim)] mb-2">Incoming Boons ({avgLabel(singleFight, 'Average Uptime', 'Uptime')})</div>
                                    <table className="axi-table min-w-[440px]">
                                        <thead>
                                            <tr>
                                                <th>Boon</th>
                                                <th>Uptime %</th>
                                                <th>Stacking</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(selectedCommander.incomingBoonBreakdown || []).slice(0, 20).map((row) => (
                                                <tr key={row.id}>
                                                    <td className="axi-ink-plain">{row.name}</td>
                                                    <td className="axi-table__num">{formatRate(row.uptimePct, 1)}%</td>
                                                    <td className="axi-table__num">{row.stacking ? 'Yes' : 'No'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {selectedFight && (
                                <div className="rounded-[var(--axi-radius-sm)] p-3 min-w-0 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="text-xs uppercase tracking-widest text-[color:var(--axi-text-dim)]">5s Timeline And Fight Breakdown</div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <select
                                                value={selectedFight.id}
                                                onChange={(event) => setSelectedFightId(event.target.value)}
                                                className="axi-select"
                                            >
                                                {newestFirst(selectedCommander.fightsData).map((fight) => (
                                                    <option key={fight.id} value={fight.id}>{fight.shortLabel} • {fight.fullLabel || fight.mapName || 'Unknown'}</option>
                                                ))}
                                            </select>
                                            <PillToggleGroup
                                                value={timelineMode}
                                                onChange={setTimelineMode}
                                                options={[
                                                    { value: 'incomingDamage' as const, label: 'Incoming Damage' },
                                                    { value: 'incomingBoons' as const, label: 'Incoming Boons' },
                                                ]}
                                            />
                                        </div>
                                    </div>

                                    <div ref={chartContainerRef} className="h-[220px] w-full">
                                        <ChartContainer width="100%" height="100%">
                                            <LineChart
                                                data={timelineData}
                                                margin={{ top: 8, right: 14, left: 0, bottom: 0 }}
                                                onClick={(state: any) => {
                                                    const idx = Number(state?.activeTooltipIndex);
                                                    if (!Number.isFinite(idx) || idx < 0) {
                                                        setSelectedBucketIndex(null);
                                                        return;
                                                    }
                                                    setSelectedBucketIndex((prev) => (prev === idx ? null : idx));
                                                }}
                                            >
                                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                                <XAxis dataKey="bucket" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                                                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} width={44} />
                                                <Tooltip
                                                    content={<ChartTooltip />}
                                                    labelFormatter={(value: any) => `${selectedFight.shortLabel} • ${String(value || '')}`}
                                                    formatter={(value: any) => {
                                                        if (timelineMode === 'incomingBoons') {
                                                            return [`${formatRate(Number(value || 0), 1)}%`, 'Incoming Boon Uptime'];
                                                        }
                                                        return [formatInt(Number(value || 0)), 'Incoming Damage'];
                                                    }}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="value"
                                                    stroke={timelineMode === 'incomingBoons' ? '#22d3ee' : '#f87171'}
                                                    strokeWidth={2}
                                                    dot={{ r: 2.5, fill: timelineMode === 'incomingBoons' ? '#22d3ee' : '#f87171' }}
                                                    activeDot={{ r: 5 }}
                                                />
                                                {timelineData.length > 10 && (
                                                    <Brush
                                                        dataKey="bucket"
                                                        height={24}
                                                        stroke="rgba(129,140,248,0.4)"
                                                        fill="rgba(15,23,42,0.8)"
                                                        travellerWidth={8}
                                                        tickFormatter={() => ''}
                                                    />
                                                )}
                                            </LineChart>
                                        </ChartContainer>
                                    </div>

                                    <div className="overflow-x-auto min-w-0">
                                        <div className="text-[11px] uppercase tracking-widest text-[color:var(--axi-text-dim)] mb-1">
                                            {timelineMode === 'incomingDamage' ? 'Fight Incoming Damage By Skill' : 'Fight Incoming Boons'}
                                            {selectedBucketIndex !== null ? ` • ${selectedBucketIndex * 5}-${selectedBucketIndex * 5 + 5}s` : ' • Full Fight'}
                                        </div>
                                        {timelineMode === 'incomingDamage' ? (
                                            <table className="axi-table min-w-[420px]">
                                                <thead>
                                                    <tr>
                                                        <th>Skill</th>
                                                        <th>Hits</th>
                                                        <th>Damage</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredIncomingDamageRows.map((row) => (
                                                        <tr key={row.id}>
                                                            <td className="axi-ink-plain">{row.name}</td>
                                                            <td className="axi-table__num">{formatInt(row.hits)}</td>
                                                            <td className="axi-table__num">{formatInt(row.damage)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <table className="axi-table min-w-[420px]">
                                                <thead>
                                                    <tr>
                                                        <th>Boon</th>
                                                        <th>Uptime %</th>
                                                        <th>Uptime Time</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredIncomingBoonRows.map((row) => (
                                                        <tr key={row.id}>
                                                            <td className="axi-ink-plain">{row.name}</td>
                                                            <td className="axi-table__num">{formatRate(row.uptimePct, 1)}%</td>
                                                            <td className="axi-table__num">{formatDuration(row.uptimeMs)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
