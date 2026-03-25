import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Clock3, Target, Route, Skull } from 'lucide-react';
import { CommanderTagIcon } from '../../ui/CommanderTagIcon';
import { useStatsSharedContext } from '../StatsViewContext';

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
const pushTimingStatus = (fight: CommanderFightRow) => {
    if (fight.hadEarlyDown === null) return 'N/A';
    if (fight.wasStalledPush === true) return 'Stalled';
    if (fight.hadEarlyDown === true) return 'Early Down';
    return 'Slow Start';
};

export const CommanderTargetConversionSection = ({
    commanderStats
}: Omit<CommanderStatsSectionProps, 'getProfessionIconPath'>) => {
    useStatsSharedContext();
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
            <div className="flex items-center gap-2 mb-3.5">
                <Target className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Target Conversion</h3>
                <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                    {rows.length} Commanders
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="text-center text-[color:var(--text-muted)] italic py-8">No target conversion data available.</div>
            ) : (
                <div className="space-y-4 min-w-0">
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="w-full min-w-[700px] text-xs table-auto">
                            <thead>
                                <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                    <th className="text-left py-2 px-3">Commander</th>
                                    <th className="text-right py-2 px-3">Down To Kill %</th>
                                    <th className="text-right py-2 px-3">Avg Downs / Fight</th>
                                    <th className="text-right py-2 px-3">Avg Kills / Fight</th>
                                    <th className="text-right py-2 px-3">Failed Downs</th>
                                    <th className="text-right py-2 px-3">Enemy Downs</th>
                                    <th className="text-right py-2 px-3">Enemy Kills</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={`${row.key}-target-conversion`}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className={`border-b border-[color:var(--border-subtle)] cursor-pointer transition-colors ${
                                            selectedCommander?.key === row.key ? 'bg-cyan-500/10' : 'hover:bg-[var(--bg-hover)]'
                                        }`}
                                    >
                                        <td className="py-2 px-3 text-gray-100 font-semibold truncate">{row.account}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullablePct(row.downToKillConversionPct)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableNumber(row.avgDownsPerFight, 1)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableNumber(row.avgKillsPerFight, 1)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(row.failedDownEstimate)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(row.downs)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(row.kills)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        <div className="overflow-x-auto min-w-0">
                            <table className="w-full min-w-[620px] text-xs table-auto">
                                <thead>
                                    <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                        <th className="text-left py-2 px-3">Fight</th>
                                        <th className="text-right py-2 px-3">Enemy Downs</th>
                                        <th className="text-right py-2 px-3">Enemy Kills</th>
                                        <th className="text-right py-2 px-3">Conversion %</th>
                                        <th className="text-right py-2 px-3">Failed Downs</th>
                                        <th className="text-right py-2 px-3">Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedCommander.fightsData || []).map((fight) => (
                                        <tr key={`${fight.id}-target-conversion`} className="border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                            <td className="py-2 px-3 text-[color:var(--text-primary)]">{fight.shortLabel} • {fight.mapName || 'Unknown'}</td>
                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(fight.downs)}</td>
                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(fight.kills)}</td>
                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullablePct(fight.downToKillConversionPct)}</td>
                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(fight.failedDownEstimate)}</td>
                                            <td className={`py-2 px-3 text-right font-semibold ${fight.isWin ? 'text-emerald-300' : 'text-rose-300'}`}>
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
            <div className="flex items-center gap-2 mb-3.5">
                <Route className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Tag Movement</h3>
                <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                    {rows.length} Commanders
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="text-center text-[color:var(--text-muted)] italic py-8">No tag movement data available.</div>
            ) : (
                <div className="space-y-4 min-w-0">
                    {!hasAnyMovementData ? (
                        <div className="rounded-[var(--radius-md)] border border-emerald-200/10 bg-[var(--bg-card-inner)] px-3 py-2 text-xs text-emerald-100/80">
                            Tag movement is unavailable for these logs because commander replay positions were not present.
                        </div>
                    ) : null}
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="w-full min-w-[700px] text-xs table-auto">
                            <thead>
                                <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                    <th className="text-left py-2 px-3">Commander</th>
                                    <th className="text-right py-2 px-3">Avg Distance</th>
                                    <th className="text-right py-2 px-3">Move / Min</th>
                                    <th className="text-right py-2 px-3">Stationary %</th>
                                    <th className="text-right py-2 px-3">Move Bursts</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={`${row.key}-tag-movement`}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className={`border-b border-[color:var(--border-subtle)] cursor-pointer transition-colors ${
                                            selectedCommander?.key === row.key ? 'bg-emerald-500/10' : 'hover:bg-[var(--bg-hover)]'
                                        }`}
                                    >
                                        <td className="py-2 px-3 text-gray-100 font-semibold truncate">{row.account}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableNumber(row.avgCommanderDistanceTraveled, 0)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableNumber(row.avgCommanderMovementPerMinute, 1)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullablePct(row.avgTagStationaryPct)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableNumber(row.avgTagMovementBurstCount, 1)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        <div className="overflow-x-auto min-w-0">
                            <table className="w-full min-w-[620px] text-xs table-auto">
                                <thead>
                                    <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                        <th className="text-left py-2 px-3">Fight</th>
                                        <th className="text-right py-2 px-3">Distance</th>
                                        <th className="text-right py-2 px-3">Move / Min</th>
                                        <th className="text-right py-2 px-3">Stationary %</th>
                                        <th className="text-right py-2 px-3">Bursts</th>
                                        <th className="text-right py-2 px-3">Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedCommander.fightsData || []).map((fight) => (
                                        <tr key={`${fight.id}-tag-movement`} className="border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                            <td className="py-2 px-3 text-[color:var(--text-primary)]">{fight.shortLabel} • {fight.mapName || 'Unknown'}</td>
                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableNumber(fight.distanceTraveled, 0)}</td>
                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableNumber(fight.movementPerMinute, 1)}</td>
                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullablePct(fight.stationaryPct)}</td>
                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableNumber(fight.movementBurstCount, 0)}</td>
                                            <td className={`py-2 px-3 text-right font-semibold ${fight.isWin ? 'text-emerald-300' : 'text-rose-300'}`}>
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
        () => (selectedCommander?.fightsData || []).filter((fight) => fight.commanderDiedAtMs !== null),
        [selectedCommander]
    );
    const hasPostDeathEnemyData = useMemo(
        () => rows.some((row) => row.avgEnemyKillsAfterTagDeath !== null),
        [rows]
    );

    return (
        <div>
            <div className="flex items-center gap-2 mb-3.5">
                <Skull className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Squad Response To Tag Death</h3>
                <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                    {rows.length} Commanders
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="text-center text-[color:var(--text-muted)] italic py-8">No commander death response data available.</div>
            ) : (
                <div className="space-y-4 min-w-0">
                    {!hasPostDeathEnemyData ? (
                        <div className="rounded-[var(--radius-md)] border border-rose-200/10 bg-[var(--bg-card-inner)] px-3 py-2 text-xs text-rose-100/80">
                            Post-death enemy kill counts are unavailable for these logs because enemy replay death timestamps were not present.
                        </div>
                    ) : null}
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="w-full min-w-[760px] text-xs table-auto">
                            <thead>
                                <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                    <th className="text-left py-2 px-3">Commander</th>
                                    <th className="text-right py-2 px-3">Fights With Tag Death</th>
                                    <th className="text-right py-2 px-3">Collapse Rate</th>
                                    <th className="text-right py-2 px-3">Avg Squad Deaths After</th>
                                    <th className="text-right py-2 px-3">Avg Enemy Kills After</th>
                                    <th className="text-right py-2 px-3">Recovery Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={`${row.key}-tag-death-response`}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className={`border-b border-[color:var(--border-subtle)] cursor-pointer transition-colors ${
                                            selectedCommander?.key === row.key ? 'bg-rose-500/10' : 'hover:bg-[var(--bg-hover)]'
                                        }`}
                                    >
                                        <td className="py-2 px-3 text-gray-100 font-semibold truncate">{row.account}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(row.fightsWithCommanderDeath)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullablePct(row.squadCollapseAfterTagDeathPct)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableNumber(row.avgSquadDeathsAfterTagDeath, 1)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableNumber(row.avgEnemyKillsAfterTagDeath, 1)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullablePct(row.recoveryAfterTagDeathPct)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        deathFights.length === 0 ? (
                            <div className="text-center text-[color:var(--text-muted)] italic py-4">This commander has no fights with a recorded tag death.</div>
                        ) : (
                            <div className="overflow-x-auto min-w-0">
                                <table className="w-full min-w-[700px] text-xs table-auto">
                                    <thead>
                                        <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                            <th className="text-left py-2 px-3">Fight</th>
                                            <th className="text-right py-2 px-3">Commander Died At</th>
                                            <th className="text-right py-2 px-3">Squad Deaths After</th>
                                            <th className="text-right py-2 px-3">Enemy Kills After</th>
                                            <th className="text-right py-2 px-3">Collapse</th>
                                            <th className="text-right py-2 px-3">Recovery</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {deathFights.map((fight) => (
                                            <tr key={`${fight.id}-tag-death-response`} className="border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                                <td className="py-2 px-3 text-[color:var(--text-primary)]">{fight.shortLabel} • {fight.mapName || 'Unknown'}</td>
                                                <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableDuration(fight.commanderDiedAtMs)}</td>
                                                <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableNumber(fight.squadDeathsAfterTagDeath, 0)}</td>
                                                <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableNumber(fight.enemyKillsAfterTagDeath, 0)}</td>
                                                <td
                                                    className={`py-2 px-3 text-right font-semibold ${
                                                        fight.collapsedAfterTagDeath === null
                                                            ? 'text-[color:var(--text-secondary)]'
                                                            : (fight.collapsedAfterTagDeath ? 'text-rose-300' : 'text-emerald-300')
                                                    }`}
                                                >
                                                    {fight.collapsedAfterTagDeath === null ? 'N/A' : (fight.collapsedAfterTagDeath ? 'Yes' : 'No')}
                                                </td>
                                                <td
                                                    className={`py-2 px-3 text-right font-semibold ${
                                                        fight.recoveredAfterTagDeath === null
                                                            ? 'text-[color:var(--text-secondary)]'
                                                            : (fight.recoveredAfterTagDeath ? 'text-emerald-300' : 'text-rose-300')
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
            <div className="flex items-center gap-2 mb-3.5">
                <Clock3 className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Push Timing</h3>
                <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                    {rows.length} Commanders
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="text-center text-[color:var(--text-muted)] italic py-8">No push timing data available.</div>
            ) : (
                <div className="space-y-4 min-w-0">
                    {!hasAnyTimingData ? (
                        <div className="rounded-[var(--radius-md)] border border-amber-200/10 bg-[var(--bg-card-inner)] px-3 py-2 text-xs text-amber-100/80">
                            Exact push timing is unavailable for these logs because enemy replay down/death timestamps were not present.
                        </div>
                    ) : null}
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="w-full min-w-[640px] text-xs table-auto">
                            <thead>
                                <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                    <th className="text-left py-2 px-3">Commander</th>
                                    <th className="text-right py-2 px-3">Avg To First Down</th>
                                    <th className="text-right py-2 px-3">Avg To First Kill</th>
                                    <th className="text-right py-2 px-3">Avg Down To Kill</th>
                                    <th className="text-right py-2 px-3">Early Push %</th>
                                    <th className="text-right py-2 px-3">Stalled %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={`${row.key}-push-summary`}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className={`border-b border-[color:var(--border-subtle)] cursor-pointer transition-colors ${
                                            selectedCommander?.key === row.key ? 'bg-amber-500/10' : 'hover:bg-[var(--bg-hover)]'
                                        }`}
                                    >
                                        <td className="py-2 px-3 text-gray-100 font-semibold truncate">{row.account}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableDuration(row.avgTimeToFirstEnemyDownMs)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableDuration(row.avgTimeToFirstEnemyDeathMs)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableDuration(row.avgDownToKillConversionMs)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullablePct(row.pushesWithEarlyDownPct)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullablePct(row.stalledPushPct)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        <div className="overflow-x-auto min-w-0">
                            <table className="w-full min-w-[560px] text-xs table-auto">
                                <thead>
                                    <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                        <th className="text-left py-2 px-3">Fight</th>
                                        <th className="text-right py-2 px-3">Result</th>
                                        <th className="text-right py-2 px-3">To First Down</th>
                                        <th className="text-right py-2 px-3">To First Kill</th>
                                        <th className="text-right py-2 px-3">Down To Kill</th>
                                        <th className="text-right py-2 px-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedCommander.fightsData || []).map((fight) => (
                                        <tr key={`${fight.id}-push-timing`} className="border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                            <td className="py-2 px-3 text-[color:var(--text-primary)]">{fight.shortLabel} • {fight.mapName || 'Unknown'}</td>
                                            <td className={`py-2 px-3 text-right font-semibold ${fight.isWin ? 'text-emerald-300' : 'text-rose-300'}`}>
                                                {fight.isWin ? 'Win' : 'Loss'}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableDuration(fight.timeToFirstEnemyDownMs)}</td>
                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableDuration(fight.timeToFirstEnemyDeathMs)}</td>
                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatNullableDuration(fight.downToKillConversionMs)}</td>
                                            <td className="py-2 px-3 text-right font-semibold text-[color:var(--text-primary)]">{pushTimingStatus(fight)}</td>
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
            <div className="flex items-center gap-2 mb-3.5">
                <span className="flex shrink-0" style={{ color: 'var(--brand-primary)' }}><CommanderTagIcon className="w-4 h-4" /></span>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Commander Stats</h3>
                <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{rows.length} Commanders</span>
            </div>

            {rows.length === 0 ? (
                <div className="text-center text-[color:var(--text-muted)] italic py-8">No commander-tag data available.</div>
            ) : (
                <div className="space-y-5 min-w-0">
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="w-full min-w-[900px] text-xs table-auto">
                            <thead>
                                <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                    <th className="text-left py-2 px-3">Commander</th>
                                    <th className="text-right py-2 px-3">Fights</th>
                                    <th className="text-right py-2 px-3">W/L</th>
                                    <th className="text-right py-2 px-3">Win %</th>
                                    <th className="text-right py-2 px-3">Squad KDR</th>
                                    <th className="text-right py-2 px-3">Avg Squad</th>
                                    <th className="text-right py-2 px-3">Avg Enemy</th>
                                    <th className="text-right py-2 px-3">Kills</th>
                                    <th className="text-right py-2 px-3">Downs</th>
                                    <th className="text-right py-2 px-3">Time Tagged</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={row.key}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className={`border-b border-[color:var(--border-subtle)] cursor-pointer transition-colors ${
                                            selectedCommander?.key === row.key ? 'bg-amber-500/10' : 'hover:bg-[var(--bg-hover)]'
                                        }`}
                                    >
                                        <td className="py-2 px-3">
                                            <div className="flex items-center gap-2">
                                                {getProfessionIconPath(row.profession) ? (
                                                    <img
                                                        src={getProfessionIconPath(row.profession) as string}
                                                        alt={row.profession}
                                                        className="w-4 h-4 object-contain"
                                                    />
                                                ) : null}
                                                <div className="min-w-0">
                                                    <div className="text-gray-100 font-semibold truncate">{row.account}</div>
                                                    <div className="text-[10px] text-[color:var(--text-secondary)] truncate">
                                                        {(row.characterNames || []).join(', ') || 'Unknown'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(row.fights)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(row.wins)}-{formatInt(row.losses)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatRate(row.winRatePct, 1)}%</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatRate(row.kdr, 2)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatRate(row.avgSquadSize, 1)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatRate(row.avgEnemySize, 1)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(row.kills)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(row.downs)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatDuration(row.totalDurationMs)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        <div className="space-y-4 min-w-0">
                            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
                                <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)]">Time Tagged</div>
                                    <div className="text-sm font-semibold text-gray-100">{formatDuration(selectedCommander.totalDurationMs)}</div>
                                </div>
                                <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)]">Inc. Strips</div>
                                    <div className="text-sm font-semibold text-gray-100">{formatInt(selectedCommander.incomingStrips)}</div>
                                </div>
                                <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)]">Inc. CC</div>
                                    <div className="text-sm font-semibold text-gray-100">{formatInt(selectedCommander.incomingCC)}</div>
                                </div>
                                <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)]">Damage Taken</div>
                                    <div className="text-sm font-semibold text-gray-100">{formatInt(selectedCommander.damageTaken)}</div>
                                </div>
                                <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)]">Barrier Absorbed</div>
                                    <div className="text-sm font-semibold text-gray-100">{formatInt(selectedCommander.incomingBarrierAbsorbed)}</div>
                                </div>
                                <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)]">Boon Uptime</div>
                                    <div className="text-sm font-semibold text-gray-100">{formatRate(selectedCommander.boonUptimePct, 1)}%</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0">
                                <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] p-3 min-w-0 overflow-x-auto">
                                    <div className="text-xs uppercase tracking-widest text-[color:var(--text-secondary)] mb-2">Incoming Damage By Skill</div>
                                    <table className="w-full min-w-[440px] text-xs table-auto">
                                        <thead>
                                            <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                                <th className="text-left py-2 px-3">Skill</th>
                                                <th className="text-right py-2 px-3">Hits</th>
                                                <th className="text-right py-2 px-3">Damage</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(selectedCommander.incomingSkillBreakdown || []).slice(0, 20).map((row) => (
                                                <tr key={row.id} className="border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                                    <td className="py-2 px-3 text-[color:var(--text-primary)]">{row.name}</td>
                                                    <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(row.hits)}</td>
                                                    <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(row.damage)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] p-3 min-w-0 overflow-x-auto">
                                    <div className="text-xs uppercase tracking-widest text-[color:var(--text-secondary)] mb-2">Incoming Boons (Average Uptime)</div>
                                    <table className="w-full min-w-[440px] text-xs table-auto">
                                        <thead>
                                            <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                                <th className="text-left py-2 px-3">Boon</th>
                                                <th className="text-right py-2 px-3">Uptime %</th>
                                                <th className="text-right py-2 px-3">Stacking</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(selectedCommander.incomingBoonBreakdown || []).slice(0, 20).map((row) => (
                                                <tr key={row.id} className="border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                                    <td className="py-2 px-3 text-[color:var(--text-primary)]">{row.name}</td>
                                                    <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatRate(row.uptimePct, 1)}%</td>
                                                    <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{row.stacking ? 'Yes' : 'No'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {selectedFight && (
                                <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] p-3 min-w-0 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="text-xs uppercase tracking-widest text-[color:var(--text-secondary)]">5s Timeline And Fight Breakdown</div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <select
                                                value={selectedFight.id}
                                                onChange={(event) => setSelectedFightId(event.target.value)}
                                                className="bg-[var(--bg-card-inner)] border border-[color:var(--border-default)] rounded-md px-2 py-1 text-xs text-[color:var(--text-primary)]"
                                            >
                                                {(selectedCommander.fightsData || []).map((fight) => (
                                                    <option key={fight.id} value={fight.id}>{fight.shortLabel} • {fight.mapName || 'Unknown'}</option>
                                                ))}
                                            </select>
                                            <div className="flex items-center gap-1 rounded-full border border-[color:var(--border-default)] bg-[var(--bg-hover)] p-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setTimelineMode('incomingDamage')}
                                                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${timelineMode === 'incomingDamage'
                                                        ? 'bg-red-500/20 text-red-200 border border-red-500/40'
                                                        : 'border border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'}`}
                                                >
                                                    Incoming Damage
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setTimelineMode('incomingBoons')}
                                                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${timelineMode === 'incomingBoons'
                                                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                                                        : 'border border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'}`}
                                                >
                                                    Incoming Boons
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div ref={chartContainerRef} className="h-[220px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
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
                                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
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
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>

                                    <div className="overflow-x-auto min-w-0">
                                        <div className="text-[11px] uppercase tracking-widest text-[color:var(--text-secondary)] mb-1">
                                            {timelineMode === 'incomingDamage' ? 'Fight Incoming Damage By Skill' : 'Fight Incoming Boons'}
                                            {selectedBucketIndex !== null ? ` • ${selectedBucketIndex * 5}-${selectedBucketIndex * 5 + 5}s` : ' • Full Fight'}
                                        </div>
                                        {timelineMode === 'incomingDamage' ? (
                                            <table className="w-full min-w-[420px] text-xs table-auto">
                                                <thead>
                                                    <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                                        <th className="text-left py-2 px-3">Skill</th>
                                                        <th className="text-right py-2 px-3">Hits</th>
                                                        <th className="text-right py-2 px-3">Damage</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredIncomingDamageRows.map((row) => (
                                                        <tr key={row.id} className="border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                                            <td className="py-2 px-3 text-[color:var(--text-primary)]">{row.name}</td>
                                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(row.hits)}</td>
                                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatInt(row.damage)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <table className="w-full min-w-[420px] text-xs table-auto">
                                                <thead>
                                                    <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                                        <th className="text-left py-2 px-3">Boon</th>
                                                        <th className="text-right py-2 px-3">Uptime %</th>
                                                        <th className="text-right py-2 px-3">Uptime Time</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredIncomingBoonRows.map((row) => (
                                                        <tr key={row.id} className="border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                                            <td className="py-2 px-3 text-[color:var(--text-primary)]">{row.name}</td>
                                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatRate(row.uptimePct, 1)}%</td>
                                                            <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">{formatDuration(row.uptimeMs)}</td>
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
