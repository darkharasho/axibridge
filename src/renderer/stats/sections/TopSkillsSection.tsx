import { Maximize2, Shield, Swords, X } from 'lucide-react';

type TopSkillsSectionProps = {
    stats: any;
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
};

export const TopSkillsSection = ({
    stats,
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
}: TopSkillsSectionProps) => (
    <div
        data-section-visible={isSectionVisible('top-skills-outgoing')}
        data-section-first={isFirstVisibleSection('top-skills-outgoing')}
        className={sectionClass('top-skills-outgoing', 'grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8')}
    >
        <div
            id="top-skills-outgoing"
            data-section-visible={isSectionVisible('top-skills-outgoing')}
            className={sectionClass('top-skills-outgoing', `bg-white/5 border border-white/10 rounded-2xl p-6 scroll-mt-24 ${
                expandedSection === 'top-skills-outgoing'
                    ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                        expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                    }`
                    : ''
            }`)}
        >
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <Swords className="w-5 h-5 text-orange-400" />
                    Top Outgoing Damage Skills
                </h3>
                <button
                    type="button"
                    onClick={() => (expandedSection === 'top-skills-outgoing' ? closeExpandedSection() : openExpandedSection('top-skills-outgoing'))}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                    aria-label={expandedSection === 'top-skills-outgoing' ? 'Close Top Outgoing Damage Skills' : 'Expand Top Outgoing Damage Skills'}
                    title={expandedSection === 'top-skills-outgoing' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'top-skills-outgoing' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>
            <div className={`${expandedSection === 'top-skills-outgoing' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-80 overflow-y-auto'} space-y-4`}>
                {stats.topSkills.map((skill: { name: string; damage: number; hits: number }, i: number) => (
                    <div key={i} className="flex items-center gap-4">
                        <div className="w-8 text-center text-xl font-bold text-gray-600">#{i + 1}</div>
                        <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-white font-bold">{skill.name}</span>
                                <div className="text-right">
                                    <span className="text-orange-400 font-mono font-bold">{Math.round(skill.damage).toLocaleString()}</span>
                                    <span className="text-gray-500 text-xs ml-2">({skill.hits.toLocaleString()} hits)</span>
                                </div>
                            </div>
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-orange-500 rounded-full"
                                    style={{ width: `${(skill.damage / (stats.topSkills[0]?.damage || 1)) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
                {stats.topSkills.length === 0 && (
                    <div className="text-center text-gray-500 italic py-4">No damage data available</div>
                )}
            </div>
        </div>

        <div
            id="top-skills-incoming"
            data-section-visible={isSectionVisible('top-skills-incoming')}
            className={sectionClass('top-skills-incoming', `bg-white/5 border border-white/10 rounded-2xl p-6 scroll-mt-24 ${
                expandedSection === 'top-skills-incoming'
                    ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                        expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                    }`
                    : ''
            }`)}
        >
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-red-500" />
                    Top Incoming Damage Skills
                </h3>
                <button
                    type="button"
                    onClick={() => (expandedSection === 'top-skills-incoming' ? closeExpandedSection() : openExpandedSection('top-skills-incoming'))}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                    aria-label={expandedSection === 'top-skills-incoming' ? 'Close Top Incoming Damage Skills' : 'Expand Top Incoming Damage Skills'}
                    title={expandedSection === 'top-skills-incoming' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'top-skills-incoming' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>
            <div className={`${expandedSection === 'top-skills-incoming' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-80 overflow-y-auto'} space-y-4`}>
                {stats.topIncomingSkills.map((skill: { name: string; damage: number; hits: number }, i: number) => (
                    <div key={i} className="flex items-center gap-4">
                        <div className="w-8 text-center text-xl font-bold text-gray-600">#{i + 1}</div>
                        <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-white font-bold">{skill.name}</span>
                                <div className="text-right">
                                    <span className="text-red-400 font-mono font-bold">{Math.round(skill.damage).toLocaleString()}</span>
                                    <span className="text-gray-500 text-xs ml-2">({skill.hits.toLocaleString()} hits)</span>
                                </div>
                            </div>
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-red-500 rounded-full"
                                    style={{ width: `${(skill.damage / (stats.topIncomingSkills[0]?.damage || 1)) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
                {stats.topIncomingSkills.length === 0 && (
                    <div className="text-center text-gray-500 italic py-4">No incoming damage data available</div>
                )}
            </div>
        </div>
    </div>
);
