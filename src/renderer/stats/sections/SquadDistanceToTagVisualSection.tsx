import { useMemo, useState } from 'react';
import { Maximize2, X, Crosshair } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { getProfessionColor } from '../../../shared/professionUtils';
import type { DistanceToTagResult, DistanceToTagRow } from '../computeDistanceToTag';

type MetricKey = 'avg' | 'p25' | 'median' | 'p75' | 'p95';

type Props = {
    result: DistanceToTagResult;
    filterEnabled?: boolean;
    minFights?: number;
};

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
    { key: 'avg', label: 'Avg' },
    { key: 'p25', label: 'p25' },
    { key: 'median', label: 'Median' },
    { key: 'p75', label: 'p75' },
    { key: 'p95', label: 'p95' },
];

const VIEW_RADIUS = 200;
const OUTER_RADIUS = 190;
const SCALE_MAX = 1500;
const CHIP_RADIUS = 7;
const CHIP_RADIUS_EXPANDED = 10;

const ZONES: Array<{ inner: number; outer: number; fill: string }> = [
    { inner: 0, outer: 600, fill: 'rgb(34, 197, 94)' },
    { inner: 600, outer: 800, fill: 'rgb(234, 179, 8)' },
    { inner: 800, outer: 1200, fill: 'rgb(249, 115, 22)' },
    { inner: 1200, outer: SCALE_MAX, fill: 'rgb(239, 68, 68)' },
];

const RING_LABELS = [600, 800, 1200];

const distToRadius = (distance: number): number => {
    const clamped = Math.max(0, Math.min(distance, SCALE_MAX));
    return (clamped / SCALE_MAX) * OUTER_RADIUS;
};

// Stable string hash → angle in [0, 2π).
const accountAngle = (account: string): number => {
    let h = 0;
    for (let i = 0; i < account.length; i++) {
        h = (h * 31 + account.charCodeAt(i)) | 0;
    }
    const u = ((h >>> 0) % 1000) / 1000;
    return u * Math.PI * 2;
};

type ChipPosition = { row: DistanceToTagRow; r: number; angle: number; x: number; y: number };

// Bucket chips into radial bands (band height = chip diameter + small gap), then
// evenly distribute the chips inside each band around the circumference. This
// guarantees no overlap for same-band chips (the previous force-nudge pass
// couldn't separate exactly-overlapping chips and could fail to converge with
// a tight squad). Chip order within a band is stable per account so toggling
// metrics moves chips between bands but doesn't randomly shuffle.
const computeChipPositions = (
    rows: DistanceToTagRow[],
    metric: MetricKey,
    chipRadius: number
): ChipPosition[] => {
    if (rows.length === 0) return [];
    const bandHeight = chipRadius * 2 + 2;
    type Bucketed = { row: DistanceToTagRow; r: number; bandIndex: number; seed: number };
    const items: Bucketed[] = rows.map(row => {
        const r = distToRadius(row[metric]);
        const bandIndex = Math.floor(r / bandHeight);
        return { row, r, bandIndex, seed: accountAngle(row.account) };
    });
    const byBand = new Map<number, Bucketed[]>();
    for (const item of items) {
        const list = byBand.get(item.bandIndex);
        if (list) list.push(item);
        else byBand.set(item.bandIndex, [item]);
    }
    const placed: ChipPosition[] = [];
    for (const list of byBand.values()) {
        list.sort((a, b) => (a.seed - b.seed) || a.row.account.localeCompare(b.row.account));
        const baseAngle = list[0].seed;
        const step = (Math.PI * 2) / list.length;
        list.forEach((item, idx) => {
            const angle = baseAngle + idx * step;
            placed.push({
                row: item.row,
                r: item.r,
                angle,
                x: item.r * Math.cos(angle),
                y: item.r * Math.sin(angle),
            });
        });
    }
    return placed;
};

export const SquadDistanceToTagVisualSection = (props: Props) => {
    const { result } = props;
    const {
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
    } = useStatsSharedContext();
    const sectionId = 'squad-distance-to-tag-visual';
    const isExpanded = expandedSection === sectionId;
    const [metric, setMetric] = useState<MetricKey>('avg');
    const [hoverAccount, setHoverAccount] = useState<string | null>(null);

    const rows = useMemo(() => {
        const all = result?.rows ?? [];
        if (props.filterEnabled && typeof props.minFights === 'number') {
            return all.filter(r => r.fightCount >= props.minFights!);
        }
        return all;
    }, [result, props.filterEnabled, props.minFights]);

    const chipRadius = isExpanded ? CHIP_RADIUS_EXPANDED : CHIP_RADIUS;
    const chips = useMemo(() => computeChipPositions(rows, metric, chipRadius), [rows, metric, chipRadius]);
    const hovered = hoverAccount ? chips.find(c => c.row.account === hoverAccount) : null;

    const viewboxSize = VIEW_RADIUS * 2;
    const containerSize = isExpanded ? 560 : 380;

    return (
        <div
            className={isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Crosshair className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Distance to Tag — Visual</h3>
                {rows.length > 0 && (
                    <div className="ml-auto flex flex-nowrap items-center gap-1 text-[11px] whitespace-nowrap" role="group" aria-label="Metric">
                        {METRIC_OPTIONS.map(opt => {
                            const active = metric === opt.key;
                            return (
                                <button
                                    key={opt.key}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setMetric(opt.key)}
                                    className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider transition-colors"
                                    style={{
                                        background: active ? 'var(--brand-primary)' : 'var(--bg-card-inner)',
                                        color: active ? 'var(--bg-elevated)' : 'var(--text-secondary)',
                                        border: '1px solid var(--border-subtle)',
                                        fontWeight: active ? 700 : 500,
                                    }}
                                >{opt.label}</button>
                            );
                        })}
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className={`${rows.length > 0 ? '' : 'ml-auto '}flex items-center justify-center w-[26px] h-[26px]`}
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Distance to Tag Visual' : 'Expand Distance to Tag Visual'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>

            {rows.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    No distance data for the loaded fights.
                </div>
            ) : (
                <div className="flex justify-center">
                    <div style={{ position: 'relative', width: containerSize, height: containerSize }}>
                        <svg
                            viewBox={`-${VIEW_RADIUS} -${VIEW_RADIUS} ${viewboxSize} ${viewboxSize}`}
                            width={containerSize}
                            height={containerSize}
                            style={{ display: 'block' }}
                        >
                            {[...ZONES].reverse().map((z) => (
                                <circle
                                    key={`zone-${z.inner}-${z.outer}`}
                                    cx={0}
                                    cy={0}
                                    r={distToRadius(z.outer)}
                                    fill={z.fill}
                                    stroke="none"
                                />
                            ))}
                            {RING_LABELS.map((d) => (
                                <g key={`ring-${d}`}>
                                    <circle
                                        cx={0}
                                        cy={0}
                                        r={distToRadius(d)}
                                        fill="none"
                                        stroke="rgba(255,255,255,0.25)"
                                        strokeDasharray="3 3"
                                    />
                                    <text
                                        x={distToRadius(d) + 2}
                                        y={-2}
                                        fontSize={9}
                                        fill="var(--text-muted)"
                                    >{d}</text>
                                </g>
                            ))}
                            <circle cx={0} cy={0} r={8} fill="var(--status-warning)" stroke="#fff" strokeWidth={1.5} />
                            <text x={0} y={20} fontSize={9} fill="var(--text-secondary)" textAnchor="middle">TAG</text>
                            {chips.map(chip => (
                                <g
                                    key={chip.row.account}
                                    data-chip-account={chip.row.account}
                                    data-chip-radius={chip.r}
                                    transform={`translate(${chip.x} ${chip.y})`}
                                    onMouseEnter={() => setHoverAccount(chip.row.account)}
                                    onMouseLeave={() => setHoverAccount(null)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <circle
                                        r={chipRadius}
                                        fill={getProfessionColor(chip.row.profession)}
                                        stroke={chip.row.account === hoverAccount ? '#fff' : 'rgba(0,0,0,0.45)'}
                                        strokeWidth={chip.row.account === hoverAccount ? 2 : 1}
                                    />
                                    {chip.row.isCommander && (
                                        <text x={0} y={3} fontSize={9} textAnchor="middle" fill="#fff">★</text>
                                    )}
                                </g>
                            ))}
                        </svg>
                        {hovered && (
                            <div
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    bottom: 0,
                                    transform: 'translate(-50%, calc(100% + 6px))',
                                    background: 'var(--bg-card)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '0.5rem',
                                    padding: '8px 10px',
                                    fontSize: 11,
                                    color: 'var(--text-primary)',
                                    minWidth: 180,
                                    pointerEvents: 'none',
                                    zIndex: 5,
                                }}
                            >
                                <div style={{ fontWeight: 700 }}>{hovered.row.account}</div>
                                <div style={{ color: 'var(--text-secondary)' }}>{hovered.row.profession} · {hovered.row.fightCount} fights</div>
                                <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 10 }}>
                                    avg {formatWithCommas(hovered.row.avg, 0)} · p25 {formatWithCommas(hovered.row.p25, 0)} · med {formatWithCommas(hovered.row.median, 0)} · p75 {formatWithCommas(hovered.row.p75, 0)} · p95 {formatWithCommas(hovered.row.p95, 0)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
