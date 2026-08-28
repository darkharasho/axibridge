import { Bar, Brush, CartesianGrid, Cell, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { MapPin, Shield, Skull } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { getProfessionColor } from '../../../shared/professionUtils';
import { FightMetricSection } from './FightMetricSection';
import type { FightMetricPlayer, FightMetricPoint } from './FightMetricSection';

const PARTY_MEMBER_COLORS = [
    '#a78bfa', '#34d399', '#f59e0b', '#60a5fa', '#f472b6',
    '#fb923c', '#4ade80', '#e879f9', '#38bdf8', '#fbbf24'
];

type StabPerfPlayer = {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    logs: number;
    total: number;
};

type StabPerfFightPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    total: number;
    maxTotal: number;
};

type StabPerfPartyMember = {
    key: string;
    displayName: string;
};

type StabPerfDrilldownEntry = {
    label: string;
    value: number;
    incomingDamage?: number;
    incomingIntensity?: number;
    stripsTaken?: number;
    stripsTakenIntensity?: number;
    partyDeaths?: number;
    partyDeathNames?: string[];
    partyAvgDistance?: number;
    partyFarNames?: string[];
    [key: string]: any;
};

type StabPerfHeatmapOverlay = 'none' | 'incoming-damage' | 'strips-taken';

type StabPerformanceSectionProps = {
    playerFilter: string;
    setPlayerFilter: (v: string) => void;
    players: StabPerfPlayer[];
    selectedPlayerKey: string | null;
    setSelectedPlayerKey: (key: string | null) => void;
    selectedPlayer: StabPerfPlayer | null;
    chartData: StabPerfFightPoint[];
    chartMaxY: number;
    selectedFightIndex: number | null;
    setSelectedFightIndex: (index: number | null) => void;
    drilldownTitle: string;
    drilldownData: StabPerfDrilldownEntry[];
    partyMembers: StabPerfPartyMember[];
    /**
     * Overlay tinting the grid cells. A mode rather than two booleans: both
     * overlays paint the same cell background, so they cannot coexist and
     * the exclusivity belongs in the type, not in a runtime rule. Unlike
     * BoonTimelineSection/BoonUptimeSection, which keep the plain boolean.
     */
    heatmapOverlay: StabPerfHeatmapOverlay;
    setHeatmapOverlay: (mode: StabPerfHeatmapOverlay) => void;
    /**
     * False (not just falsy/absent) means the selected fight's log predates
     * axilog 1.8.0 or was parsed without raw timeline arrays — the
     * strips-taken series was never captured. Absent is not zero: in that
     * case the strips-taken overlay must say so instead of drawing an
     * all-zero-intensity heatmap that reads as "no strips happened".
     * Defaults to true so older data (or tests) that don't pass it keep the
     * pre-existing zero-is-zero behaviour.
     */
    stripsTakenRecorded?: boolean;
    showPartyDeaths: boolean;
    setShowPartyDeaths: (v: boolean) => void;
    showPartyDistance: boolean;
    setShowPartyDistance: (v: boolean) => void;
};

export const StabPerformanceSection = ({
    playerFilter,
    setPlayerFilter,
    players,
    selectedPlayerKey,
    setSelectedPlayerKey,
    selectedPlayer,
    chartData,
    chartMaxY,
    selectedFightIndex,
    setSelectedFightIndex,
    drilldownTitle,
    drilldownData,
    partyMembers,
    heatmapOverlay,
    setHeatmapOverlay,
    stripsTakenRecorded = true,
    showPartyDeaths,
    setShowPartyDeaths,
    showPartyDistance,
    setShowPartyDistance,
}: StabPerformanceSectionProps) => {
    const { formatWithCommas, renderProfessionIcon } = useStatsSharedContext();

    const selectedPlayerColor = getProfessionColor(selectedPlayer?.profession || '') || '#818cf8';
    const hasIncomingHeatData = drilldownData.some((entry) => Number(entry?.incomingDamage || 0) > 0);
    const hasStripsTakenHeatData = drilldownData.some((entry) => Number(entry?.stripsTaken || 0) > 0);
    const stripsTakenOverlayActive = heatmapOverlay === 'strips-taken';
    const stripsTakenDataAbsent = stripsTakenOverlayActive && !stripsTakenRecorded;

    const drilldownHeatData = drilldownData.map((entry) => ({
        ...entry,
        incomingHeatBand: 1
    }));

    // Map StabPerfPlayer[] -> FightMetricPlayer[]
    const mappedGroups = [{
        profession: '',
        players: players.map((p): FightMetricPlayer => ({
            key: p.key,
            account: p.account,
            displayName: p.displayName,
            characterName: p.displayName,
            profession: p.profession,
            professionList: p.professionList,
            logs: p.logs,
            value: p.total,
            peakFightLabel: '',
        })),
    }];

    // Map StabPerfFightPoint[] -> FightMetricPoint[]
    const mappedChartData: FightMetricPoint[] = chartData.map((p) => ({
        index: p.index,
        fightId: p.fightId,
        shortLabel: p.shortLabel,
        fullLabel: p.fullLabel,
        timestamp: p.timestamp,
        value: p.total,
        maxValue: p.maxTotal,
    }));

    // Map selected player
    const mappedPlayer: FightMetricPlayer | null = selectedPlayer ? {
        key: selectedPlayer.key,
        account: selectedPlayer.account,
        displayName: selectedPlayer.displayName,
        characterName: selectedPlayer.displayName,
        profession: selectedPlayer.profession,
        professionList: selectedPlayer.professionList,
        logs: selectedPlayer.logs,
        value: selectedPlayer.total,
        peakFightLabel: '',
    } : null;

    return (
        <FightMetricSection
            sectionId="stab-performance"
            title="Stab Performance"
            titleIcon={Shield}
            titleIconClassName="text-violet-300"
            listTitle="Stability Sources"
            searchPlaceholder="Search player or account"
            modes={[]}
            activeMode=""
            setActiveMode={() => {}}
            playerFilter={playerFilter}
            setPlayerFilter={setPlayerFilter}
            groupedPlayers={mappedGroups}
            selectedPlayerKey={selectedPlayerKey}
            setSelectedPlayerKey={setSelectedPlayerKey}
            selectedPlayer={mappedPlayer}
            chartData={mappedChartData}
            chartMaxY={chartMaxY}
            formatValue={(v) => formatWithCommas(v / 1000, 0)}
            selectedFightIndex={selectedFightIndex}
            setSelectedFightIndex={setSelectedFightIndex}
            drilldownExtras={<>
                <button
                    type="button"
                    onClick={() => setHeatmapOverlay(
                        heatmapOverlay === 'none' ? 'incoming-damage'
                        : heatmapOverlay === 'incoming-damage' ? 'strips-taken'
                        : 'none',
                    )}
                    title={
                        heatmapOverlay === 'none' ? 'Show party incoming damage intensity overlay'
                        : heatmapOverlay === 'incoming-damage' ? 'Show boon strips taken intensity overlay'
                        : 'Hide the intensity overlay'
                    }
                    className={`text-[10px] uppercase tracking-[0.16em] transition-colors ${
                        heatmapOverlay !== 'none'
                            ? 'text-red-200 hover:text-red-100'
                            : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                    }`}
                >
                    {heatmapOverlay === 'strips-taken' ? 'Strips Taken' : 'Party Damage'}
                </button>
                <button
                    type="button"
                    onClick={() => setShowPartyDeaths(!showPartyDeaths)}
                    title="Mark party member deaths on the drilldown chart"
                    className={`text-[10px] uppercase tracking-[0.16em] transition-colors ${
                        showPartyDeaths
                            ? 'text-red-300 hover:text-red-200'
                            : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                    }`}
                >
                    Deaths
                </button>
                <button
                    type="button"
                    onClick={() => setShowPartyDistance(!showPartyDistance)}
                    title="Flags party members who averaged more than 600 units from the commander during this fight"
                    className={`text-[10px] uppercase tracking-[0.16em] transition-colors ${
                        showPartyDistance
                            ? 'text-yellow-200 hover:text-yellow-100'
                            : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                    }`}
                >
                    Distance
                </button>
            </>}
            renderPlayerItem={(player, isSelected) => (
                <>
                    {renderProfessionIcon(player.profession, player.professionList, 'w-4 h-4 flex-shrink-0')}
                    <span className={`text-xs truncate flex-1 ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>
                        {player.displayName}
                    </span>
                    <span className={`text-xs tabular-nums ${isSelected ? 'text-indigo-300 font-semibold' : 'text-slate-500'}`}>
                        {formatWithCommas(player.value / 1000, 0)}
                    </span>
                </>
            )}
            drilldownTitle={drilldownTitle}
            renderDrilldown={() => (
                <div>
                    {partyMembers.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                            {partyMembers.map((m, mi) => (
                                <div key={m.key} className="flex items-center gap-1.5">
                                    <div className="w-5 h-0" style={{ borderTop: `2px dashed ${PARTY_MEMBER_COLORS[mi % PARTY_MEMBER_COLORS.length]}` }} />
                                    <span className="text-[9px] text-slate-400">{m.displayName}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div
                        className="h-[220px] relative"
                        data-overlay={heatmapOverlay !== 'none' ? heatmapOverlay : undefined}
                    >
                        {drilldownData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-slate-500">
                                No detailed data available for this fight.
                            </div>
                        ) : stripsTakenDataAbsent ? (
                            <div className="h-full flex items-center justify-center text-center text-xs text-[color:var(--text-secondary)] px-6">
                                Strip data was not recorded for this fight (log predates axilog 1.8.0 or was parsed without raw timeline arrays).
                            </div>
                        ) : (
                            <ChartContainer width="100%" height="100%">
                                <ComposedChart data={drilldownHeatData}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false}
                                        tickFormatter={(value: number) => formatWithCommas(value / 1000, 0)} width={50} />
                                    <YAxis yAxisId="incomingHeat" hide domain={[0, 1]} />
                                    <YAxis yAxisId="stabStacks" hide domain={[0, 'auto']} />
                                    <Tooltip
                                        content={({ payload, label }: any) => {
                                            if (!payload || payload.length === 0) return null;
                                            const point = payload[0]?.payload || {};
                                            const gen = Number(point?.value || 0);
                                            const damage = Number(point?.incomingDamage || 0);
                                            const strips = Number(point?.stripsTaken || 0);
                                            return (
                                                <div className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
                                                    <div className="text-slate-200 font-medium mb-1">
                                                        {String(label || '')}
                                                        {gen > 0 && <span className="text-violet-300">{` · Gen: ${formatWithCommas(gen / 1000, 0)}`}</span>}
                                                    </div>
                                                    {heatmapOverlay === 'incoming-damage' && damage > 0 && (
                                                        <div className="text-red-300 mb-1">
                                                            Party Incoming Damage: {formatWithCommas(damage, 0)}
                                                        </div>
                                                    )}
                                                    {heatmapOverlay === 'strips-taken' && !stripsTakenDataAbsent && strips > 0 && (
                                                        <div className="text-red-300 mb-1">
                                                            Boon Strips Taken: {formatWithCommas(strips, 0)}
                                                        </div>
                                                    )}
                                                    {[...partyMembers].sort((a, b) => a.displayName.localeCompare(b.displayName)).map((member) => {
                                                        const mi = partyMembers.indexOf(member);
                                                        const color = PARTY_MEMBER_COLORS[mi % PARTY_MEMBER_COLORS.length];
                                                        const stacks = Number(point?.[`pm_${member.key}`] ?? 0);
                                                        const deaths = Number(point?.[`playerDeaths_${member.key}`] || 0);
                                                        const hasDeath = deaths > 0;
                                                        const distance = Number(point?.[`playerDistance_${member.key}`] || 0);
                                                        const hasFar = distance > 600;
                                                        return (
                                                            <div key={member.key} style={{ color }} className="py-px flex items-center gap-1">
                                                                <span>{member.displayName}</span>
                                                                <span>: {stacks === 0 ? 'No stab' : stacks.toFixed(1) + ' stacks'}</span>
                                                                {distance > 0 && (
                                                                    <span className={`flex items-center gap-0.5 ${hasFar ? 'text-yellow-400' : 'text-slate-400'}`}>
                                                                        <MapPin className="inline w-3 h-3" />
                                                                        {Math.round(distance)}u
                                                                    </span>
                                                                )}
                                                                {hasDeath && <Skull className={`inline w-3.5 h-3.5 ${member.key === selectedPlayerKey ? 'text-purple-400' : 'text-white'}`} />}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        }}
                                    />
                                    {heatmapOverlay === 'incoming-damage' && hasIncomingHeatData && (
                                        <Bar
                                            yAxisId="incomingHeat"
                                            dataKey="incomingHeatBand"
                                            name="Party Incoming Damage Heat"
                                            barSize={24}
                                            fill="rgba(239,68,68,0.35)"
                                            stroke="none"
                                            isAnimationActive={false}
                                        >
                                            {drilldownData.map((entry, index) => {
                                                const intensity = Math.max(0, Math.min(1, Number(entry?.incomingIntensity || 0)));
                                                const alpha = 0.06 + (0.52 * intensity);
                                                return <Cell key={`stab-heat-${index}`} fill={`rgba(239, 68, 68, ${alpha.toFixed(3)})`} />;
                                            })}
                                        </Bar>
                                    )}
                                    {heatmapOverlay === 'strips-taken' && !stripsTakenDataAbsent && hasStripsTakenHeatData && (
                                        <Bar
                                            yAxisId="incomingHeat"
                                            dataKey="incomingHeatBand"
                                            name="Boon Strips Taken Heat"
                                            barSize={24}
                                            fill="rgba(248,113,113,0.35)"
                                            stroke="none"
                                            isAnimationActive={false}
                                        >
                                            {drilldownData.map((entry, index) => {
                                                const intensity = Math.max(0, Math.min(1, Number(entry?.stripsTakenIntensity || 0)));
                                                const alpha = 0.06 + (0.52 * intensity);
                                                return <Cell key={`stab-strips-heat-${index}`} fill={`rgba(248, 113, 113, ${alpha.toFixed(3)})`} />;
                                            })}
                                        </Bar>
                                    )}
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        name={selectedPlayer?.displayName || 'Stab Generation'}
                                        stroke={selectedPlayerColor}
                                        strokeWidth={2}
                                        dot={{ r: 2, fill: selectedPlayerColor }}
                                        activeDot={{ r: 4 }}
                                        isAnimationActive
                                        animationDuration={600}
                                        animationEasing="ease-out"
                                    />
                                    {partyMembers.map((member, mi) => {
                                        const color = PARTY_MEMBER_COLORS[mi % PARTY_MEMBER_COLORS.length];
                                        return (
                                            <Line
                                                key={member.key}
                                                yAxisId="stabStacks"
                                                type="monotone"
                                                dataKey={`pm_${member.key}`}
                                                name={member.displayName}
                                                stroke={color}
                                                strokeWidth={1.5}
                                                strokeDasharray="4 2"
                                                dot={(props: any) => {
                                                    const point = props.payload;
                                                    if (!point) return null;
                                                    const deaths = Number(point?.[`playerDeaths_${member.key}`] || 0);
                                                    const distance = Number(point?.[`playerDistance_${member.key}`] || 0);
                                                    const hasDeaths = showPartyDeaths && deaths > 0;
                                                    const hasHighDistance = showPartyDistance && distance > 600;
                                                    if (!hasDeaths && !hasHighDistance) return null;
                                                    const isSelectedPlayer = member.key === selectedPlayerKey;
                                                    const size = isSelectedPlayer ? 20 : 16;
                                                    const half = size / 2;
                                                    return (
                                                        <g transform={`translate(${props.cx - half}, ${props.cy - half})`}>
                                                            {hasDeaths && (
                                                                <Skull width={size} height={size} color={isSelectedPlayer ? '#a855f7' : '#ffffff'} strokeWidth={2} />
                                                            )}
                                                            {!hasDeaths && hasHighDistance && (
                                                                <MapPin width={16} height={16} color="#fbbf24" strokeWidth={2} />
                                                            )}
                                                        </g>
                                                    );
                                                }}
                                                activeDot={{ r: 3, fill: color }}
                                                isAnimationActive={true}
                                                animationDuration={600}
                                                animationEasing="ease-out"
                                            />
                                        );
                                    })}
                                    {drilldownHeatData.length > 10 && (
                                        <Brush
                                            dataKey="label"
                                            height={24}
                                            stroke="rgba(129,140,248,0.4)"
                                            fill="rgba(15,23,42,0.8)"
                                            travellerWidth={8}
                                            tickFormatter={() => ''}
                                        />
                                    )}
                                </ComposedChart>
                            </ChartContainer>
                        )}
                    </div>
                </div>
            )}
        />
    );
};
