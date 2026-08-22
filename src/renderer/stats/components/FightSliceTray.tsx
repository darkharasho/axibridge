import { useMemo, useState } from 'react';
import { useStatsStore } from '../statsStore';
import { getProfessionColor } from '../../../shared/professionUtils';

const formatClock = (timestamp: number) => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '--:--';
    try {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '--:--'; }
};

export const FightSlicePill = ({ onClick }: { onClick: () => void }) => {
    const roster = useStatsStore((s) => s.fightRoster);
    const excluded = useStatsStore((s) => s.excludedFightKeys);
    const included = roster.length - roster.filter((f) => excluded.has(f.id)).length;
    const active = excluded.size > 0;
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${active
                ? 'border-[color:var(--accent-border)] bg-[var(--accent-bg-strong)] text-[color:var(--text-primary)]'
                : 'border-[color:var(--border-default)] bg-[var(--bg-card)] text-[color:var(--text-secondary)]'}`}
        >
            {active
                ? `Slice: ${included} of ${roster.length} fights`
                : 'Slice fights'}
        </button>
    );
};

export const FightSliceBanner = () => {
    const roster = useStatsStore((s) => s.fightRoster);
    const excluded = useStatsStore((s) => s.excludedFightKeys);
    const clearFightSlice = useStatsStore((s) => s.clearFightSlice);
    if (excluded.size === 0) return null;
    const included = roster.length - roster.filter((f) => excluded.has(f.id)).length;
    return (
        <div className="flex items-center gap-2 border-b border-[color:var(--accent-border)] bg-[var(--accent-bg)] px-4 py-1.5 text-[11px] font-semibold text-[color:var(--text-primary)]">
            <span>Sliced view — {included} of {roster.length} fights</span>
            <button
                type="button"
                onClick={clearFightSlice}
                className="ml-auto rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]"
            >
                Clear slice
            </button>
        </div>
    );
};

export const FightSliceTray = ({ onClose }: { onClose: () => void }) => {
    const roster = useStatsStore((s) => s.fightRoster);
    const excluded = useStatsStore((s) => s.excludedFightKeys);
    const toggleFightExcluded = useStatsStore((s) => s.toggleFightExcluded);
    const setFightsExcluded = useStatsStore((s) => s.setFightsExcluded);
    const [query, setQuery] = useState('');

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return roster;
        return roster.filter((f) => f.label.toLowerCase().includes(needle));
    }, [roster, query]);

    // Roster is already sorted by timestamp (see mergeFightRoster), so the
    // ordinal reflects each fight's chronological position regardless of
    // whether the text filter is currently narrowing the visible list.
    const ordinalById = useMemo(() => {
        const map = new Map<string, number>();
        roster.forEach((f, i) => map.set(f.id, i + 1));
        return map;
    }, [roster]);

    // All / None / Invert operate on the filtered (visible) subset, not the
    // whole roster — with the filter box sitting right next to these buttons,
    // scoping them to the full roster while the list is narrowed would silently
    // affect fights the user can't currently see.
    const visibleIds = visible.map((f) => f.id);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
        }
    };

    return (
        <div
            className="app-dropdown border-b border-[color:var(--border-default)] bg-[var(--bg-card)] shadow-[var(--shadow-dropdown)]"
            onKeyDown={handleKeyDown}
        >
            <div className="flex items-center gap-2 border-b border-[color:var(--border-subtle)] px-3 py-2">
                <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">Fights</span>
                <button type="button" onClick={() => setFightsExcluded(visibleIds, false)} className="slice-mini">All</button>
                <button type="button" onClick={() => setFightsExcluded(visibleIds, true)} className="slice-mini">None</button>
                <button
                    type="button"
                    className="slice-mini"
                    onClick={() => {
                        const nowExcluded = visibleIds.filter((id) => !excluded.has(id));
                        const nowIncluded = visibleIds.filter((id) => excluded.has(id));
                        setFightsExcluded(nowIncluded, false);
                        setFightsExcluded(nowExcluded, true);
                    }}
                >
                    Invert
                </button>
                <button
                    type="button"
                    className="slice-mini"
                    onClick={() => {
                        const visibleWinIds = visible.filter((f) => f.isWin === true).map((f) => f.id);
                        const visibleLossIds = visible.filter((f) => f.isWin !== true).map((f) => f.id);
                        setFightsExcluded(visibleLossIds, true);
                        setFightsExcluded(visibleWinIds, false);
                    }}
                >
                    Wins only
                </button>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by map or landmark…"
                    className="ml-2 w-52 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-input)] px-2 py-1 text-[11px] text-[color:var(--text-primary)]"
                />
                <button type="button" onClick={onClose} className="slice-mini ml-auto">Close</button>
            </div>
            <div className="grid grid-cols-4 gap-2 p-3 max-h-[50vh] overflow-y-auto">
                {visible.map((fight) => {
                    const isExcluded = excluded.has(fight.id);
                    const ordinal = ordinalById.get(fight.id);
                    return (
                        <label
                            key={fight.id}
                            className={`flex items-start gap-2 rounded-[var(--radius-md)] border p-2 ${isExcluded
                                ? 'border-[color:var(--border-default)] bg-[var(--bg-card-inner)] opacity-40'
                                : 'border-[color:var(--accent-border)] bg-[var(--accent-bg)]'}`}
                        >
                            <input
                                type="checkbox"
                                aria-label={fight.label}
                                checked={!isExcluded}
                                onChange={() => toggleFightExcluded(fight.id)}
                            />
                            <span className="min-w-0">
                                <span className="block text-[11.5px] font-semibold truncate" title={fight.label}>{fight.label}</span>
                                <span className="block text-[10px] text-[color:var(--text-secondary)]">
                                    {ordinal ? `F${ordinal} · ` : ''}{formatClock(fight.timestamp)} · {fight.duration}
                                    {fight.isWin === true ? ' · Win' : fight.isWin === false ? ' · Loss' : ''}
                                </span>
                                <span className="mt-1 flex flex-wrap gap-0.5">
                                    {Object.entries(fight.enemyClassCounts || {})
                                        .sort((a, b) => b[1] - a[1])
                                        .slice(0, 6)
                                        .map(([profession, count]) => (
                                            <span
                                                key={profession}
                                                title={`${profession}: ${count}`}
                                                className="h-3 w-3 rounded-[2px]"
                                                style={{ background: getProfessionColor(profession) }}
                                            />
                                        ))}
                                </span>
                            </span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
};
