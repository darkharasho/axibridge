import { useMemo, useState } from 'react';
import { useStatsStore } from '../statsStore';
import { renderProfessionIcon } from '../ui/StatsViewShared';

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
            className={`inline-flex h-[26px] items-center gap-2 rounded-full border px-3.5 text-[11px] font-semibold transition-colors ${active
                ? 'border-[color:var(--accent-border)] bg-[var(--accent-bg-strong)] text-[color:var(--text-primary)]'
                : 'border-[color:var(--border-default)] bg-[var(--bg-card)] text-[color:var(--text-secondary)]'}`}
        >
            {active
                ? `Slice: ${included} of ${roster.length} fights`
                : 'Slice fights'}
        </button>
    );
};

export const FightSliceBanner = ({ onCopyLink, unavailable = false }: { onCopyLink?: () => void; unavailable?: boolean } = {}) => {
    const roster = useStatsStore((s) => s.fightRoster);
    const excluded = useStatsStore((s) => s.excludedFightKeys);
    const clearFightSlice = useStatsStore((s) => s.clearFightSlice);
    if (excluded.size === 0) return null;
    const included = roster.length - roster.filter((f) => excluded.has(f.id)).length;
    return (
        <div className="flex items-center gap-2 border-b border-[color:var(--accent-border)] bg-[var(--accent-bg)] px-4 py-1.5 text-[11px] font-semibold text-[color:var(--text-primary)]">
            {/* `unavailable` means the published viewer's slice recompute failed
                or refused, so the tables below are the FULL report. Saying
                "Sliced view — N of M fights" over them is the one thing this
                banner must never do. */}
            {unavailable
                ? <span>Slice unavailable — showing all {roster.length} fights</span>
                : <span>Sliced view — {included} of {roster.length} fights</span>}
            <span className="ml-auto flex items-center gap-2">
                {onCopyLink && (
                    <button
                        type="button"
                        onClick={onCopyLink}
                        className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]"
                    >
                        Copy slice link
                    </button>
                )}
                <button
                    type="button"
                    onClick={clearFightSlice}
                    className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]"
                >
                    Clear slice
                </button>
            </span>
        </div>
    );
};

export const FightSliceTray = ({ onClose }: { onClose: () => void }) => {
    const roster = useStatsStore((s) => s.fightRoster);
    const excluded = useStatsStore((s) => s.excludedFightKeys);
    const toggleFightExcluded = useStatsStore((s) => s.toggleFightExcluded);
    const setFightsExcluded = useStatsStore((s) => s.setFightsExcluded);
    const [query, setQuery] = useState('');

    // The roster is stored oldest-first (see mergeFightRoster); the tray shows
    // it newest-first so the fight you just finished is the first card. Only the
    // display order flips — ordinals below still count from the oldest fight.
    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const matched = needle ? roster.filter((f) => f.label.toLowerCase().includes(needle)) : roster;
        return [...matched].reverse();
    }, [roster, query]);

    // Ordinals come from the chronological roster, not the reversed/filtered
    // view, so a fight keeps the same number however the list is ordered.
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
                            className={`slice-card relative block cursor-pointer rounded-[var(--radius-md)] border py-2 pl-2 pr-6 ${isExcluded
                                ? 'border-[color:var(--border-default)] bg-[var(--bg-card-inner)] opacity-40'
                                : 'border-[color:var(--accent-border)] bg-[var(--accent-bg)]'}`}
                        >
                            {/* The input covers the whole card so the card itself is the hit
                                target, but it stays a real checkbox for keyboard and screen
                                readers. `slice-card` supplies the visible tick badge. */}
                            <input
                                type="checkbox"
                                aria-label={fight.label}
                                checked={!isExcluded}
                                onChange={() => toggleFightExcluded(fight.id)}
                            />
                            <span className="slice-card-badge" aria-hidden="true" />
                            <span className="block text-[11.5px] font-semibold truncate" title={fight.label}>{fight.label}</span>
                            <span className="block text-[10px] text-[color:var(--text-secondary)]">
                                {ordinal ? `F${ordinal} · ` : ''}{formatClock(fight.timestamp)} · {fight.duration}
                                {fight.isWin === true ? ' · Win' : fight.isWin === false ? ' · Loss' : ''}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                {Object.entries(fight.enemyClassCounts || {})
                                    .sort((a, b) => b[1] - a[1])
                                    .slice(0, 6)
                                    .map(([profession, count]) => (
                                        <span
                                            key={profession}
                                            title={`${profession}: ${count}`}
                                            className="inline-flex items-center gap-0.5 text-[9.5px] text-[color:var(--text-secondary)]"
                                        >
                                            {renderProfessionIcon(profession, undefined, 'w-3.5 h-3.5 object-contain')}
                                            <span aria-label={`${count} ${profession}`}>&times;{count}</span>
                                        </span>
                                    ))}
                            </span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
};
