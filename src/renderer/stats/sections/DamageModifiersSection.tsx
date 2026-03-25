import { useMemo, useState } from 'react';
import { Maximize2, X, Columns, Users, Flame, ShieldOff } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { useStatsSharedContext } from '../StatsViewContext';

type DamageModifiersSectionProps = {
    search: string;
    setSearch: (value: string) => void;
    activeMod: string;
    setActiveMod: (value: string) => void;
    incoming: boolean;
};

const SECTION_CONFIG = {
    outgoing: {
        sectionId: 'damage-modifiers',
        title: 'Damage Modifiers',
        accentBg: 'bg-[var(--accent-bg-strong)]',
        accentText: 'text-[color:var(--brand-primary)]',
        accentBorder: 'border-[color:var(--accent-border)]',
        barGradientStyle: 'linear-gradient(to right, rgba(244,63,94,0.4), rgba(244,63,94,0.15))',
    },
    incoming: {
        sectionId: 'incoming-damage-modifiers',
        title: 'Incoming Damage Modifiers',
        accentBg: 'bg-[var(--accent-bg-strong)]',
        accentText: 'text-[color:var(--brand-primary)]',
        accentBorder: 'border-[color:var(--accent-border)]',
        barGradientStyle: 'linear-gradient(to right, rgba(59,130,246,0.4), rgba(59,130,246,0.15))',
    },
};

type ModTotals = { damageGain: number; hitCount: number; totalHitCount: number; totalDamage: number };
type ModMapEntry = { name: string; icon: string; description: string; incoming: boolean };

type ModSummary = {
    id: string;
    name: string;
    icon: string;
    description: string;
    squadDamageGain: number;
    isPersonal: boolean;
};

export const DamageModifiersSection = ({
    search,
    setSearch,
    activeMod,
    setActiveMod,
    incoming,
}: DamageModifiersSectionProps) => {
    const {
        stats, formatWithCommas, renderProfessionIcon,
        expandedSection, expandedSectionClosing,
        openExpandedSection, closeExpandedSection,
        sidebarListClass,
    } = useStatsSharedContext();

    const config = incoming ? SECTION_CONFIG.incoming : SECTION_CONFIG.outgoing;
    const isExpanded = expandedSection === config.sectionId;

    // --- Data access ---
    const modMap: Record<string, ModMapEntry> = (stats as any).damageModMap ?? {};
    const playerRows: any[] = incoming
        ? ((stats as any).incomingDamageModPlayers ?? [])
        : ((stats as any).damageModPlayers ?? []);

    const totalsKey = incoming ? 'incomingDamageModTotals' : 'damageModTotals';
    const personalModKeys = useMemo(() => new Set<string>((stats as any).personalDamageModKeys ?? []), [stats]);

    // --- Hypothetical toggle ---
    const [showHypothetical, setShowHypothetical] = useState(false);

    // --- Build sorted modifier list ---
    const modSummaries = useMemo<ModSummary[]>(() => {
        const summaryMap: Record<string, ModSummary> = {};
        for (const row of playerRows) {
            const modTotals: Record<string, ModTotals> = row[totalsKey] ?? {};
            for (const [modId, vals] of Object.entries(modTotals)) {
                const info = modMap[modId];
                if (!info) continue;
                // Filter: only show modifiers matching the incoming flag
                if (info.incoming !== incoming) continue;
                // Filter: hide hypothetical (shared) modifiers unless toggled
                const isPersonal = personalModKeys.has(modId);
                if (!isPersonal && !showHypothetical) continue;
                if (!summaryMap[modId]) {
                    summaryMap[modId] = {
                        id: modId,
                        name: info.name,
                        icon: info.icon,
                        description: info.description,
                        squadDamageGain: 0,
                        isPersonal,
                    };
                }
                summaryMap[modId].squadDamageGain += vals.damageGain;
            }
        }
        return Object.values(summaryMap).sort(
            (a, b) => Math.abs(b.squadDamageGain) - Math.abs(a.squadDamageGain)
        );
    }, [playerRows, modMap, incoming, totalsKey, personalModKeys, showHypothetical]);

    // --- Filtered modifiers by search ---
    const filteredMods = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return modSummaries;
        return modSummaries.filter((m) => m.name.toLowerCase().includes(term));
    }, [modSummaries, search]);

    // Auto-select first modifier if active one is gone
    const effectiveActiveMod = filteredMods.find((m) => m.id === activeMod)
        ? activeMod
        : filteredMods[0]?.id ?? '';

    // --- Expanded view state ---
    const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>([]);
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({ columnId: '', dir: 'desc' });
    const [collapsedSort, setCollapsedSort] = useState<{ key: 'damageGain' | 'pctTotal' | 'hitCoverage' | 'fightTime'; dir: 'asc' | 'desc' }>({
        key: 'damageGain', dir: 'desc',
    });

    const updateCollapsedSort = (key: typeof collapsedSort.key) => {
        setCollapsedSort((prev) => ({
            key,
            dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc',
        }));
    };

    // --- Expanded view helpers ---
    const allColumnOptions = useMemo(() =>
        modSummaries.map((m) => ({
            id: m.id,
            label: m.name,
            icon: m.icon ? <img src={m.icon} alt="" className="h-4 w-4 object-contain" /> : undefined,
        })),
        [modSummaries]
    );
    const columnOptionsFiltered = useMemo(() =>
        filteredMods.map((m) => ({
            id: m.id,
            label: m.name,
            icon: m.icon ? <img src={m.icon} alt="" className="h-4 w-4 object-contain" /> : undefined,
        })),
        [filteredMods]
    );
    const visibleMods = selectedColumnIds.length > 0
        ? modSummaries.filter((m) => selectedColumnIds.includes(m.id))
        : modSummaries;

    const playerOptions = useMemo(() =>
        Array.from(new Map(
            playerRows.map((row: any) => [row.account, row])
        ).values()).map((row: any) => ({
            id: row.account,
            label: row.account,
            icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3'),
        })),
        [playerRows, renderProfessionIcon]
    );

    const searchSelectedIds = useMemo(() => new Set([
        ...selectedColumnIds.map((id) => `column:${id}`),
        ...selectedPlayers.map((id) => `player:${id}`),
    ]), [selectedColumnIds, selectedPlayers]);

    return (
        <div
            className={`stats-share-exclude ${isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex items-center gap-2 mb-3.5">
                {incoming
                    ? <ShieldOff className="w-4 h-4 shrink-0" style={{ color: 'var(--section-defense)' }} />
                    : <Flame className="w-4 h-4 shrink-0" style={{ color: 'var(--section-offense)' }} />
                }
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>{config.title}</h3>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowHypothetical((v) => !v)}
                        className={`px-2.5 py-1 rounded-[var(--radius-md)] border text-[10px] uppercase tracking-widest transition-colors ${
                            showHypothetical
                                ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border-[color:var(--accent-border)]'
                                : 'text-[color:var(--text-secondary)]'
                        }`}
                        style={{ borderColor: showHypothetical ? undefined : 'var(--border-default)' }}
                        title={showHypothetical ? 'Showing all modifiers including shared squad buffs (banners, spirits, etc.) that are attributed to every benefiting player — not just the provider' : 'Show hypothetical shared modifiers — squad-wide buffs where damage gain is attributed to all benefiting players, not the buff source'}
                    >
                        Hypothetical
                    </button>
                    <button
                        type="button"
                        onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(config.sectionId))}
                        className="flex items-center justify-center w-[26px] h-[26px]"
                        style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                        aria-label={isExpanded ? `Close ${config.title}` : `Expand ${config.title}`}
                        title={isExpanded ? 'Close' : 'Expand'}
                    >
                        {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                    </button>
                </div>
            </div>

            {modSummaries.length === 0 ? (
                <div className="text-center text-[color:var(--text-muted)] italic py-8">No {incoming ? 'incoming ' : ''}damage modifier data available</div>
            ) : isExpanded ? (
                /* ===== EXPANDED / FULLSCREEN VIEW ===== */
                <ExpandedView
                    config={config}
                    incoming={incoming}
                    visibleMods={visibleMods}
                    playerRows={playerRows}
                    totalsKey={totalsKey}
                    allColumnOptions={allColumnOptions}
                    columnOptionsFiltered={columnOptionsFiltered}
                    playerOptions={playerOptions}
                    selectedColumnIds={selectedColumnIds}
                    setSelectedColumnIds={setSelectedColumnIds}
                    selectedPlayers={selectedPlayers}
                    setSelectedPlayers={setSelectedPlayers}
                    searchSelectedIds={searchSelectedIds}
                    denseSort={denseSort}
                    setDenseSort={setDenseSort}
                    formatWithCommas={formatWithCommas}
                    renderProfessionIcon={renderProfessionIcon}
                />
            ) : (
                /* ===== COLLAPSED VIEW ===== */
                <CollapsedView
                    config={config}
                    incoming={incoming}
                    search={search}
                    setSearch={setSearch}
                    filteredMods={filteredMods}
                    effectiveActiveMod={effectiveActiveMod}
                    setActiveMod={setActiveMod}
                    playerRows={playerRows}
                    totalsKey={totalsKey}
                    modMap={modMap}
                    collapsedSort={collapsedSort}
                    updateCollapsedSort={updateCollapsedSort}
                    isExpanded={isExpanded}
                    formatWithCommas={formatWithCommas}
                    renderProfessionIcon={renderProfessionIcon}
                    sidebarListClass={sidebarListClass}
                    expandedSection={expandedSection}
                />
            )}
        </div>
    );
};

/* ─────────────────────────────────────────────
 * COLLAPSED VIEW (sidebar + bar chart + table)
 * ───────────────────────────────────────────── */

type CollapsedViewProps = {
    config: typeof SECTION_CONFIG.outgoing;
    incoming: boolean;
    search: string;
    setSearch: (v: string) => void;
    filteredMods: ModSummary[];
    effectiveActiveMod: string;
    setActiveMod: (v: string) => void;
    playerRows: any[];
    totalsKey: string;
    modMap: Record<string, ModMapEntry>;
    collapsedSort: { key: 'damageGain' | 'pctTotal' | 'hitCoverage' | 'fightTime'; dir: 'asc' | 'desc' };
    updateCollapsedSort: (key: 'damageGain' | 'pctTotal' | 'hitCoverage' | 'fightTime') => void;
    isExpanded: boolean;
    formatWithCommas: (v: number, d: number) => string;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => React.JSX.Element | null;
    sidebarListClass: string;
    expandedSection: string | null;
};

const CollapsedView = ({
    config, incoming, search, setSearch, filteredMods, effectiveActiveMod, setActiveMod,
    playerRows, totalsKey, modMap, collapsedSort, updateCollapsedSort,
    isExpanded, formatWithCommas, renderProfessionIcon, sidebarListClass, expandedSection,
}: CollapsedViewProps) => {
    const activeModInfo = modMap[effectiveActiveMod];
    const activeModIsHypothetical = !filteredMods.find((m) => m.id === effectiveActiveMod)?.isPersonal;

    // Build player data for the active modifier (merged by account to handle splitPlayersByClass)
    const activeModPlayerData = useMemo(() => {
        if (!effectiveActiveMod) return [];
        const byAccount = new Map<string, {
            account: string; profession: string; professionList: string[];
            totalFightMs: number; damageGain: number; hitCount: number; totalHitCount: number; totalDamage: number;
        }>();
        for (const row of playerRows) {
            const modTotals: Record<string, ModTotals> = row[totalsKey] ?? {};
            const modData = modTotals[effectiveActiveMod];
            if (!modData) continue;
            const existing = byAccount.get(row.account);
            if (existing) {
                existing.damageGain += modData.damageGain;
                existing.hitCount += modData.hitCount;
                existing.totalHitCount += modData.totalHitCount;
                existing.totalDamage += modData.totalDamage;
                existing.totalFightMs += row.totalFightMs || 0;
                if (row.professionList) {
                    const seen = new Set(existing.professionList);
                    for (const p of row.professionList) { if (!seen.has(p)) existing.professionList.push(p); }
                }
            } else {
                byAccount.set(row.account, {
                    account: row.account,
                    profession: row.profession,
                    professionList: row.professionList ? [...row.professionList] : [],
                    totalFightMs: row.totalFightMs || 0,
                    damageGain: modData.damageGain,
                    hitCount: modData.hitCount,
                    totalHitCount: modData.totalHitCount,
                    totalDamage: modData.totalDamage,
                });
            }
        }
        return Array.from(byAccount.values());
    }, [playerRows, effectiveActiveMod, totalsKey]);

    // Sort the player data for the detail table
    const sortedPlayerData = useMemo(() => {
        return [...activeModPlayerData].sort((a, b) => {
            let aVal: number, bVal: number;
            switch (collapsedSort.key) {
                case 'damageGain':
                    aVal = incoming ? Math.abs(a.damageGain) : a.damageGain;
                    bVal = incoming ? Math.abs(b.damageGain) : b.damageGain;
                    break;
                case 'pctTotal':
                    aVal = a.totalDamage > 0 ? Math.abs(a.damageGain) / a.totalDamage : 0;
                    bVal = b.totalDamage > 0 ? Math.abs(b.damageGain) / b.totalDamage : 0;
                    break;
                case 'hitCoverage':
                    aVal = a.totalHitCount > 0 ? a.hitCount / a.totalHitCount : 0;
                    bVal = b.totalHitCount > 0 ? b.hitCount / b.totalHitCount : 0;
                    break;
                case 'fightTime':
                    aVal = a.totalFightMs;
                    bVal = b.totalFightMs;
                    break;
                default:
                    aVal = 0;
                    bVal = 0;
            }
            const diff = collapsedSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
            return diff || a.account.localeCompare(b.account);
        });
    }, [activeModPlayerData, collapsedSort, incoming]);

    const maxAbsGain = useMemo(() => {
        let max = 0;
        for (const row of activeModPlayerData) {
            const abs = Math.abs(row.damageGain);
            if (abs > max) max = abs;
        }
        return max;
    }, [activeModPlayerData]);

    return (
        <StatsTableLayout
            expanded={isExpanded}
            sidebarClassName={`pr-3 flex flex-col min-h-0 overflow-y-auto ${expandedSection === config.sectionId ? 'h-full flex-1' : ''}`}
            contentClassName={`overflow-hidden ${expandedSection === config.sectionId ? 'flex flex-col min-h-0' : ''}`}
            sidebar={
                <>
                    <div className="text-xs uppercase tracking-widest text-[color:var(--text-secondary)] mb-2">Modifiers</div>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search modifiers..."
                        className="w-full px-2 py-1 text-xs text-[color:var(--text-primary)] focus:outline-none mb-2"
                        style={{ background: 'transparent', borderBottom: '1px solid var(--border-subtle)' }}
                    />
                    <div className={`${sidebarListClass} ${expandedSection === config.sectionId ? 'max-h-none flex-1 min-h-0' : ''}`}>
                        {filteredMods.length === 0 ? (
                            <div className="text-center text-[color:var(--text-muted)] italic py-6 text-xs">No modifiers match this filter</div>
                        ) : (
                            filteredMods.map((mod) => (
                                <button
                                    key={mod.id}
                                    onClick={() => setActiveMod(mod.id)}
                                    className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors flex items-center gap-2 ${
                                        effectiveActiveMod === mod.id
                                            ? `${config.accentBg} ${config.accentText} font-semibold`
                                            : 'hover:bg-[var(--bg-hover)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                                    } ${!mod.isPersonal ? 'opacity-50' : ''}`}
                                >
                                    {mod.icon && (
                                        <img src={mod.icon} alt="" className="w-4 h-4 object-contain flex-shrink-0" />
                                    )}
                                    <span className="flex flex-col min-w-0">
                                        <span className="truncate">{mod.name}</span>
                                        <span className={`text-[10px] font-normal ${mod.squadDamageGain < 0 ? 'text-teal-500' : 'text-[color:var(--text-muted)]'}`}>
                                            {mod.squadDamageGain >= 0 ? '+' : ''}{formatWithCommas(mod.squadDamageGain, 0)} squad total
                                        </span>
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </>
            }
            content={
                <>
                    {effectiveActiveMod && activeModInfo ? (
                        <StatsTableShell
                            expanded={isExpanded}
                            header={
                                <div className="flex items-center gap-3 px-4 py-3">
                                    {activeModInfo.icon && (
                                        <img src={activeModInfo.icon} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                                    )}
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-[color:var(--text-primary)]">{activeModInfo.name}</div>
                                        {activeModInfo.description && (
                                            <div className="text-[11px] text-[color:var(--text-secondary)] leading-tight mt-0.5">
                                                {activeModInfo.description.split(/<br\s*\/?>/).map((part, i, arr) => (
                                                    <span key={i}>{part}{i < arr.length - 1 && <br />}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            }
                            columns={
                                <div className="grid grid-cols-[0.3fr_1.3fr_1fr_0.8fr_0.8fr_0.8fr] text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] px-4 py-2 border-b border-[color:var(--border-default)]">
                                    <div className="text-center">#</div>
                                    <div>Player</div>
                                    <button
                                        type="button"
                                        onClick={() => updateCollapsedSort('damageGain')}
                                        className={`text-right transition-colors ${collapsedSort.key === 'damageGain' ? config.accentText : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'}`}
                                    >
                                        Dmg Gain{collapsedSort.key === 'damageGain' ? (collapsedSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => updateCollapsedSort('pctTotal')}
                                        className={`text-right transition-colors ${collapsedSort.key === 'pctTotal' ? config.accentText : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'}`}
                                    >
                                        % Total{collapsedSort.key === 'pctTotal' ? (collapsedSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => updateCollapsedSort('hitCoverage')}
                                        className={`text-right transition-colors ${collapsedSort.key === 'hitCoverage' ? config.accentText : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'}`}
                                    >
                                        Hits{collapsedSort.key === 'hitCoverage' ? (collapsedSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => updateCollapsedSort('fightTime')}
                                        className={`text-right transition-colors ${collapsedSort.key === 'fightTime' ? config.accentText : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'}`}
                                    >
                                        Fight Time{collapsedSort.key === 'fightTime' ? (collapsedSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                    </button>
                                </div>
                            }
                            rows={
                                <>
                                    {sortedPlayerData.length === 0 ? (
                                        <div className="px-4 py-8 text-center text-[color:var(--text-muted)] italic text-sm">No player data for this modifier</div>
                                    ) : (
                                        sortedPlayerData.map((row, idx) => {
                                            const pctOfTotal = row.totalDamage > 0
                                                ? ((Math.abs(row.damageGain) / row.totalDamage) * 100).toFixed(2)
                                                : '0.00';
                                            const hitCoverage = row.totalHitCount > 0
                                                ? `${row.hitCount}/${row.totalHitCount}`
                                                : '—';
                                            const barWidthPct = maxAbsGain > 0
                                                ? (Math.abs(row.damageGain) / maxAbsGain) * 100
                                                : 0;
                                            const isNegative = row.damageGain < 0;
                                            const barStyle = isNegative
                                                ? 'linear-gradient(to left, rgba(20,184,166,0.2), rgba(20,184,166,0.05))'
                                                : incoming
                                                    ? 'linear-gradient(to right, rgba(239,68,68,0.2), rgba(239,68,68,0.05))'
                                                    : config.barGradientStyle;
                                            return (
                                                <div key={`${row.account}-${idx}`} className={`relative border-b border-[color:var(--border-subtle)] ${activeModIsHypothetical ? 'opacity-50' : ''}`}>
                                                    {/* Bar overlay — negative grows from right, positive from left */}
                                                    <div
                                                        className={`absolute inset-y-0 pointer-events-none ${isNegative ? 'right-0' : 'left-0'}`}
                                                        style={{ width: `${barWidthPct}%`, background: barStyle }}
                                                    />
                                                    {/* Row content */}
                                                    <div className="relative grid grid-cols-[0.3fr_1.3fr_1fr_0.8fr_0.8fr_0.8fr] px-4 py-3 text-sm text-[color:var(--text-primary)]">
                                                        <div className="text-center text-[color:var(--text-muted)] font-mono">{idx + 1}</div>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                            <span className="truncate">{row.account}</span>
                                                        </div>
                                                        <div className={`text-right font-mono ${isNegative ? 'text-teal-400' : incoming ? 'text-red-400' : config.accentText}`}>
                                                            {row.damageGain >= 0 ? '+' : ''}{formatWithCommas(row.damageGain, 0)}
                                                        </div>
                                                        <div className="text-right font-mono text-[color:var(--text-secondary)]">
                                                            {pctOfTotal}%
                                                        </div>
                                                        <div className="text-right font-mono text-[color:var(--text-secondary)]">
                                                            {hitCoverage}
                                                        </div>
                                                        <div className="text-right font-mono text-[color:var(--text-secondary)]">
                                                            {row.totalFightMs ? `${(row.totalFightMs / 1000).toFixed(1)}s` : '—'}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </>
                            }
                        />
                    ) : (
                        <div className="px-4 py-8 text-center text-[color:var(--text-muted)] italic text-sm">Select a modifier from the sidebar</div>
                    )}
                </>
            }
        />
    );
};

/* ─────────────────────────────────────────────
 * EXPANDED / FULLSCREEN VIEW (dense table)
 * ───────────────────────────────────────────── */

type ExpandedViewProps = {
    config: typeof SECTION_CONFIG.outgoing;
    incoming: boolean;
    visibleMods: ModSummary[];
    playerRows: any[];
    totalsKey: string;
    allColumnOptions: Array<{ id: string; label: string; icon?: React.JSX.Element }>;
    columnOptionsFiltered: Array<{ id: string; label: string; icon?: React.JSX.Element }>;
    playerOptions: Array<{ id: string; label: string; icon: React.JSX.Element | null }>;
    selectedColumnIds: string[];
    setSelectedColumnIds: React.Dispatch<React.SetStateAction<string[]>>;
    selectedPlayers: string[];
    setSelectedPlayers: React.Dispatch<React.SetStateAction<string[]>>;
    searchSelectedIds: Set<string>;
    denseSort: { columnId: string; dir: 'asc' | 'desc' };
    setDenseSort: React.Dispatch<React.SetStateAction<{ columnId: string; dir: 'asc' | 'desc' }>>;
    formatWithCommas: (v: number, d: number) => string;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => React.JSX.Element | null;
};

const ExpandedView = ({
    config, incoming, visibleMods,
    playerRows, totalsKey, allColumnOptions, columnOptionsFiltered, playerOptions,
    selectedColumnIds, setSelectedColumnIds,
    selectedPlayers, setSelectedPlayers,
    searchSelectedIds, denseSort, setDenseSort,
    formatWithCommas, renderProfessionIcon,
}: ExpandedViewProps) => {
    const resolvedSortColumnId = visibleMods.find((m) => m.id === denseSort.columnId)?.id
        || visibleMods[0]?.id
        || '';

    const rows = useMemo(() => {
        return [...playerRows]
            .filter((row: any) => selectedPlayers.length === 0 || selectedPlayers.includes(row.account))
            .map((row: any) => {
                const modTotals: Record<string, ModTotals> = row[totalsKey] ?? {};
                const values: Record<string, string> = {};
                const numericValues: Record<string, number> = {};
                visibleMods.forEach((mod) => {
                    const modData = modTotals[mod.id];
                    if (modData) {
                        const gain = modData.damageGain;
                        numericValues[mod.id] = incoming ? Math.abs(gain) : gain;
                        values[mod.id] = `${gain >= 0 ? '+' : ''}${formatWithCommas(gain, 0)}`;
                    } else {
                        numericValues[mod.id] = 0;
                        values[mod.id] = '—';
                    }
                });
                return { row, values, numericValues };
            })
            .sort((a, b) => {
                const resolvedA = a.numericValues[resolvedSortColumnId] ?? 0;
                const resolvedB = b.numericValues[resolvedSortColumnId] ?? 0;
                const primary = denseSort.dir === 'desc' ? resolvedB - resolvedA : resolvedA - resolvedB;
                return primary || String(a.row.account || '').localeCompare(String(b.row.account || ''));
            });
    }, [playerRows, selectedPlayers, totalsKey, visibleMods, resolvedSortColumnId, denseSort.dir, incoming, formatWithCommas]);

    return (
        <div className="flex flex-col gap-4">
            <div className="border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] px-4 py-3">
                <div className="text-xs uppercase tracking-widest text-[color:var(--text-secondary)] mb-2">Modifier Columns</div>
                <div className="flex flex-wrap items-center gap-2">
                    <SearchSelectDropdown
                        options={[
                            ...allColumnOptions.map((option) => ({ ...option, type: 'column' as const })),
                            ...playerOptions.map((option) => ({ ...option, type: 'player' as const })),
                        ]}
                        onSelect={(option: SearchSelectOption) => {
                            if (option.type === 'column') {
                                setSelectedColumnIds((prev) =>
                                    prev.includes(option.id) ? prev.filter((e) => e !== option.id) : [...prev, option.id]
                                );
                            } else {
                                setSelectedPlayers((prev) =>
                                    prev.includes(option.id) ? prev.filter((e) => e !== option.id) : [...prev, option.id]
                                );
                            }
                        }}
                        selectedIds={searchSelectedIds}
                        className="w-full sm:w-64"
                    />
                    <ColumnFilterDropdown
                        options={columnOptionsFiltered}
                        selectedIds={selectedColumnIds}
                        onToggle={(id) => {
                            setSelectedColumnIds((prev) =>
                                prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
                            );
                        }}
                        onClear={() => setSelectedColumnIds([])}
                        buttonIcon={<Columns className="h-3.5 w-3.5" />}
                    />
                    <ColumnFilterDropdown
                        options={playerOptions}
                        selectedIds={selectedPlayers}
                        onToggle={(id) => {
                            setSelectedPlayers((prev) =>
                                prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
                            );
                        }}
                        onClear={() => setSelectedPlayers([])}
                        buttonLabel="Players"
                        buttonIcon={<Users className="h-3.5 w-3.5" />}
                    />
                </div>
                {(selectedColumnIds.length > 0 || selectedPlayers.length > 0) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedColumnIds([]);
                                setSelectedPlayers([]);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-default)] bg-[var(--bg-hover)] px-2 py-1 text-[11px] text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)]"
                        >
                            Clear All
                        </button>
                        {selectedColumnIds.map((id) => {
                            const label = allColumnOptions.find((o) => o.id === id)?.label || id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedColumnIds((prev) => prev.filter((e) => e !== id))}
                                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-default)] bg-[var(--bg-hover)] px-2 py-1 text-[11px] text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)]"
                                >
                                    <span>{label}</span>
                                    <span className="text-[color:var(--text-secondary)]">&times;</span>
                                </button>
                            );
                        })}
                        {selectedPlayers.map((id) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setSelectedPlayers((prev) => prev.filter((e) => e !== id))}
                                className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-default)] bg-[var(--bg-hover)] px-2 py-1 text-[11px] text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)]"
                            >
                                <span>{id}</span>
                                <span className="text-[color:var(--text-secondary)]">&times;</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="overflow-hidden">
                {visibleMods.length === 0 ? (
                    <div className="px-4 py-10 text-center text-[color:var(--text-muted)] italic text-sm">No modifiers match this filter</div>
                ) : (
                    <DenseStatsTable
                        title={`${config.title} - Dense View`}
                        subtitle={incoming ? 'Incoming' : 'Outgoing'}
                        sortColumnId={resolvedSortColumnId}
                        sortDirection={denseSort.dir}
                        onSortColumn={(columnId) => {
                            setDenseSort((prev) => ({
                                columnId,
                                dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc',
                            }));
                        }}
                        columns={visibleMods.map((mod) => ({
                            id: mod.id,
                            label: (
                                <span className="flex items-center gap-1">
                                    {mod.icon && <img src={mod.icon} alt="" className="w-3.5 h-3.5 object-contain" />}
                                    <span className="truncate">{mod.name}</span>
                                </span>
                            ),
                            align: 'right' as const,
                            minWidth: 100,
                        }))}
                        rows={rows.map((entry, idx) => ({
                            id: `${entry.row.account}-${idx}`,
                            label: (
                                <>
                                    <span className="text-[color:var(--text-muted)] font-mono">{idx + 1}</span>
                                    {renderProfessionIcon(entry.row.profession, entry.row.professionList, 'w-4 h-4')}
                                    <span className="truncate">{entry.row.account}</span>
                                </>
                            ),
                            values: entry.values,
                        }))}
                    />
                )}
            </div>
        </div>
    );
};
