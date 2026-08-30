import React from 'react';
import { useStatsStore } from '../statsStore';

const MAP_TOGGLES: { key: 'zoneBorders' | 'scaleBar'; label: string; title: string }[] = [
    { key: 'zoneBorders', label: 'Zone borders', title: 'Outlines each map sector in its owning team\'s colour (neutral when ownership is unknown)' },
    { key: 'scaleBar', label: 'Scale bar', title: 'A ruler in the map\'s bottom-left corner showing how many game units a given screen width covers at the current zoom' },
];

const SQUAD_TOGGLES: { key: 'centroidSpread' | 'tagRangeRings' | 'squadHealthStrip' | 'partyHulls'; label: string; title: string }[] = [
    { key: 'centroidSpread', label: 'Centroid + spread ring', title: 'Shows the squad\'s center of mass and a ring indicating how spread out the group is' },
    { key: 'tagRangeRings', label: 'Tag range rings (600 / 1200)', title: 'Draws circles at 600 and 1200 unit radius around the commander tag — useful for checking boon range' },
    { key: 'squadHealthStrip', label: 'Squad health strip', title: 'Health bar strip along the top of the map showing each squad member\'s HP in real time' },
    { key: 'partyHulls', label: 'Per-party hulls', title: 'Convex hull outline around each sub-party, helping visualise how spread out individual groups are' },
];

type Accent = 'cc' | 'strip' | undefined;

const LANE_NORMALIZATION_NOTE = ' Each lane is scaled to its own peak, so bar heights are not comparable across the zero line.';

const EVENT_TOGGLES: { key: 'phases' | 'rallyRings' | 'targetFocusLines' | 'damagePulses' | 'enemyPulses' | 'ccLane' | 'stripLane' | 'ccInLane' | 'stripInLane' | 'ccTakenMarks'; label: string; title: string; accent?: Accent }[] = [
    { key: 'phases', label: 'Fight phases on timeline', title: 'Marks fight phase boundaries on the scrubber timeline — colours show squad behaviour (opening / push / retreat / cleanup)' },
    { key: 'rallyRings', label: 'Rally rings', title: 'Flashes a ring when a downed player rallies back to full health' },
    { key: 'targetFocusLines', label: 'Target-focus lines', title: 'Lines from each player to the target they are currently damaging most' },
    { key: 'damagePulses', label: 'Damage pulses', title: 'Animated pulses radiating from players when they deal significant burst damage' },
    { key: 'enemyPulses', label: 'Enemy pulses', title: 'Also pulse when ENEMY players go down or die (violet / green). Off by default because these usually far outnumber your squad’s own' },
    { key: 'ccLane', label: 'CC lane', title: `Sub-lane on the timeline showing squad crowd control applied per second.${LANE_NORMALIZATION_NOTE}`, accent: 'cc' },
    { key: 'stripLane', label: 'Strip lane', title: `Sub-lane on the timeline showing squad boon strips applied per second.${LANE_NORMALIZATION_NOTE}`, accent: 'strip' },
    { key: 'ccInLane', label: 'CC taken lane', title: `Sub-lane showing crowd control landed ON the squad per second. Scaled independently of the CC lane — incoming CC counts every source and folds no pets, so it reads higher than outgoing by construction. Needs Include Timeline Arrays and axilog 1.9.0.${LANE_NORMALIZATION_NOTE}`, accent: 'cc' },
    { key: 'stripInLane', label: 'Strips taken lane', title: `Sub-lane showing boons stripped OFF the squad per second. Needs Include Timeline Arrays.${LANE_NORMALIZATION_NOTE}`, accent: 'strip' },
    { key: 'ccTakenMarks', label: 'CC taken marks (map)', title: 'Rings the individual players who took crowd control, on the map, for the second it landed in — ring weight grows with how much CC hit them that second. Same data as the CC taken lane, kept attributed instead of summed, so a lane spike and a cluster of rings are one event seen two ways. Ring colour says what the CC did: cyan displaced them (knockback, pull, launch, float, sink), pink feared them, amber locked them down (stun, daze, knockdown, stagger) — and amber is also what a fight parsed before axilog 1.10 falls back to, since those rows were counted without being classified. Turn off if a squad-wide bomb ringing most of the roster at once is more noise than signal', accent: 'cc' },
];

const HEATMAP_OPTIONS: { value: 'off' | 'deaths' | 'time' | 'damage-taken'; label: string; title: string }[] = [
    { value: 'off', label: 'Off', title: 'No heatmap overlay' },
    { value: 'deaths', label: 'Deaths', title: 'Heatmap showing where players died most frequently during the fight' },
    { value: 'time', label: 'Time spent', title: 'Heatmap showing which areas of the map were occupied for the longest time' },
    { value: 'damage-taken', label: 'Damage taken', title: 'Heatmap showing where the squad received the most incoming damage' },
];

const ACCENT_COLOR: Record<'cc' | 'strip', string> = { cc: '#f59e0b', strip: '#e879f9' };

/** Chips wrap instead of stacking, so twenty toggles fit a 216px card. */
const Chip: React.FC<{
    checked: boolean;
    label: string;
    title: string;
    accent: Accent;
    onChange: (v: boolean) => void;
}> = ({ checked, label, title, accent, onChange }) => {
    const color = accent ? ACCENT_COLOR[accent] : 'var(--status-info)';
    return (
        <label
            title={title}
            data-accent={accent}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 7px', borderRadius: 12, cursor: 'pointer',
                fontSize: 10, lineHeight: '15px',
                background: checked ? `${color}22` : 'var(--bg-input)',
                border: `1px solid ${checked ? color : 'var(--border-subtle)'}`,
                color: checked ? color : 'var(--text-muted)',
            }}
        >
            {/* Kept as a real checkbox rather than aria-pressed so screen
                readers and getByRole('checkbox') both still work. */}
            <input
                type="checkbox"
                checked={checked}
                onChange={e => onChange(e.currentTarget.checked)}
                style={{
                    position: 'absolute', width: 1, height: 1,
                    opacity: 0, pointerEvents: 'none', margin: 0,
                }}
            />
            <span>{label}</span>
        </label>
    );
};

const chipRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 };

interface LayersPanelProps {
    open: boolean;
    onToggle: () => void;
}

const LayersPanelInner: React.FC<LayersPanelProps> = ({ open, onToggle }) => {
    const layers = useStatsStore(state => state.replayLayers);
    const setReplayLayer = useStatsStore(state => state.setReplayLayer);
    const setReplayHeatmapMode = useStatsStore(state => state.setReplayHeatmapMode);

    if (!open) {
        return (
            <button
                type="button"
                title="Show layers"
                onClick={onToggle}
                className="app-dropdown"
                style={{
                    width: 28, flexShrink: 0,
                    background: 'var(--bg-elevated)',
                    borderRadius: 8,
                    borderRight: '1px solid var(--border-default)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    // Symmetric padding, not paddingTop alone: the vertical label's
                    // final glyph otherwise sits flush on the border-radius and its
                    // foot is sheared off by the corner.
                    padding: '8px 0', cursor: 'pointer',
                }}
            >
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>▶</span>
                <span style={{ writingMode: 'vertical-rl', fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 7, transform: 'rotate(180deg)' }}>
                    Layers
                </span>
            </button>
        );
    }

    return (
        <div data-layers-panel className="app-dropdown" style={{
            width: 216, maxHeight: '100%',
            background: 'var(--bg-elevated)',
            borderRadius: 10, border: '1px solid var(--border-default)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Layers</span>
                <button
                    type="button"
                    title="Collapse layers panel"
                    onClick={onToggle}
                    style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px', borderRadius: 3, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                    ◀
                </button>
            </div>
            <div className="replay-scroll" style={{ overflowY: 'auto', flex: 1, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Map</div>
                <div style={chipRow}>
                    {MAP_TOGGLES.map(t => (
                        <Chip key={t.key}
                              checked={layers[t.key]}
                              label={t.label}
                              title={t.title}
                              accent={undefined}
                              onChange={v => setReplayLayer(t.key, v)} />
                    ))}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 12, marginBottom: 6 }}>Squad overlay</div>
                <div style={chipRow}>
                    {SQUAD_TOGGLES.map(t => (
                        <Chip key={t.key}
                              checked={layers[t.key]}
                              label={t.label}
                              title={t.title}
                              accent={undefined}
                              onChange={v => setReplayLayer(t.key, v)} />
                    ))}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 12, marginBottom: 6 }}>Events</div>
                <div style={chipRow}>
                    {EVENT_TOGGLES.map(t => (
                        <Chip key={t.key}
                              checked={layers[t.key]}
                              label={t.label}
                              title={t.title}
                              accent={t.accent}
                              onChange={v => setReplayLayer(t.key, v)} />
                    ))}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 12, marginBottom: 6 }}>Heatmap</div>
                {HEATMAP_OPTIONS.map(opt => (
                    <label key={opt.value} title={opt.title} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-primary)', padding: '3px 0', cursor: 'pointer' }}>
                        <input type="radio" name="replay-heatmap"
                               value={opt.value}
                               checked={layers.heatmap === opt.value}
                               onChange={() => setReplayHeatmapMode(opt.value)} />
                        <span>{opt.label}</span>
                    </label>
                ))}
            </div>
        </div>
    );
};


/** Memoised so a map pan (which re-renders ReplayView every mouse event)
 *  doesn't re-render this panel — see the note in ReplaySquadPanel.tsx. */
export const LayersPanel = React.memo(LayersPanelInner);
LayersPanel.displayName = 'LayersPanel';

export default LayersPanel;
