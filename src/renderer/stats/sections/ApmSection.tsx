import { Activity, ChevronDown, ChevronRight, Maximize2, X } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';

type ApmSectionProps = {
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
    sidebarListClass: string;
    apmSpecAvailable: boolean;
    skillUsageAvailable: boolean;
    apmSpecTables: any[];
    activeApmSpec: string | null;
    setActiveApmSpec: (value: string | null) => void;
    expandedApmSpec: string | null;
    setExpandedApmSpec: (value: string | null) => void;
    activeApmSkillId: any;
    setActiveApmSkillId: (value: any) => void;
    ALL_SKILLS_KEY: any;
    apmSkillSearch: string;
    setApmSkillSearch: (value: string) => void;
    activeApmSpecTable: any;
    activeApmSkill: any;
    isAllApmSkills: boolean;
    apmView: 'total' | 'perSecond';
    setApmView: (value: 'total' | 'perSecond') => void;
    formatApmValue: (value: number) => string;
    formatCastRateValue: (value: number) => string;
    formatCastCountValue: (value: number) => string;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
};

export const ApmSection = ({
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass,
    sidebarListClass,
    apmSpecAvailable,
    skillUsageAvailable,
    apmSpecTables,
    activeApmSpec,
    setActiveApmSpec,
    expandedApmSpec,
    setExpandedApmSpec,
    activeApmSkillId,
    setActiveApmSkillId,
    ALL_SKILLS_KEY,
    apmSkillSearch,
    setApmSkillSearch,
    activeApmSpecTable,
    activeApmSkill,
    isAllApmSkills,
    apmView,
    setApmView,
    formatApmValue,
    formatCastRateValue,
    formatCastCountValue,
    renderProfessionIcon
}: ApmSectionProps) => (
    <div
        id="apm-stats"
        data-section-visible={isSectionVisible('apm-stats')}
        data-section-first={isFirstVisibleSection('apm-stats')}
        className={sectionClass('apm-stats', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid scroll-mt-24 flex flex-col ${expandedSection === 'apm-stats'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : 'overflow-hidden'
            }`)}
    >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-300" />
                APM Breakdown
            </h3>
            <div className="flex items-center gap-3 relative">
                <div className="text-xs uppercase tracking-[0.3em] text-gray-500">
                    {apmSpecTables.length} {apmSpecTables.length === 1 ? 'spec' : 'specs'}
                </div>
                <button
                    type="button"
                    onClick={() => (expandedSection === 'apm-stats' ? closeExpandedSection() : openExpandedSection('apm-stats'))}
                    className={`p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors ${expandedSection === 'apm-stats' ? 'absolute -top-1 -right-1 md:static' : ''
                        }`}
                    aria-label={expandedSection === 'apm-stats' ? 'Close APM Breakdown' : 'Expand APM Breakdown'}
                    title={expandedSection === 'apm-stats' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'apm-stats' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>
        </div>
        <div className={expandedSection === 'apm-stats' ? 'flex-1 min-h-0 flex flex-col' : ''}>
            {!apmSpecAvailable ? (
                <div className="rounded-2xl border border-dashed border-white/20 px-4 py-6 text-center text-xs text-gray-400">
                    {skillUsageAvailable
                        ? 'No APM data available for the current selection.'
                        : 'Upload or highlight logs with rotation data to enable the APM table.'}
                </div>
            ) : (
                <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expandedSection === 'apm-stats' ? 'flex-1 min-h-0 h-full' : ''}`}>
                    <div className={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'apm-stats' ? 'h-full' : ''}`}>
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Elite Specs</div>
                        <div className={`${sidebarListClass} ${expandedSection === 'apm-stats' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {apmSpecTables.map((spec) => (
                                <div key={spec.profession} className="space-y-1">
                                    <button
                                        onClick={() => {
                                            if (activeApmSpec === spec.profession && expandedApmSpec === spec.profession) {
                                                setExpandedApmSpec(null);
                                                return;
                                            }
                                            setActiveApmSpec(spec.profession);
                                            setExpandedApmSpec(spec.profession);
                                        }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeApmSpec === spec.profession
                                                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                                : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {renderProfessionIcon(spec.profession, undefined, 'w-4 h-4')}
                                                <span className="truncate">{spec.profession}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-gray-400">
                                                <span className="text-[10px]">{spec.players.length}p</span>
                                                {expandedApmSpec === spec.profession ? (
                                                    <ChevronDown className="w-3.5 h-3.5" />
                                                ) : (
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                    {expandedApmSpec === spec.profession && spec.skills.length > 0 && (
                                        <div className="ml-4 space-y-2">
                                            <input
                                                type="search"
                                                value={apmSkillSearch}
                                                onChange={(event) => setApmSkillSearch(event.target.value)}
                                                placeholder="Search skills..."
                                                className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-emerald-400"
                                            />
                                            <button
                                                onClick={() => setActiveApmSkillId(ALL_SKILLS_KEY)}
                                                className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${activeApmSkillId === ALL_SKILLS_KEY
                                                        ? 'bg-emerald-500/20 text-emerald-100 border-emerald-400/40'
                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                    }`}
                                            >
                                                <span className="truncate block">All Skills</span>
                                            </button>
                                            {(() => {
                                                const term = apmSkillSearch.trim().toLowerCase();
                                                const filteredSkills = term
                                                    ? spec.skills.filter((skill) => skill.name.toLowerCase().includes(term))
                                                    : spec.skills;
                                                if (filteredSkills.length === 0) {
                                                    return (
                                                        <div className="px-3 py-2 text-[11px] text-gray-500 italic">
                                                            No skills match this search.
                                                        </div>
                                                    );
                                                }
                                                return filteredSkills.map((skill) => (
                                                    <button
                                                        key={skill.id}
                                                        onClick={() => setActiveApmSkillId(skill.id)}
                                                        className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${activeApmSkillId === skill.id
                                                                ? 'bg-emerald-500/10 text-emerald-100 border-emerald-400/40'
                                                                : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                            }`}
                                                    >
                                                        <span className="truncate block">{skill.name}</span>
                                                    </button>
                                                ));
                                            })()}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'apm-stats' ? 'flex flex-col min-h-0' : ''}`}>
                        {!activeApmSpecTable || (!isAllApmSkills && !activeApmSkill) ? (
                            <div className="px-4 py-10 text-center text-gray-500 italic text-sm">
                                Select an elite spec and skill to view APM details
                            </div>
                        ) : (
                            <div className={expandedSection === 'apm-stats' ? 'flex flex-col min-h-0' : ''}>
                                <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 bg-white/5">
                                    <div className="flex flex-col gap-2 min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {renderProfessionIcon(activeApmSpecTable.profession, undefined, 'w-4 h-4')}
                                            <div className="text-sm font-semibold text-gray-200">{activeApmSpecTable.profession}</div>
                                            <span className="text-[11px] uppercase tracking-widest text-gray-500">/</span>
                                            <div className="text-sm font-semibold text-gray-200 truncate">
                                                {isAllApmSkills ? 'All Skills' : activeApmSkill?.name}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 text-right ml-auto mt-2">
                                        <div className="text-[11px] text-gray-400">
                                            {isAllApmSkills
                                                ? `${activeApmSpecTable.players.length} ${activeApmSpecTable.players.length === 1 ? 'player' : 'players'} | ${formatApmValue(apmView === 'perSecond' ? activeApmSpecTable.totalAps : activeApmSpecTable.totalApm)} ${apmView === 'perSecond' ? 'APS' : 'APM'} | ${formatApmValue(apmView === 'perSecond' ? activeApmSpecTable.totalApsNoAuto : activeApmSpecTable.totalApmNoAuto)} ${apmView === 'perSecond' ? 'APS' : 'APM'} (no auto)`
                                                : `${activeApmSkill?.playerRows.length ?? 0} ${activeApmSkill?.playerRows.length === 1 ? 'player' : 'players'} | ${formatApmValue(activeApmSkill?.totalApm ?? 0)} APM | ${apmView === 'perSecond'
                                                    ? `${formatCastRateValue(activeApmSkill?.totalCastsPerSecond ?? 0)} casts/sec`
                                                    : `${formatCastCountValue(activeApmSkill?.totalCasts ?? 0)} casts`}`}
                                        </div>
                                        <PillToggleGroup
                                            value={apmView}
                                            onChange={setApmView}
                                            options={[
                                                { value: 'total', label: 'Total' },
                                                { value: 'perSecond', label: 'Per Sec' }
                                            ]}
                                            activeClassName="bg-emerald-500/20 text-emerald-200 border border-emerald-400/40"
                                            inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                        />
                                    </div>
                                </div>
                                {isAllApmSkills ? (
                                    <>
                                        <div className="grid grid-cols-[1.6fr_0.7fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                            <div>Player</div>
                                            <div className="text-right">{apmView === 'perSecond' ? 'APS' : 'APM'}</div>
                                            <div className="text-right">{apmView === 'perSecond' ? 'APS' : 'APM'} (No Auto)</div>
                                        </div>
                                        <div className={expandedSection === 'apm-stats' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-72 overflow-y-auto'}>
                                            {activeApmSpecTable.playerRows.map((row, index) => (
                                                <div
                                                    key={`${activeApmSpecTable.profession}-all-${row.key}`}
                                                    className="grid grid-cols-[1.6fr_0.7fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">{`#${index + 1}`}</span>
                                                        {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                        <div className="min-w-0">
                                                            <div className="font-semibold text-white truncate">{row.displayName}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right font-mono text-gray-300">
                                                        {formatApmValue(apmView === 'perSecond' ? row.aps : row.apm)}
                                                    </div>
                                                    <div className="text-right font-mono text-gray-300">
                                                        {formatApmValue(apmView === 'perSecond' ? row.apsNoAuto : row.apmNoAuto)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-[1.6fr_0.7fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                            <div>Player</div>
                                            <div className="text-right">APM</div>
                                            <div className="text-right">{apmView === 'perSecond' ? 'Casts/Sec' : 'Casts'}</div>
                                        </div>
                                        <div className={expandedSection === 'apm-stats' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-72 overflow-y-auto'}>
                                            {activeApmSkill?.playerRows.map((row: any, index: number) => (
                                                <div
                                                    key={`${activeApmSpecTable.profession}-${activeApmSkill?.id}-${row.key}`}
                                                    className="grid grid-cols-[1.6fr_0.7fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">{`#${index + 1}`}</span>
                                                        {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                        <div className="min-w-0">
                                                            <div className="font-semibold text-white truncate">{row.displayName}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right font-mono text-gray-300">
                                                        {formatApmValue(row.apm)}
                                                    </div>
                                                    <div className="text-right font-mono text-gray-300">
                                                        {apmView === 'perSecond'
                                                            ? formatCastRateValue(row.aps)
                                                            : formatCastCountValue(row.count)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    </div>
);
