import React from 'react';
import { useStatsStore } from '../statsStore';
import { CC_FAMILY_COLOR, CC_UNCLASSIFIED_COLOR } from './ccKinds';

type Glyph = 'ring' | 'cross' | 'ring-dot' | 'ring-skull' | 'blur' | 'tag' | 'marker';

interface LegendRow {
    key: string;
    label: string;
    color: string;
    glyph: Glyph;
}

/** Marks that are drawn unconditionally, so their rows are unconditional too. */
const ALWAYS: LegendRow[] = [
    { key: 'downed',    label: 'Downed',    color: '#f97316', glyph: 'cross' },
    // Matches EventOverlay's `data-pulse="death"` mark: a red expanding ring
    // with a skull glyph for an allied death. Was mislabelled "Killed" in
    // violet, which is actually the colour of an ENEMY going down
    // (`data-pulse="down-enemy"`) — the legend taught the opposite of what
    // the map draws.
    { key: 'killed',    label: 'Death',     color: '#ef4444', glyph: 'ring-skull' },
    { key: 'commander', label: 'Commander', color: '#fbbf24', glyph: 'tag' },
    { key: 'enemy',     label: 'Enemy',     color: '#ef4444', glyph: 'marker' },
];

const Swatch: React.FC<{ glyph: Glyph; color: string }> = ({ glyph, color }) => (
    <svg width={13} height={13} viewBox="0 0 13 13" style={{ flexShrink: 0 }} aria-hidden="true">
        {glyph === 'ring' && <circle cx={6.5} cy={6.5} r={4.5} fill="none" stroke={color} strokeWidth={1.6} />}
        {glyph === 'cross' && (
            <>
                <line x1={2.5} y1={6.5} x2={10.5} y2={6.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
                <line x1={6.5} y1={2.5} x2={6.5} y2={10.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
            </>
        )}
        {glyph === 'ring-dot' && (
            <>
                <circle cx={6.5} cy={6.5} r={5} fill="none" stroke={color} strokeWidth={1.2} />
                <circle cx={6.5} cy={6.5} r={2} fill={color} />
            </>
        )}
        {glyph === 'ring-skull' && (
            <>
                <circle cx={6.5} cy={6.5} r={5} fill="none" stroke={color} strokeWidth={1.4} />
                <text x={6.5} y={9} textAnchor="middle" fontSize={7} fill={color}>☠</text>
            </>
        )}
        {glyph === 'blur' && <circle cx={6.5} cy={6.5} r={5} fill={color} opacity={0.4} />}
        {glyph === 'tag' && <polygon points="6.5,1.5 11.5,11.5 1.5,11.5" fill={color} />}
        {glyph === 'marker' && <circle cx={6.5} cy={6.5} r={4} fill={color} opacity={0.8} />}
    </svg>
);

/**
 * What the marks on the map mean, sitting next to the map rather than 400px
 * away inside the layers panel. Ownership colours are deliberately absent —
 * a sector tint explains itself, a violet ring does not.
 */
const MapLegendInner: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
    const layers = useStatsStore(state => state.replayLayers);

    const rows: LegendRow[] = [
        // Three rows, not one: the marks are coloured by what the CC did.
        // Amber leads because it is both the lockdown family and the colour an
        // unclassified mark falls back to, so it is the one a reader meets first.
        ...(layers.ccTakenMarks
            ? [
                { key: 'cc', label: 'CC taken', color: CC_UNCLASSIFIED_COLOR, glyph: 'ring' as const },
                { key: 'cc-displacement', label: 'CC: displaced', color: CC_FAMILY_COLOR.displacement, glyph: 'ring' as const },
                { key: 'cc-fear', label: 'CC: feared', color: CC_FAMILY_COLOR.fear, glyph: 'ring' as const },
            ]
            : []),
        ...ALWAYS,
        ...(layers.rallyRings
            ? [{ key: 'rallied', label: 'Rallied', color: '#22c55e', glyph: 'ring' as const }]
            : []),
        ...(layers.heatmap !== 'off'
            ? [{ key: 'heat', label: 'Death heat', color: '#ef4444', glyph: 'blur' as const }]
            : []),
    ];

    return (
        <div
            className="app-dropdown"
            style={{
                width: 132, padding: '6px 8px', borderRadius: 8,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                display: 'flex', flexDirection: 'column', gap: 3,
                ...style,
            }}
        >
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                On the map
            </div>
            {rows.map(row => (
                <div key={row.key} data-legend-row={row.key}
                     style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Swatch glyph={row.glyph} color={row.color} />
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{row.label}</span>
                </div>
            ))}
        </div>
    );
};

/** Memoised so a map pan (which re-renders ReplayView every mouse event)
 *  doesn't re-render this panel — see the note in ReplaySquadPanel.tsx. */
export const MapLegend = React.memo(MapLegendInner);
MapLegend.displayName = 'MapLegend';

export default MapLegend;
