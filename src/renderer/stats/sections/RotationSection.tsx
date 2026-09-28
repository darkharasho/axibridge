import React, { useContext, useMemo, useState } from 'react';
import { ListOrdered, Maximize2, X } from 'lucide-react';
import { FightPicker } from './BucketGridTable';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import { StatsSharedContext } from '../StatsViewContext';
import type { RotationFightData } from '../computeRotationTimeline';
import { RotationTrack } from './RotationTrack';

/** Matches the taxonomy id in `statsTaxonomy.ts`, which the expand state keys on. */
const SECTION_ID = 'rotation';

const ROTATION_ACCENT = '#8b5cf6';

/**
 * Rotation is its own axilog parse option (`rotation: true`), not gated on
 * any version floor the way the CC/strip timeline lanes are — so this does
 * NOT reuse `TIMELINE_NOT_RECORDED_MESSAGE`, whose wording blames a
 * version floor that does not apply here. The literal substring "re-parse"
 * is asserted by the section's own test.
 */
const ROTATION_NOT_RECORDED_MESSAGE =
    'Not recorded for this fight — the log needs a re-parse with rotation data enabled to populate.';

/**
 * A dataset can have `recorded: true` (some ingested log carried rotation)
 * while `fights` is still empty: the upload trimmer drops the drilldown
 * under the report's size budget. That is a different story than "never
 * recorded" and needs its own wording.
 */
const ROTATION_TRIMMED_MESSAGE =
    'Rotation data was recorded but dropped from this report to stay under the upload size limit.';

const WRAP_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 10000, label: '10s' },
    { value: 15000, label: '15s' },
    { value: 30000, label: '30s' },
    { value: 60000, label: '60s' },
];

export interface RotationSectionProps {
    fights: RotationFightData[];
    recorded: boolean;
    selectedFightId: string | null;
}

/**
 * Per-cast timeline for one player at a time. Fight selection and player
 * selection are both owned entirely by this section, mirroring
 * `CcTimelineSection` — `selectedFightId` only seeds the picker on mount.
 */
export const RotationSection: React.FC<RotationSectionProps> = ({
    fights, recorded, selectedFightId,
}) => {
    // Uses `useContext` directly rather than the throwing `useStatsSharedContext`
    // wrapper: `RotationSection` can render standalone (e.g. this section's own
    // tests) with no `StatsSharedContext.Provider` above it, and expand/collapse
    // is the only thing this section needs from the context — everything else
    // (profession icons) is imported directly, matching `CcTimelineSection`.
    const sharedContext = useContext(StatsSharedContext);
    const expandedSection = sharedContext?.expandedSection ?? null;
    const expandedSectionClosing = sharedContext?.expandedSectionClosing ?? false;
    const openExpandedSection = sharedContext?.openExpandedSection ?? (() => {});
    const closeExpandedSection = sharedContext?.closeExpandedSection ?? (() => {});
    const isExpanded = expandedSection === SECTION_ID;
    const [internalFightId, setInternalFightId] = useState<string | null>(selectedFightId);
    // 15s, not 30s: at 30s a typical 600-900ms cast is ~25px wide on a desktop
    // track, too narrow for the 20px icon plus any name. 15s gives ~55-70px
    // (icon, no name) and 10s gives ~100px+ (icon and name). 30s and 60s remain
    // for reading a long fight's shape on one screen.
    const [wrapMs, setWrapMs] = useState<number>(15000);
    const [selectedPlayerKey, setSelectedPlayerKey] = useState<string | null>(null);
    const [playerFilter, setPlayerFilter] = useState('');

    const resolvedFightId = internalFightId;
    // `fights` is only known to be an array past the `Array.isArray` guard
    // below; every hook must still run unconditionally on every render, so
    // this local stands in for the "not an array" and "empty" cases without
    // branching before the hooks that follow.
    const safeFights = Array.isArray(fights) ? fights : [];

    const fight = useMemo(
        () => safeFights.find(f => f.id === resolvedFightId) || safeFights[safeFights.length - 1] || null,
        [safeFights, resolvedFightId],
    );

    const sortedPlayers = useMemo(() => {
        if (!fight) return [];
        return [...fight.players]
            .sort((a, b) => a.group - b.group || a.displayName.localeCompare(b.displayName));
    }, [fight]);

    const filteredPlayers = useMemo(() => {
        const needle = playerFilter.trim().toLowerCase();
        if (!needle) return sortedPlayers;
        return sortedPlayers.filter(p => p.displayName.toLowerCase().includes(needle));
    }, [sortedPlayers, playerFilter]);

    const selectedPlayer = useMemo(() => {
        if (selectedPlayerKey) {
            const hit = sortedPlayers.find(p => p.key === selectedPlayerKey);
            if (hit) return hit;
        }
        return sortedPlayers[0] || null;
    }, [sortedPlayers, selectedPlayerKey]);

    // An older `report.json` has no `rotationTimelineDrilldown` at all, and
    // a half-rendered shell is worse than nothing.
    if (!Array.isArray(fights)) return null;

    if (fights.length === 0) {
        return (
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <ListOrdered className="w-4 h-4 shrink-0" style={{ color: ROTATION_ACCENT }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Rotation</h3>
                <p className="text-[11px] w-full ml-6" style={{ color: 'var(--text-muted)' }}>
                    {recorded ? ROTATION_TRIMMED_MESSAGE : ROTATION_NOT_RECORDED_MESSAGE}
                </p>
            </div>
        );
    }

    const castsPerMin = selectedPlayer && selectedPlayer.activeMs > 0
        ? (selectedPlayer.skill.length / (selectedPlayer.activeMs / 60000)).toFixed(1)
        : '—';
    const distinctSkills = selectedPlayer ? new Set(selectedPlayer.skill).size : 0;

    return (
        <div
            className={isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 p-4 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}
            style={isExpanded ? { background: 'var(--pane-bg, var(--bg-elevated))', boxShadow: 'var(--pane-block, var(--shadow-card))' } : undefined}
        >
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <ListOrdered className="w-4 h-4 shrink-0" style={{ color: ROTATION_ACCENT }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Rotation</h3>
                <span className="ml-auto flex items-center gap-2">
                    <FightPicker fights={fights} selectedId={fight?.id} onChange={setInternalFightId} />
                    <select
                        value={wrapMs}
                        onChange={(event) => setWrapMs(Number(event.target.value))}
                        aria-label="Row width"
                        className="fight-diff-select rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-2 py-1 text-xs focus:outline-none"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                    >
                        {WRAP_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </span>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(SECTION_ID))}
                    className="flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Rotation' : 'Expand Rotation'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>
            <div className="text-[10px] mb-3 ml-6" style={{ color: 'var(--text-secondary)' }}>
                Per-cast timeline for one player
            </div>
            <div className="flex gap-3">
                <div className="w-52 shrink-0 flex flex-col gap-1">
                    <input
                        type="text"
                        value={playerFilter}
                        onChange={(event) => setPlayerFilter(event.target.value)}
                        placeholder="Filter players"
                        className="rounded-[var(--radius-md)] border px-2 py-1 text-xs focus:outline-none"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', borderColor: 'var(--border-default)' }}
                    />
                    <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                        {filteredPlayers.map(p => (
                            <button
                                key={p.key}
                                type="button"
                                onClick={() => setSelectedPlayerKey(p.key)}
                                className="flex items-center gap-1.5 px-1.5 py-1 text-left text-[11px] rounded-[var(--radius-md)]"
                                style={{
                                    background: selectedPlayer?.key === p.key ? 'var(--bg-hover)' : 'transparent',
                                    color: 'var(--text-primary)',
                                    border: `1px solid ${selectedPlayer?.key === p.key ? 'var(--border-hover)' : 'transparent'}`,
                                }}
                            >
                                {renderProfessionIcon(p.profession, undefined, 'w-3.5 h-3.5 shrink-0')}
                                <span className="truncate flex-1">{p.displayName}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{p.skill.length}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    {selectedPlayer && fight ? (
                        <>
                            <div className="flex flex-wrap gap-3 mb-2 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                <span>Casts: {selectedPlayer.skill.length}</span>
                                <span>Active: {(selectedPlayer.activeMs / 1000).toFixed(1)}s</span>
                                <span>Casts/min: {castsPerMin}</span>
                                <span>Interrupted: {selectedPlayer.interrupted.length}</span>
                                <span>Distinct skills: {distinctSkills}</span>
                            </div>
                            <RotationTrack fight={fight} player={selectedPlayer} wrapMs={wrapMs} />
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
};
