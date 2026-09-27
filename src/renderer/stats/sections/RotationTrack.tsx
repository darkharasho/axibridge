import React, { useMemo } from 'react';
import { decodeRotation, type RotationFightData, type RotationPlayerData } from '../computeRotationTimeline';

/**
 * `m:ss.mmm`, with a leading `-` for a cast that began before the log did
 * (`castTime < 0`). No sibling formatter in `src/renderer/stats/` does this
 * — every other timestamp helper here works in whole seconds — so this is
 * local and unexported rather than bolted onto a shared utils module.
 */
const mmssMillis = (ms: number): string => {
    const sign = ms < 0 ? '-' : '';
    const abs = Math.abs(ms);
    const totalSeconds = Math.floor(abs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.round(abs % 1000);
    return `${sign}${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
};

/** Zero-duration casts still need to be hoverable, so every box floors here. */
const MIN_WIDTH_PCT = 1.05;

export interface RotationTrackProps {
    fight: RotationFightData;
    player: RotationPlayerData;
    /** Row width in ms: 15000 | 30000 | 60000. */
    wrapMs: number;
}

interface CastBox {
    key: string;
    name: string;
    /** A URL string once icon-index expansion has run; a bare number if the
     *  report trimmed `iconIndex` out from under it. Only the string form is
     *  ever rendered — see the `typeof` guard at the `<img>` below. */
    icon?: string | number;
    duration: number;
    castTime: number;
    interrupted: boolean;
    prelog: boolean;
    leftPct: number;
    widthPct: number;
}

/**
 * Splits every decoded cast into per-row boxes, clipping any cast that
 * straddles a `wrapMs` row boundary into the intersection with each row it
 * touches — never the whole box duplicated into both, never dropped from
 * either.
 */
const buildRows = (fight: RotationFightData, player: RotationPlayerData, wrapMs: number): CastBox[][] => {
    const casts = decodeRotation(fight, player);
    const rowCount = Math.max(1, Math.ceil(fight.durationMs / wrapMs));
    const rows: CastBox[][] = Array.from({ length: rowCount }, () => []);

    casts.forEach((cast, castIndex) => {
        const start = cast.castTime;
        const end = cast.castTime + Math.max(0, cast.duration);
        const prelog = start < 0;
        // A pre-log cast is clamped to row 0's left edge, never assigned a
        // negative row index.
        const firstRow = Math.max(0, Math.floor(start / wrapMs));
        const lastRow = Math.max(0, Math.floor(Math.max(start, end - 1) / wrapMs));
        for (let row = Math.max(0, firstRow); row <= Math.min(lastRow, rowCount - 1); row++) {
            const rowStart = row * wrapMs;
            const rowEnd = rowStart + wrapMs;
            const clippedStart = Math.max(start, rowStart);
            const clippedEnd = Math.min(end, rowEnd);
            const leftMs = prelog && row === 0 ? 0 : Math.max(0, clippedStart - rowStart);
            const widthMs = Math.max(0, clippedEnd - Math.max(clippedStart, rowStart));
            const leftPct = (leftMs / wrapMs) * 100;
            const widthPct = Math.max(MIN_WIDTH_PCT, (widthMs / wrapMs) * 100);
            rows[row].push({
                key: `${castIndex}-${row}`,
                name: cast.name,
                icon: cast.icon,
                duration: cast.duration,
                castTime: cast.castTime,
                interrupted: cast.interrupted,
                prelog,
                leftPct,
                widthPct,
            });
        }
    });

    return rows;
};

/**
 * Border for the three box states a cast can render in. The legend derives its
 * swatches from this same function (see `LEGEND_STATES`), so the track and the
 * legend cannot drift apart.
 */
const boxBorder = (box: { interrupted: boolean; prelog: boolean }): string => {
    if (box.interrupted) return '1px solid var(--status-error)';
    // Dashed, not solid: a solid brand-primary border reads as "selected" —
    // see spec `docs/superpowers/specs/2026-09-27-rotation-timeline-design.md:226-228`.
    if (box.prelog) return '1px dashed var(--brand-primary)';
    return '1px solid var(--border-default)';
};

/** The legend's rows, as the state flags `boxBorder` switches on. Adding a
 *  fourth state to `boxBorder` without adding it here leaves it unexplained,
 *  but it can no longer be explained *wrongly*. */
const LEGEND_STATES: { label: string; state: { interrupted: boolean; prelog: boolean } }[] = [
    { label: 'Cast', state: { interrupted: false, prelog: false } },
    { label: 'Interrupted / cancelled', state: { interrupted: true, prelog: false } },
    { label: 'Began before the log started', state: { interrupted: false, prelog: true } },
];

/**
 * Explains the three border states inline, mirroring the descriptive-text
 * convention `CcTimelineSection` uses under its header (piped, muted
 * captions) rather than introducing a new legend widget for one section.
 */
const RotationLegend: React.FC = () => (
    <div className="flex flex-wrap items-center gap-3 text-[10px] mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        {LEGEND_STATES.map(({ label, state }) => (
            <span key={label} className="flex items-center gap-1">
                <span
                    className="inline-block w-3 h-2.5 rounded-sm"
                    style={{ border: boxBorder(state), background: 'var(--bg-hover)' }}
                />
                {label}
            </span>
        ))}
    </div>
);

export const RotationTrack: React.FC<RotationTrackProps> = ({ fight, player, wrapMs }) => {
    const rows = useMemo(() => buildRows(fight, player, wrapMs), [fight, player, wrapMs]);

    return (
        <div className="flex flex-col gap-1.5">
            <RotationLegend />
            {rows.map((row, rowIndex) => (
                <div
                    key={rowIndex}
                    className="relative h-6 w-full overflow-hidden"
                    style={{ background: 'var(--bg-card-inner)', borderRadius: 'var(--radius-md)' }}
                >
                    {row.map((box) => {
                        // A published report hands `icon` over already expanded to a
                        // URL; a report whose `iconIndex` itself got trimmed leaves the
                        // bare integer behind (`githubHandlers.ts` trim steps). Only the
                        // string form is ever safe to hand to `<img src>`.
                        const iconSrc = typeof box.icon === 'string' && box.icon.length > 0 ? box.icon : null;
                        return (
                            <div
                                key={box.key}
                                data-cast=""
                                data-interrupted={box.interrupted ? 'true' : undefined}
                                data-prelog={box.prelog ? 'true' : undefined}
                                className="absolute top-0.5 bottom-0.5 flex items-center gap-0.5 overflow-hidden px-0.5 text-[9px] leading-none"
                                title={`${box.name} · ${mmssMillis(box.castTime)} · ${box.duration}ms`}
                                style={{
                                    left: `${box.leftPct}%`,
                                    width: `${box.widthPct}%`,
                                    background: 'var(--bg-hover)',
                                    border: boxBorder(box),
                                    borderRadius: 'var(--radius-md)',
                                    color: 'var(--text-primary)',
                                }}
                            >
                                {/* The icon is the thing that must survive a narrow box —
                                    a 700ms cast at a 30s row is ~12px wide, nowhere near
                                    enough for a name. `shrink-0` on the icon and
                                    `min-w-0 truncate` on the name mean the name is what
                                    disappears first as the box narrows, never the icon. */}
                                {iconSrc && (
                                    <img src={iconSrc} alt="" className="h-3 w-3 object-contain shrink-0" />
                                )}
                                <span className="truncate min-w-0">{box.name}</span>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};
