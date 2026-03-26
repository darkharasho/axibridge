import { useStatsSharedContext } from '../StatsViewContext';

export const OverviewSection = () => {
    const { stats } = useStatsSharedContext();
    const alliedDeaths = Math.max(0, Number(stats.totalSquadDeaths || 0));
    const enemyDeaths = Math.max(0, Number(stats.totalEnemyDeaths || 0));
    const alliedDowns = Math.max(0, Number(stats.totalSquadDowns || 0));
    const enemyDowns = Math.max(0, Number(stats.totalEnemyDowns || 0));

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="overview-card" style={{ borderTop: '1px solid var(--border-default)', borderRight: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', borderLeft: '2px solid #4ade80', borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <div className="text-left">
                            <div className="text-lg font-semibold" style={{ color: '#a7f3d0' }}>{stats.avgSquadSize}</div>
                            <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: 'rgba(167,243,208,0.6)' }}>Avg Squad</div>
                        </div>
                        <div className="text-center">
                            <div className="text-3xl font-black leading-none text-green-300">{stats.wins}</div>
                            <div className="text-[10px] uppercase tracking-[0.3em] mt-1" style={{ color: 'rgba(167,243,208,0.5)' }}>Victories</div>
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-semibold" style={{ color: '#a7f3d0' }}>{stats.squadKDR}</div>
                            <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: 'rgba(167,243,208,0.6)' }}>Squad KDR</div>
                        </div>
                    </div>
                </div>
                <div className="overview-card" style={{ borderTop: '1px solid var(--border-default)', borderRight: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', borderLeft: '2px solid #f87171', borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
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
            <div className="overview-card" style={{ borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="text-left">
                        <div className="text-2xl font-semibold text-cyan-100">{alliedDowns}</div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-200/60">Allied Downs</div>
                    </div>
                    <div className="text-left md:text-center">
                        <div className="text-2xl font-semibold text-cyan-100">{alliedDeaths}</div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-200/60">Allied Deaths</div>
                    </div>
                    <div className="text-left md:text-center">
                        <div className="text-2xl font-semibold text-rose-100">{enemyDowns}</div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-rose-200/60">Enemy Downs</div>
                    </div>
                    <div className="text-left md:text-right">
                        <div className="text-2xl font-semibold text-rose-100">{enemyDeaths}</div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-rose-200/60">Enemy Deaths</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
