import { CalendarDays, Clock, Swords } from 'lucide-react';
import { CommanderTagIcon } from '../../renderer/ui/CommanderTagIcon';
import type { ReportPayload } from '../../shared/reportTypes';

/**
 * The share viewer's page header.
 *
 * The aggregate report's header answers "whose raid is this, and over what
 * date range" — the right question for a night of logs, and the wrong one for
 * a single fight, where the subject is the fight itself. A share link opened
 * cold shows "Unknown Commander" over a two-minute date range, with chips for
 * the report build and a commander list that is usually empty.
 *
 * This replaces that with the fight's own identity: where it happened, how it
 * ended, how the two sides were matched, and what it cost. Everything it reads
 * comes from `stats.fightBreakdown[0]`, which the aggregator already produces
 * for every log — no new parsing, and no new fields on the stored payload.
 */

type FightRecord = {
    fullLabel?: string;
    mapName?: string;
    map?: string;
    duration?: string;
    isWin?: boolean | null;
    squadCount?: number;
    allyCount?: number;
    enemyCount?: number;
    alliesDown?: number;
    alliesDead?: number;
    enemyDowns?: number;
    enemyDeaths?: number;
    totalOutgoingDamage?: number;
    totalIncomingDamage?: number;
};

const num = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

/** 7,672,004 → "7.67M". The KPI tiles have to fit one row on a laptop. */
const compact = (value: number): string => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `${Math.round(value / 1000)}K`;
    return value.toLocaleString();
};

const formatFightTime = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

const Kpi = ({ value, label, tone }: { value: React.ReactNode; label: string; tone?: string }) => (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
        <div className="text-lg font-semibold leading-tight" style={tone ? { color: tone } : undefined}>{value}</div>
        <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-gray-400">{label}</div>
    </div>
);

export function FightHero({
    meta,
    stats,
    className,
    style
}: {
    meta: ReportPayload['meta'];
    stats: unknown;
    className: string;
    style?: React.CSSProperties;
}) {
    const fights = (stats as { fightBreakdown?: FightRecord[] } | null)?.fightBreakdown;
    const fight: FightRecord = Array.isArray(fights) && fights.length > 0 ? fights[0] : {};

    const mapLabel = fight.fullLabel || fight.mapName || fight.map || meta.title || 'WvW Fight';
    const squad = num(fight.squadCount);
    const allies = num(fight.allyCount);
    const enemies = num(fight.enemyCount);
    const friendly = squad + allies;

    // Both bars are scaled against the larger side, so the wider bar is always
    // the side that outnumbered the other — the one fact a reader wants from a
    // fight header before any of the numbers.
    const widest = Math.max(friendly, enemies, 1);
    const commanders = Array.isArray(meta.commanders) ? meta.commanders.filter(Boolean) : [];
    const timeLabel = formatFightTime(meta.dateStart);

    const outcome = fight.isWin === true
        ? { text: 'Victory', bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.45)', fg: '#86efac' }
        : fight.isWin === false
            ? { text: 'Defeat', bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.45)', fg: '#fca5a5' }
            : { text: 'Inconclusive', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.18)', fg: '#cbd5e1' };

    return (
        <div className={`${className} relative overflow-hidden p-5 sm:p-6 mb-6 mx-1 sm:mx-1 lg:mx-0`} style={style}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--brand-primary)' }}>
                        <Swords className="h-3.5 w-3.5 shrink-0" />
                        WvW Fight
                    </div>
                    <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-bold sm:text-3xl">
                        <span>{mapLabel}</span>
                        {(meta as { guild?: { tag?: string; name?: string } }).guild?.tag && (
                            <span
                                className="inline-flex items-center rounded-[4px] border px-2 py-0.5 text-sm font-semibold tracking-wide"
                                style={{ borderColor: 'var(--border-hover)', color: 'var(--text-secondary)' }}
                                title={(meta as { guild?: { name?: string } }).guild?.name || undefined}
                            >
                                [{(meta as { guild?: { tag?: string } }).guild?.tag}]
                            </span>
                        )}
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 sm:text-sm">
                        {timeLabel && (
                            <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                                {timeLabel}
                            </span>
                        )}
                        {fight.duration && (
                            <span className="inline-flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                                {fight.duration}
                            </span>
                        )}
                        {commanders.length > 0 && (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                                <CommanderTagIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--brand-primary)]" />
                                <span className="truncate">{commanders.join(', ')}</span>
                            </span>
                        )}
                    </div>
                </div>
                <div
                    className="shrink-0 self-start rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.14em]"
                    style={{ background: outcome.bg, borderColor: outcome.border, color: outcome.fg }}
                >
                    {outcome.text}
                </div>
            </div>

            <div className="mt-5 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[10px] uppercase tracking-[0.14em] text-gray-400">
                            Squad {squad}{allies > 0 ? ` · Allies ${allies}` : ''}
                        </span>
                        <span className="text-xl font-semibold text-sky-300">{friendly}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                        <div className="h-full rounded-full" style={{ width: `${(friendly / widest) * 100}%`, background: 'linear-gradient(90deg,#2563eb,#60a5fa)' }} />
                    </div>
                </div>
                <div className="shrink-0 pt-4 text-[10px] uppercase tracking-[0.2em] text-gray-500">vs</div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xl font-semibold text-red-300">{enemies}</span>
                        <span className="truncate text-[10px] uppercase tracking-[0.14em] text-gray-400">Enemies</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                        <div className="ml-auto h-full rounded-full" style={{ width: `${(enemies / widest) * 100}%`, background: 'linear-gradient(90deg,#b91c1c,#f87171)' }} />
                    </div>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <Kpi
                    tone="#86efac"
                    label="Enemy Downs / Kills"
                    value={<>{num(fight.enemyDowns)} <span className="text-xs text-gray-500">/ {num(fight.enemyDeaths)}</span></>}
                />
                <Kpi
                    tone="#fca5a5"
                    label="Squad Downs / Deaths"
                    value={<>{num(fight.alliesDown)} <span className="text-xs text-gray-500">/ {num(fight.alliesDead)}</span></>}
                />
                <Kpi label="Damage Dealt" value={compact(num(fight.totalOutgoingDamage))} />
                <Kpi label="Damage Taken" value={compact(num(fight.totalIncomingDamage))} />
            </div>
        </div>
    );
}
