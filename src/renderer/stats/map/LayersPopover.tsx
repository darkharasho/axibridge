import React from 'react';
import { useStatsStore } from '../statsStore';

const SQUAD_TOGGLES: { key: 'centroidSpread' | 'tagRangeRings' | 'squadHealthStrip' | 'partyHulls'; label: string; title: string }[] = [
    { key: 'centroidSpread', label: 'Centroid + spread ring', title: 'Shows the squad\'s center of mass and a ring indicating how spread out the group is' },
    { key: 'tagRangeRings', label: 'Tag range rings (600 / 1200)', title: 'Draws circles at 600 and 1200 unit radius around the commander tag — useful for checking boon range' },
    { key: 'squadHealthStrip', label: 'Squad health strip', title: 'Health bar strip along the top of the map showing each squad member\'s HP in real time' },
    { key: 'partyHulls', label: 'Per-party hulls', title: 'Convex hull outline around each sub-party, helping visualise how spread out individual groups are' },
];

const PHASE_LEGEND: { kind: string; color: string; desc: string }[] = [
    { kind: 'opening', color: '#60a5fa', desc: 'First ~10 s, no deaths yet' },
    { kind: 'push',    color: '#22c55e', desc: 'Squad advancing, no recent deaths' },
    { kind: 'retreat', color: '#ef4444', desc: 'Squad taking deaths (any movement)' },
    { kind: 'cleanup', color: '#a78bfa', desc: 'Squad stationary / mopping up' },
];

const EVENT_TOGGLES: { key: 'phases' | 'rallyRings' | 'targetFocusLines' | 'damagePulses'; label: string; title: string }[] = [
    { key: 'phases', label: 'Fight phases on timeline', title: 'Marks fight phase boundaries on the scrubber timeline — colours show squad behaviour (opening / push / retreat / cleanup)' },
    { key: 'rallyRings', label: 'Rally rings', title: 'Flashes a ring when a downed player rallies back to full health' },
    { key: 'targetFocusLines', label: 'Target-focus lines', title: 'Lines from each player to the target they are currently damaging most' },
    { key: 'damagePulses', label: 'Damage pulses', title: 'Animated pulses radiating from players when they deal significant burst damage' },
];

const HEATMAP_OPTIONS: { value: 'off' | 'deaths' | 'time' | 'damage-taken'; label: string; title: string }[] = [
    { value: 'off', label: 'Off', title: 'No heatmap overlay' },
    { value: 'deaths', label: 'Deaths', title: 'Heatmap showing where players died most frequently during the fight' },
    { value: 'time', label: 'Time spent', title: 'Heatmap showing which areas of the map were occupied for the longest time' },
    { value: 'damage-taken', label: 'Damage taken', title: 'Heatmap showing where the squad received the most incoming damage' },
];

interface LayersPanelProps {
    open: boolean;
    onToggle: () => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({ open, onToggle }) => {
    const layers = useStatsStore(state => state.replayLayers);
    const setReplayLayer = useStatsStore(state => state.setReplayLayer);
    const setReplayHeatmapMode = useStatsStore(state => state.setReplayHeatmapMode);

    if (!open) {
        return (
            <button
                type="button"
                title="Show layers"
                onClick={onToggle}
                style={{
                    width: 28, flexShrink: 0,
                    background: 'var(--bg-elevated)',
                    borderRight: '1px solid var(--border-default)',
                    border: 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    paddingTop: 8, cursor: 'pointer',
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
        <div style={{
            width: 220, flexShrink: 0,
            background: 'var(--bg-elevated)',
            borderRight: '1px solid var(--border-default)',
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
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Squad overlay</div>
                {SQUAD_TOGGLES.map(t => (
                    <label key={t.key} title={t.title} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-primary)', padding: '3px 0', cursor: 'pointer' }}>
                        <input type="checkbox"
                               checked={layers[t.key]}
                               onChange={e => setReplayLayer(t.key, e.currentTarget.checked)} />
                        <span>{t.label}</span>
                    </label>
                ))}
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 12, marginBottom: 6 }}>Events</div>
                {EVENT_TOGGLES.map(t => (
                    <React.Fragment key={t.key}>
                        <label title={t.title} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-primary)', padding: '3px 0', cursor: 'pointer' }}>
                            <input type="checkbox"
                                   checked={layers[t.key]}
                                   onChange={e => setReplayLayer(t.key, e.currentTarget.checked)} />
                            <span>{t.label}</span>
                        </label>
                        {t.key === 'phases' && layers.phases && (
                            <div style={{ marginLeft: 20, marginBottom: 4 }}>
                                {PHASE_LEGEND.map(p => (
                                    <div key={p.kind} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                                        <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color, flexShrink: 0, display: 'inline-block' }} />
                                        <span style={{ fontSize: 10, color: p.color, fontWeight: 600, minWidth: 46 }}>{p.kind}</span>
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.desc}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </React.Fragment>
                ))}
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

export default LayersPanel;
