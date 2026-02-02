import { PillToggleGroup } from '../ui/PillToggleGroup';
import { CountClassTooltip } from '../ui/StatsViewShared';

type FightBreakdownSectionProps = {
    stats: any;
    fightBreakdownTab: 'sizes' | 'outcomes' | 'damage' | 'barrier';
    setFightBreakdownTab: (value: 'sizes' | 'outcomes' | 'damage' | 'barrier') => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
};

export const FightBreakdownSection = ({
    stats,
    fightBreakdownTab,
    setFightBreakdownTab,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
}: FightBreakdownSectionProps) => (
    <div
        id="fight-breakdown"
        data-section-visible={isSectionVisible('fight-breakdown')}
        data-section-first={isFirstVisibleSection('fight-breakdown')}
        className={sectionClass('fight-breakdown', 'mt-6 stats-share-exclude')}
    >
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-200">Fight Breakdown</h3>
                <div className="flex flex-wrap items-center gap-2">
                    <PillToggleGroup
                        value={fightBreakdownTab}
                        onChange={setFightBreakdownTab}
                        options={[
                            { value: 'sizes', label: 'Sizes' },
                            { value: 'outcomes', label: 'Outcome' },
                            { value: 'damage', label: 'Damage' },
                            { value: 'barrier', label: 'Barrier' }
                        ]}
                        activeClassName="bg-cyan-500/20 text-cyan-200 border border-cyan-500/40"
                        inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                    />
                    <span className="text-[10px] uppercase tracking-widest text-gray-500 sm:ml-1 w-full sm:w-auto">
                        {stats.fightBreakdown?.length || 0} Fights
                    </span>
                </div>
            </div>
            {(stats.fightBreakdown || []).length === 0 ? (
                <div className="text-center text-gray-500 italic py-6">No fight data available</div>
            ) : (
                <div className="overflow-x-auto">
                    <div className="max-h-[360px] overflow-y-auto">
                        <table className="w-full text-xs table-auto min-w-[720px]">
                            <thead>
                                <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                    <th className="text-right py-2 px-2 w-8">#</th>
                                    <th className="text-left py-2 px-3 w-[240px]">Report</th>
                                    <th className="text-left py-2 px-3 w-20">Duration</th>
                                    <th className="text-left py-2 px-3 w-20">Outcome</th>
                                    {fightBreakdownTab === 'sizes' && (
                                        <>
                                            <th className="text-right py-2 px-3">Squad</th>
                                            <th className="text-right py-2 px-3">Allies</th>
                                            <th className="text-right py-2 px-3">Enemies</th>
                                            <th className="text-right py-2 px-3">Red</th>
                                            <th className="text-right py-2 px-3">Green</th>
                                            <th className="text-right py-2 px-3">Blue</th>
                                        </>
                                    )}
                                    {fightBreakdownTab === 'outcomes' && (
                                        <>
                                            <th className="text-right py-2 px-3">Allies Down</th>
                                            <th className="text-right py-2 px-3">Allies Dead</th>
                                            <th className="text-right py-2 px-3">Allies Revived</th>
                                            <th className="text-right py-2 px-3">Rallies</th>
                                            <th className="text-right py-2 px-3">Enemy Deaths</th>
                                        </>
                                    )}
                                    {fightBreakdownTab === 'damage' && (
                                        <>
                                            <th className="text-right py-2 px-3">Outgoing Dmg</th>
                                            <th className="text-right py-2 px-3">Incoming Dmg</th>
                                            <th className="text-right py-2 px-3">Delta</th>
                                        </>
                                    )}
                                    {fightBreakdownTab === 'barrier' && (
                                        <>
                                            <th
                                                className="text-right py-2 px-3"
                                                title="Incoming damage mitigated by your squad's barrier"
                                            >
                                                Barrier Absorption
                                            </th>
                                            <th
                                                className="text-right py-2 px-3"
                                                title="Outgoing damage mitigated by enemy barrier"
                                            >
                                                Enemy Barrier Absorption
                                            </th>
                                            <th className="text-right py-2 px-3">Delta</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {(stats.fightBreakdown || []).map((fight: any, idx: number) => (
                                    <tr key={fight.id || `${fight.label}-${idx}`} className="border-b border-white/5 hover:bg-white/5">
                                        <td className="py-2 px-2 text-right font-mono text-gray-500 w-8">{idx + 1}</td>
                                        <td className="py-2 px-3 w-[240px]">
                                            {fight.permalink ? (
                                                <button
                                                    onClick={() => {
                                                        if (fight.permalink && window.electronAPI?.openExternal) {
                                                            window.electronAPI.openExternal(fight.permalink);
                                                        } else if (fight.permalink) {
                                                            window.open(fight.permalink, '_blank');
                                                        }
                                                    }}
                                                    className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2 block truncate"
                                                >
                                                    {(() => {
                                                        const ts = Number(fight.timestamp || 0);
                                                        const tsMs = ts > 1e12 ? ts : ts * 1000;
                                                        const dateLabel = tsMs
                                                            ? new Date(tsMs).toLocaleDateString(undefined, {
                                                                month: '2-digit',
                                                                day: '2-digit'
                                                            }) + ' ' + new Date(tsMs).toLocaleTimeString(undefined, {
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })
                                                            : '--';
                                                        const rawMap = fight.mapName || fight.map || 'Unknown Map';
                                                        const mapLabel = String(rawMap).replace(/^Detailed\s*WvW\s*-\s*/i, '').trim();
                                                        return `${dateLabel} • ${mapLabel}`;
                                                    })()}
                                                </button>
                                            ) : (
                                                <span className="text-gray-500">Pending</span>
                                            )}
                                        </td>
                                        <td className="py-2 px-3 text-gray-200 w-20">{fight.duration || '--:--'}</td>
                                        <td className={`py-2 px-3 font-semibold ${fight.isWin ? 'text-emerald-300' : 'text-red-300'}`}>
                                            {fight.isWin ? 'Win' : 'Loss'}
                                        </td>
                                        {fightBreakdownTab === 'sizes' && (
                                            <>
                                                <td className="py-2 px-3 text-right font-mono">
                                                    <CountClassTooltip
                                                        count={fight.squadCount ?? 0}
                                                        classCounts={fight.squadClassCountsFight}
                                                        label="Squad Classes"
                                                        className="text-gray-200"
                                                    />
                                                </td>
                                                <td className="py-2 px-3 text-right font-mono">
                                                    <CountClassTooltip
                                                        count={fight.allyCount ?? 0}
                                                        classCounts={fight.allyClassCountsFight}
                                                        label="Ally Classes"
                                                        className="text-gray-200"
                                                    />
                                                </td>
                                                <td className="py-2 px-3 text-right font-mono">
                                                    <CountClassTooltip
                                                        count={fight.enemyCount ?? 0}
                                                        classCounts={fight.enemyClassCounts}
                                                        label="Enemy Classes"
                                                        className="text-gray-200"
                                                    />
                                                </td>
                                                <td className="py-2 px-3 text-right font-mono text-red-300">{fight.teamCounts?.red ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono text-green-300">{fight.teamCounts?.green ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono text-blue-300">{fight.teamCounts?.blue ?? 0}</td>
                                            </>
                                        )}
                                        {fightBreakdownTab === 'outcomes' && (
                                            <>
                                                <td className="py-2 px-3 text-right font-mono">{fight.alliesDown ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono">{fight.alliesDead ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono">{fight.alliesRevived ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono">{fight.rallies ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono">{fight.enemyDeaths ?? 0}</td>
                                            </>
                                        )}
                                        {fightBreakdownTab === 'damage' && (
                                            <>
                                                <td className="py-2 px-3 text-right font-mono">{Number(fight.totalOutgoingDamage || 0).toLocaleString()}</td>
                                                <td className="py-2 px-3 text-right font-mono">{Number(fight.totalIncomingDamage || 0).toLocaleString()}</td>
                                                {(() => {
                                                    const delta = Number((fight.totalOutgoingDamage || 0) - (fight.totalIncomingDamage || 0));
                                                    return (
                                                        <td className={`py-2 px-3 text-right font-mono ${delta < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                                                            {delta.toLocaleString()}
                                                        </td>
                                                    );
                                                })()}
                                            </>
                                        )}
                                        {fightBreakdownTab === 'barrier' && (
                                            <>
                                                <td className="py-2 px-3 text-right font-mono">{Number(fight.incomingBarrierAbsorbed || 0).toLocaleString()}</td>
                                                <td className="py-2 px-3 text-right font-mono">{Number(fight.outgoingBarrierAbsorbed || 0).toLocaleString()}</td>
                                                {(() => {
                                                    const delta = Number((fight.outgoingBarrierAbsorbed || 0) - (fight.incomingBarrierAbsorbed || 0));
                                                    return (
                                                        <td className={`py-2 px-3 text-right font-mono ${delta < 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                                            {delta.toLocaleString()}
                                                        </td>
                                                    );
                                                })()}
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    </div>
);
