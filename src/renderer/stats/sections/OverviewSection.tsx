import type { CSSProperties, ReactNode } from 'react';

import { useStatsSharedContext } from '../StatsViewContext';

/* The panel's wells - the tally in the middle of the scoreboard, and the two
   down/death halves under it - are all the same thing: content sunk back to
   the ground inside the card. */
const WELL: CSSProperties = {
    background: 'var(--bg-card-inner)',
    border: 'var(--overview-well-w, 1px) solid var(--overview-well-line, var(--border-default))',
    borderRadius: 'var(--radius-md)',
};

const LABEL = 'text-[10px] uppercase tracking-[0.3em]';

/* A short bar of side colour over a label. It names the side once, at the
   head, instead of outlining the whole box to say the same thing. */
const Cap = ({ color, width }: { color: string; width?: number | string }) => (
    <div style={{ height: 'var(--overview-cap-h, 3px)', width: width ?? 46, borderRadius: '2px', background: color }} />
);

const Stat = ({ value, label, align }: { value: ReactNode; label: string; align: 'left' | 'right' }) => (
    <div className={`grid gap-[3px] ${align === 'right' ? 'justify-items-end' : ''}`}>
        <div className="text-[30px] font-extrabold leading-none tabular-nums">{value}</div>
        <div className={LABEL} style={{ color: 'var(--overview-label, var(--text-secondary))' }}>{label}</div>
    </div>
);

/* One side of the scoreboard: its cap and name, then the two numbers that
   describe it, sitting next to the numbers they are read against. */
const Side = ({ name, color, size, kdr, align }: {
    name: string; color: string; size: ReactNode; kdr: ReactNode; align: 'left' | 'right';
}) => {
    const right = align === 'right';
    return (
        <div className={`grid gap-[9px] content-start px-2 sm:px-5 ${right ? 'justify-items-end' : ''}`}>
            <div className={`grid gap-[7px] ${right ? 'justify-items-end' : ''}`}>
                <Cap color={color} />
                <div className={LABEL} style={{ color: 'var(--overview-label, var(--text-secondary))' }}>{name}</div>
            </div>
            {/* Two numbers abreast is what sets a side's min-content width,
                and two sides of it either side of a rule still did not fit a
                393px screen. Stacked, a side is only as wide as its widest
                label. */}
            <div className={`flex flex-col gap-3 sm:flex-row sm:gap-5 md:gap-7 ${right ? 'items-end sm:items-start sm:justify-end' : ''}`}>
                <Stat value={size} label="Avg size" align={align} />
                <Stat value={kdr} label="KDR" align={align} />
            </div>
        </div>
    );
};

/* Half the casualty strip. The four numbers used to run together in one
   four-up, so allied and enemy were only ever separated by reading the labels;
   the cap groups them by side before a word is read. */
const CasualtyHalf = ({ color, side, downs, deaths }: { color: string; side: string; downs: number; deaths: number }) => (
    <div style={{ ...WELL, overflow: 'hidden' }}>
        <Cap color={color} width="100%" />
        <div className="grid grid-cols-2">
            {[{ n: downs, l: `${side} Downs` }, { n: deaths, l: `${side} Deaths` }].map((cell, i) => (
                <div
                    key={cell.l}
                    className="grid gap-1 px-3.5 py-2.5"
                    style={i === 1 ? { borderLeft: 'var(--overview-well-w, 1px) solid var(--overview-well-line, var(--border-default))' } : undefined}
                >
                    <div className="text-[19px] font-bold tabular-nums">{cell.n}</div>
                    <div className={LABEL} style={{ color: 'var(--overview-label, var(--text-secondary))' }}>{cell.l}</div>
                </div>
            ))}
        </div>
    </div>
);

export const OverviewSection = () => {
    const { stats, singleFight } = useStatsSharedContext();
    const alliedDeaths = Math.max(0, Number(stats.totalSquadDeaths || 0));
    const enemyDeaths = Math.max(0, Number(stats.totalEnemyDeaths || 0));
    const alliedDowns = Math.max(0, Number(stats.totalSquadDowns || 0));
    const enemyDowns = Math.max(0, Number(stats.totalEnemyDowns || 0));

    /* The two sides are split by a line drawn inside the panel, not by an
       outline around each of them - the subtle step, same as a rule between
       cells in a table. */
    const rule = (className?: string) => (
        <div className={className} style={{ background: 'var(--overview-well-line, var(--border-subtle))', borderRadius: '1px' }} />
    );

    return (
        <div className="overview-card" style={{ border: 'var(--panel-border-w, 1px) solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '16px 18px' }}>
            {/* Averages over one sample, and a win/loss tally of a single
                result, say nothing a reader cannot read off the fight header
                directly above — which already carries squad vs enemies and the
                outcome. Squad KDR is worse than redundant here: one fight
                routinely ends with zero squad deaths, and the aggregate card
                renders that as an unqualified infinity. */}
            {/* Five tracks - side, rule, tally, rule, side - and two of them
                are 1fr, whose min track size is auto. A phone cannot give a
                side its min-content width twice over with the tally between
                them, and an fr track will not go below min-content, so the
                whole scoreboard ran 238px off a 393px screen rather than
                wrapping. Narrow keeps the reading and drops a row: the tally
                on top, the two sides beneath it either side of the same rule,
                still mirrored so each number sits next to the one it is read
                against. */}
            {!singleFight && <div className="grid items-stretch mb-4 grid-cols-[1fr_2px_1fr] sm:grid-cols-[1fr_2px_auto_2px_1fr]">
                <Side name="Squad" color="var(--status-success)" size={stats.avgSquadSize} kdr={stats.squadKDR} align="left" />
                {rule()}
                <div className="order-first col-span-3 mb-3.5 flex items-center justify-center gap-3.5 px-[22px] py-2.5 sm:order-none sm:col-span-1 sm:mx-[18px] sm:mb-0 sm:justify-start" style={WELL}>
                    <div className="text-center">
                        <div className="text-[46px] font-black leading-[0.9] tabular-nums" style={{ color: 'var(--status-success)' }}>{stats.wins}</div>
                        <div className={`${LABEL} mt-[7px]`} style={{ color: 'var(--overview-label, var(--text-secondary))' }}>Won</div>
                    </div>
                    <div className="text-[22px] font-light" style={{ color: 'var(--text-muted)' }}>&ndash;</div>
                    <div className="text-center">
                        <div className="text-[46px] font-black leading-[0.9] tabular-nums" style={{ color: 'var(--status-error)' }}>{stats.losses}</div>
                        <div className={`${LABEL} mt-[7px]`} style={{ color: 'var(--overview-label, var(--text-secondary))' }}>Lost</div>
                    </div>
                </div>
                {/* Between the tally and the enemy side when they are side by
                    side; between nothing once the tally is its own row. */}
                {rule('hidden sm:block')}
                <Side name="Enemy" color="var(--status-error)" size={stats.avgEnemies} kdr={stats.enemyKDR} align="right" />
            </div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <CasualtyHalf color="var(--status-success)" side="Allied" downs={alliedDowns} deaths={alliedDeaths} />
                <CasualtyHalf color="var(--status-error)" side="Enemy" downs={enemyDowns} deaths={enemyDeaths} />
            </div>
        </div>
    );
};
