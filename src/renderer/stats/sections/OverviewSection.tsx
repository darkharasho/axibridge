type OverviewSectionProps = {
    stats: any;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
};

export const OverviewSection = ({
    stats,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
}: OverviewSectionProps) => (
    <>
        <div id="kdr" className="scroll-mt-24" />
        <div
            id="overview"
            data-section-visible={isSectionVisible('overview')}
            data-section-first={isFirstVisibleSection('overview')}
            className={sectionClass('overview', 'grid grid-cols-1 md:grid-cols-2 gap-4 scroll-mt-24')}
        >
            <div className="bg-gradient-to-br from-green-500/20 to-emerald-900/20 border border-green-500/30 rounded-2xl px-5 py-4">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div className="text-left">
                        <div className="text-lg font-semibold text-green-100">{stats.avgSquadSize}</div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-green-200/60">Avg Squad</div>
                    </div>
                    <div className="text-center">
                        <div className="text-3xl font-black text-green-300 leading-none">{stats.wins}</div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-green-200/50 mt-1">Victories</div>
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-semibold text-green-100">{stats.squadKDR}</div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-green-200/60">Squad KDR</div>
                    </div>
                </div>
            </div>
            <div className="bg-gradient-to-br from-red-500/20 to-rose-900/20 border border-red-500/30 rounded-2xl px-5 py-4">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div className="text-left">
                        <div className="text-lg font-semibold text-red-100">{stats.avgEnemies}</div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-red-200/60">Avg Enemies</div>
                    </div>
                    <div className="text-center">
                        <div className="text-3xl font-black text-red-300 leading-none">{stats.losses}</div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-red-200/50 mt-1">Defeats</div>
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-semibold text-red-100">{stats.enemyKDR}</div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-red-200/60">Enemy KDR</div>
                    </div>
                </div>
            </div>
        </div>
    </>
);
