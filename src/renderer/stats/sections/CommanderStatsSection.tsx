import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, Route, Target } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CommanderTagIcon } from '../../ui/CommanderTagIcon';

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
    boonUptimePct: number;
    boonEntries: number;
    incomingSkillBreakdown: Array<{ id: string; name: string; icon?: string; damage: number; hits: number }>;
    incomingBoonBreakdown: Array<{ id: string; name: string; icon?: string; stacking: boolean; uptimePct: number }>;
    fightsData: CommanderFightRow[];
};

type CommanderStatsSectionProps = {
    commanderStats: { rows?: CommanderSummaryRow[] } | null | undefined;
    getProfessionIconPath: (profession: string) => string | null;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
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
    commanderStats,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
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

    return (
        <section
            id="commander-target-conversion"
            data-section-visible={isSectionVisible('commander-target-conversion')}
            data-section-first={isFirstVisibleSection('commander-target-conversion')}
            className={sectionClass('commander-target-conversion', 'bg-white/5 border border-cyan-300/20 rounded-2xl p-6 page-break-avoid scroll-mt-24')}
        >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h3 className="text-lg font-bold text-cyan-100 flex items-center gap-2">
                    <Target className="w-5 h-5 text-cyan-300" />
                    Target Conversion
                </h3>
                <span className="text-[10px] uppercase tracking-widest text-cyan-200/70">
                    {rows.length} Commanders
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="text-center text-gray-500 italic py-8">No target conversion data available.</div>
            ) : (
                <div className="space-y-4 min-w-0">
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="w-full min-w-[700px] text-xs table-auto">
                            <thead>
                                <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                    <th className="text-left py-2 px-2">Commander</th>
                                    <th className="text-right py-2 px-2">Down To Kill %</th>
                                    <th className="text-right py-2 px-2">Avg Downs / Fight</th>
                                    <th className="text-right py-2 px-2">Avg Kills / Fight</th>
                                    <th className="text-right py-2 px-2">Failed Downs</th>
                                    <th className="text-right py-2 px-2">Enemy Downs</th>
                                    <th className="text-right py-2 px-2">Enemy Kills</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={`${row.key}-target-conversion`}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className={`border-b border-white/5 cursor-pointer transition-colors ${
                                            selectedCommander?.key === row.key ? 'bg-cyan-500/10' : 'hover:bg-white/5'
                                        }`}
                                    >
                                        <td className="py-2 px-2 text-gray-100 font-semibold truncate">{row.account}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatNullablePct(row.downToKillConversionPct)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatNullableNumber(row.avgDownsPerFight, 1)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatNullableNumber(row.avgKillsPerFight, 1)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatInt(row.failedDownEstimate)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatInt(row.downs)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatInt(row.kills)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        <div className="overflow-x-auto min-w-0">
                            <table className="w-full min-w-[620px] text-xs table-auto">
                                <thead>
                                    <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                        <th className="text-left py-2 px-2">Fight</th>
                                        <th className="text-right py-2 px-2">Enemy Downs</th>
                                        <th className="text-right py-2 px-2">Enemy Kills</th>
                                        <th className="text-right py-2 px-2">Conversion %</th>
                                        <th className="text-right py-2 px-2">Failed Downs</th>
                                        <th className="text-right py-2 px-2">Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedCommander.fightsData || []).map((fight) => (
                                        <tr key={`${fight.id}-target-conversion`} className="border-b border-white/5">
                                            <td className="py-1.5 px-2 text-gray-200">{fight.shortLabel} • {fight.mapName || 'Unknown'}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatInt(fight.downs)}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatInt(fight.kills)}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatNullablePct(fight.downToKillConversionPct)}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatInt(fight.failedDownEstimate)}</td>
                                            <td className={`py-1.5 px-2 text-right font-semibold ${fight.isWin ? 'text-emerald-300' : 'text-rose-300'}`}>
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
        </section>
    );
};

export const CommanderTagMovementSection = ({
    commanderStats,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
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
        <section
            id="commander-tag-movement"
            data-section-visible={isSectionVisible('commander-tag-movement')}
            data-section-first={isFirstVisibleSection('commander-tag-movement')}
            className={sectionClass('commander-tag-movement', 'bg-white/5 border border-emerald-300/20 rounded-2xl p-6 page-break-avoid scroll-mt-24')}
        >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h3 className="text-lg font-bold text-emerald-100 flex items-center gap-2">
                    <Route className="w-5 h-5 text-emerald-300" />
                    Tag Movement
                </h3>
                <span className="text-[10px] uppercase tracking-widest text-emerald-200/70">
                    {rows.length} Commanders
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="text-center text-gray-500 italic py-8">No tag movement data available.</div>
            ) : (
                <div className="space-y-4 min-w-0">
                    {!hasAnyMovementData ? (
                        <div className="rounded-lg border border-emerald-200/10 bg-black/25 px-3 py-2 text-xs text-emerald-100/80">
                            Tag movement is unavailable for these logs because commander replay positions were not present.
                        </div>
                    ) : null}
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="w-full min-w-[700px] text-xs table-auto">
                            <thead>
                                <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                    <th className="text-left py-2 px-2">Commander</th>
                                    <th className="text-right py-2 px-2">Avg Distance</th>
                                    <th className="text-right py-2 px-2">Move / Min</th>
                                    <th className="text-right py-2 px-2">Stationary %</th>
                                    <th className="text-right py-2 px-2">Move Bursts</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={`${row.key}-tag-movement`}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className={`border-b border-white/5 cursor-pointer transition-colors ${
                                            selectedCommander?.key === row.key ? 'bg-emerald-500/10' : 'hover:bg-white/5'
                                        }`}
                                    >
                                        <td className="py-2 px-2 text-gray-100 font-semibold truncate">{row.account}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatNullableNumber(row.avgCommanderDistanceTraveled, 0)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatNullableNumber(row.avgCommanderMovementPerMinute, 1)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatNullablePct(row.avgTagStationaryPct)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatNullableNumber(row.avgTagMovementBurstCount, 1)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        <div className="overflow-x-auto min-w-0">
                            <table className="w-full min-w-[620px] text-xs table-auto">
                                <thead>
                                    <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                        <th className="text-left py-2 px-2">Fight</th>
                                        <th className="text-right py-2 px-2">Distance</th>
                                        <th className="text-right py-2 px-2">Move / Min</th>
                                        <th className="text-right py-2 px-2">Stationary %</th>
                                        <th className="text-right py-2 px-2">Bursts</th>
                                        <th className="text-right py-2 px-2">Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedCommander.fightsData || []).map((fight) => (
                                        <tr key={`${fight.id}-tag-movement`} className="border-b border-white/5">
                                            <td className="py-1.5 px-2 text-gray-200">{fight.shortLabel} • {fight.mapName || 'Unknown'}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatNullableNumber(fight.distanceTraveled, 0)}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatNullableNumber(fight.movementPerMinute, 1)}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatNullablePct(fight.stationaryPct)}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatNullableNumber(fight.movementBurstCount, 0)}</td>
                                            <td className={`py-1.5 px-2 text-right font-semibold ${fight.isWin ? 'text-emerald-300' : 'text-rose-300'}`}>
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
        </section>
    );
};

export const CommanderPushTimingSection = ({
    commanderStats,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
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
        <section
            id="commander-push-timing"
            data-section-visible={isSectionVisible('commander-push-timing')}
            data-section-first={isFirstVisibleSection('commander-push-timing')}
            className={sectionClass('commander-push-timing', 'bg-white/5 border border-amber-300/20 rounded-2xl p-6 page-break-avoid scroll-mt-24')}
        >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h3 className="text-lg font-bold text-amber-100 flex items-center gap-2">
                    <Clock3 className="w-5 h-5 text-amber-300" />
                    Push Timing
                </h3>
                <span className="text-[10px] uppercase tracking-widest text-amber-200/70">
                    {rows.length} Commanders
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="text-center text-gray-500 italic py-8">No push timing data available.</div>
            ) : (
                <div className="space-y-4 min-w-0">
                    {!hasAnyTimingData ? (
                        <div className="rounded-lg border border-amber-200/10 bg-black/25 px-3 py-2 text-xs text-amber-100/80">
                            Exact push timing is unavailable for these logs because enemy replay down/death timestamps were not present.
                        </div>
                    ) : null}
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="w-full min-w-[640px] text-xs table-auto">
                            <thead>
                                <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                    <th className="text-left py-2 px-2">Commander</th>
                                    <th className="text-right py-2 px-2">Avg To First Down</th>
                                    <th className="text-right py-2 px-2">Avg To First Kill</th>
                                    <th className="text-right py-2 px-2">Avg Down To Kill</th>
                                    <th className="text-right py-2 px-2">Early Push %</th>
                                    <th className="text-right py-2 px-2">Stalled %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={`${row.key}-push-summary`}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className={`border-b border-white/5 cursor-pointer transition-colors ${
                                            selectedCommander?.key === row.key ? 'bg-amber-500/10' : 'hover:bg-white/5'
                                        }`}
                                    >
                                        <td className="py-2 px-2 text-gray-100 font-semibold truncate">{row.account}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatNullableDuration(row.avgTimeToFirstEnemyDownMs)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatNullableDuration(row.avgTimeToFirstEnemyDeathMs)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatNullableDuration(row.avgDownToKillConversionMs)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatNullablePct(row.pushesWithEarlyDownPct)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatNullablePct(row.stalledPushPct)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        <div className="overflow-x-auto min-w-0">
                            <table className="w-full min-w-[560px] text-xs table-auto">
                                <thead>
                                    <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                        <th className="text-left py-2 px-2">Fight</th>
                                        <th className="text-right py-2 px-2">Result</th>
                                        <th className="text-right py-2 px-2">To First Down</th>
                                        <th className="text-right py-2 px-2">To First Kill</th>
                                        <th className="text-right py-2 px-2">Down To Kill</th>
                                        <th className="text-right py-2 px-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedCommander.fightsData || []).map((fight) => (
                                        <tr key={`${fight.id}-push-timing`} className="border-b border-white/5">
                                            <td className="py-1.5 px-2 text-gray-200">{fight.shortLabel} • {fight.mapName || 'Unknown'}</td>
                                            <td className={`py-1.5 px-2 text-right font-semibold ${fight.isWin ? 'text-emerald-300' : 'text-rose-300'}`}>
                                                {fight.isWin ? 'Win' : 'Loss'}
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatNullableDuration(fight.timeToFirstEnemyDownMs)}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatNullableDuration(fight.timeToFirstEnemyDeathMs)}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatNullableDuration(fight.downToKillConversionMs)}</td>
                                            <td className="py-1.5 px-2 text-right font-semibold text-gray-200">{pushTimingStatus(fight)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

export const CommanderStatsSection = ({
    commanderStats,
    getProfessionIconPath,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
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
        <section
            id="commander-stats"
            data-section-visible={isSectionVisible('commander-stats')}
            data-section-first={isFirstVisibleSection('commander-stats')}
            className={sectionClass('commander-stats', 'bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid scroll-mt-24')}
        >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <CommanderTagIcon className="w-5 h-5 text-amber-300" />
                    Commander Stats
                </h3>
                <span className="text-[10px] uppercase tracking-widest text-gray-500">{rows.length} Commanders</span>
            </div>

            {rows.length === 0 ? (
                <div className="text-center text-gray-500 italic py-8">No commander-tag data available.</div>
            ) : (
                <div className="space-y-5 min-w-0">
                    <div className="w-full max-w-full overflow-x-auto pb-1">
                        <table className="w-full min-w-[900px] text-xs table-auto">
                            <thead>
                                <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                    <th className="text-left py-2 px-2">Commander</th>
                                    <th className="text-right py-2 px-2">Fights</th>
                                    <th className="text-right py-2 px-2">W/L</th>
                                    <th className="text-right py-2 px-2">Win %</th>
                                    <th className="text-right py-2 px-2">Squad KDR</th>
                                    <th className="text-right py-2 px-2">Avg Squad</th>
                                    <th className="text-right py-2 px-2">Avg Enemy</th>
                                    <th className="text-right py-2 px-2">Kills</th>
                                    <th className="text-right py-2 px-2">Downs</th>
                                    <th className="text-right py-2 px-2">Time Tagged</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={row.key}
                                        onClick={() => setSelectedCommanderKey(row.key)}
                                        className={`border-b border-white/5 cursor-pointer transition-colors ${
                                            selectedCommander?.key === row.key ? 'bg-amber-500/10' : 'hover:bg-white/5'
                                        }`}
                                    >
                                        <td className="py-2 px-2">
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
                                                    <div className="text-[10px] text-gray-400 truncate">
                                                        {(row.characterNames || []).join(', ') || 'Unknown'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatInt(row.fights)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatInt(row.wins)}-{formatInt(row.losses)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatRate(row.winRatePct, 1)}%</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatRate(row.kdr, 2)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatRate(row.avgSquadSize, 1)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatRate(row.avgEnemySize, 1)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatInt(row.kills)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatInt(row.downs)}</td>
                                        <td className="py-2 px-2 text-right font-mono text-gray-200">{formatDuration(row.totalDurationMs)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedCommander && (
                        <div className="space-y-4 min-w-0">
                            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
                                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Time Tagged</div>
                                    <div className="text-sm font-semibold text-gray-100">{formatDuration(selectedCommander.totalDurationMs)}</div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Inc. Strips</div>
                                    <div className="text-sm font-semibold text-gray-100">{formatInt(selectedCommander.incomingStrips)}</div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Inc. CC</div>
                                    <div className="text-sm font-semibold text-gray-100">{formatInt(selectedCommander.incomingCC)}</div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Damage Taken</div>
                                    <div className="text-sm font-semibold text-gray-100">{formatInt(selectedCommander.damageTaken)}</div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Barrier Absorbed</div>
                                    <div className="text-sm font-semibold text-gray-100">{formatInt(selectedCommander.incomingBarrierAbsorbed)}</div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Boon Uptime</div>
                                    <div className="text-sm font-semibold text-gray-100">{formatRate(selectedCommander.boonUptimePct, 1)}%</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0">
                                <div className="rounded-xl border border-white/10 bg-black/20 p-3 min-w-0 overflow-x-auto">
                                    <div className="text-xs uppercase tracking-widest text-gray-400 mb-2">Incoming Damage By Skill</div>
                                    <table className="w-full min-w-[440px] text-xs table-auto">
                                        <thead>
                                            <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                                <th className="text-left py-2 px-2">Skill</th>
                                                <th className="text-right py-2 px-2">Hits</th>
                                                <th className="text-right py-2 px-2">Damage</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(selectedCommander.incomingSkillBreakdown || []).slice(0, 20).map((row) => (
                                                <tr key={row.id} className="border-b border-white/5">
                                                    <td className="py-1.5 px-2 text-gray-200">{row.name}</td>
                                                    <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatInt(row.hits)}</td>
                                                    <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatInt(row.damage)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="rounded-xl border border-white/10 bg-black/20 p-3 min-w-0 overflow-x-auto">
                                    <div className="text-xs uppercase tracking-widest text-gray-400 mb-2">Incoming Boons (Average Uptime)</div>
                                    <table className="w-full min-w-[440px] text-xs table-auto">
                                        <thead>
                                            <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                                <th className="text-left py-2 px-2">Boon</th>
                                                <th className="text-right py-2 px-2">Uptime %</th>
                                                <th className="text-right py-2 px-2">Stacking</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(selectedCommander.incomingBoonBreakdown || []).slice(0, 20).map((row) => (
                                                <tr key={row.id} className="border-b border-white/5">
                                                    <td className="py-1.5 px-2 text-gray-200">{row.name}</td>
                                                    <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatRate(row.uptimePct, 1)}%</td>
                                                    <td className="py-1.5 px-2 text-right font-mono text-gray-200">{row.stacking ? 'Yes' : 'No'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {selectedFight && (
                                <div className="rounded-xl border border-white/10 bg-black/20 p-3 min-w-0 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="text-xs uppercase tracking-widest text-gray-400">5s Timeline And Fight Breakdown</div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <select
                                                value={selectedFight.id}
                                                onChange={(event) => setSelectedFightId(event.target.value)}
                                                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-200"
                                            >
                                                {(selectedCommander.fightsData || []).map((fight) => (
                                                    <option key={fight.id} value={fight.id}>{fight.shortLabel} • {fight.mapName || 'Unknown'}</option>
                                                ))}
                                            </select>
                                            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setTimelineMode('incomingDamage')}
                                                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${timelineMode === 'incomingDamage'
                                                        ? 'bg-red-500/20 text-red-200 border border-red-500/40'
                                                        : 'border border-transparent text-gray-400 hover:text-gray-200'}`}
                                                >
                                                    Incoming Damage
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setTimelineMode('incomingBoons')}
                                                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${timelineMode === 'incomingBoons'
                                                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                                                        : 'border border-transparent text-gray-400 hover:text-gray-200'}`}
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
                                        <div className="text-[11px] uppercase tracking-widest text-gray-400 mb-1">
                                            {timelineMode === 'incomingDamage' ? 'Fight Incoming Damage By Skill' : 'Fight Incoming Boons'}
                                            {selectedBucketIndex !== null ? ` • ${selectedBucketIndex * 5}-${selectedBucketIndex * 5 + 5}s` : ' • Full Fight'}
                                        </div>
                                        {timelineMode === 'incomingDamage' ? (
                                            <table className="w-full min-w-[420px] text-xs table-auto">
                                                <thead>
                                                    <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                                        <th className="text-left py-1.5 px-2">Skill</th>
                                                        <th className="text-right py-1.5 px-2">Hits</th>
                                                        <th className="text-right py-1.5 px-2">Damage</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredIncomingDamageRows.map((row) => (
                                                        <tr key={row.id} className="border-b border-white/5">
                                                            <td className="py-1.5 px-2 text-gray-200">{row.name}</td>
                                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatInt(row.hits)}</td>
                                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatInt(row.damage)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <table className="w-full min-w-[420px] text-xs table-auto">
                                                <thead>
                                                    <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                                        <th className="text-left py-1.5 px-2">Boon</th>
                                                        <th className="text-right py-1.5 px-2">Uptime %</th>
                                                        <th className="text-right py-1.5 px-2">Uptime Time</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredIncomingBoonRows.map((row) => (
                                                        <tr key={row.id} className="border-b border-white/5">
                                                            <td className="py-1.5 px-2 text-gray-200">{row.name}</td>
                                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatRate(row.uptimePct, 1)}%</td>
                                                            <td className="py-1.5 px-2 text-right font-mono text-gray-200">{formatDuration(row.uptimeMs)}</td>
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
        </section>
    );
};
