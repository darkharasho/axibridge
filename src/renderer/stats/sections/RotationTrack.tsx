import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DecodedCast, RotationFightData } from '../computeRotationTimeline';

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

/**
 * Minimum rendered box width. A percentage floor cannot express "wide enough
 * for the icon": the pixel width a percentage buys depends on the row's width,
 * which the percentage does not know. 26px is the 20px icon plus its 2x2px
 * padding and 2x1px border, so a zero-duration cast stays a real click target
 * at every row width.
 */
const MIN_BOX_PX = 26;

/** `m:ss` for a row's start time. Raw seconds would read `1080s` at 60s rows on
 *  a long fight — wider than the 30px label column below `sm`, and harder to
 *  relate to the fight clock the rest of the section speaks in. */
const mmssLabel = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

/**
 * Below this many pixels a box shows its icon alone, centred. Tuned against
 * the 11px label in the app's font stack — it is a chosen constant, not a
 * derived one, so adjust it by looking at the result rather than by algebra.
 */
const NAME_MIN_PX = 78;

export interface RotationTrackProps {
    fight: RotationFightData;
    /** Row width in ms: 10000 | 15000 | 30000 | 60000. */
    wrapMs: number;
    /** Decoded once by the section so the detail sheet sees the same list. */
    casts: DecodedCast[];
    /** Index into `casts`, or null when nothing is selected. */
    selectedIndex: number | null;
    onSelectCast: (index: number) => void;
}

interface CastBox {
    key: string;
    /** Index into the section's `casts`, which `key` does not preserve as a number. */
    castIndex: number;
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
const buildRows = (
    fight: RotationFightData, casts: DecodedCast[], wrapMs: number,
): CastBox[][] => {
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
            const widthPct = (widthMs / wrapMs) * 100;
            rows[row].push({
                key: `${castIndex}-${row}`,
                castIndex,
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
    if (box.interrupted) return '1px solid var(--axi-danger)';
    // Dashed, not solid: a solid brand-primary border reads as "selected" —
    // see spec `docs/superpowers/specs/2026-09-27-rotation-timeline-design.md:226-228`.
    if (box.prelog) return '1px dashed var(--axi-accent)';
    return 'var(--axi-border-control) solid var(--axi-ink-line)';
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
    <div className="flex flex-wrap items-center gap-3.5 text-[11px] mb-2" style={{ color: 'var(--axi-text-dim)' }}>
        {LEGEND_STATES.map(({ label, state }) => (
            <span key={label} className="flex items-center gap-1">
                <span
                    className="inline-block w-3.5 h-3"
                    style={{ border: boxBorder(state), background: 'var(--axi-surface-raised-paint)' }}
                />
                {label}
            </span>
        ))}
    </div>
);

export const RotationTrack: React.FC<RotationTrackProps> = ({
    fight, wrapMs, casts, selectedIndex, onSelectCast,
}) => {
    const rows = useMemo(() => buildRows(fight, casts, wrapMs), [fight, casts, wrapMs]);

    // Rows are all the same width, so measuring the first one measures them
    // all. `measure()` runs directly here rather than waiting on `observe()`:
    // the test stub's `observe()` is a deliberate no-op, and in the browser a
    // layout-effect read is the earliest correct measurement anyway.
    const rowRef = useRef<HTMLDivElement | null>(null);
    const [trackPx, setTrackPx] = useState(0);
    useLayoutEffect(() => {
        const el = rowRef.current;
        if (!el) return;
        const measure = () => setTrackPx(el.getBoundingClientRect().width);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [wrapMs, rows.length]);

    return (
        <div className="flex flex-col gap-1.5">
            <RotationLegend />
            {rows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex items-stretch gap-2">
                    {/* Once the track is the full width of a phone, a reader has
                        nothing to anchor a row to without this. */}
                    <span
                        data-row-label=""
                        className="shrink-0 text-right w-[30px] sm:w-[38px] text-[10px] sm:text-[11px] pt-2.5 tabular-nums"
                        style={{ color: 'var(--axi-text-faint)' }}
                    >
                        {mmssLabel(rowIndex * wrapMs)}
                    </span>
                    <div
                        ref={rowIndex === 0 ? rowRef : undefined}
                        data-track-row=""
                        className="relative h-9 flex-1 min-w-0 overflow-hidden"
                        style={{ background: 'var(--axi-ground)', borderRadius: 'var(--axi-radius-sm)' }}
                    >
                    {row.map((box) => {
                        // A published report hands `icon` over already expanded to a
                        // URL; a report whose `iconIndex` itself got trimmed leaves the
                        // bare integer behind (`githubHandlers.ts` trim steps). Only the
                        // string form is ever safe to hand to `<img src>`.
                        const iconSrc = typeof box.icon === 'string' && box.icon.length > 0 ? box.icon : null;
                        // An unmeasured track (first paint, and jsdom, which has no
                        // layout engine) reports 0 and takes the icon-only branch.
                        // An icon with no name is always correct; a name clipped to
                        // three characters is not.
                        const showName = trackPx > 0 && (box.widthPct / 100) * trackPx >= NAME_MIN_PX;
                        const selected = selectedIndex === box.castIndex;
                        return (
                            <button
                                key={box.key}
                                type="button"
                                onClick={() => onSelectCast(box.castIndex)}
                                aria-pressed={selected}
                                aria-label={`${box.name}, cast at ${mmssMillis(box.castTime)}, ${box.duration} milliseconds${box.interrupted ? ', interrupted' : ''}`}
                                data-cast=""
                                data-interrupted={box.interrupted ? 'true' : undefined}
                                data-prelog={box.prelog ? 'true' : undefined}
                                className={`absolute top-[3px] bottom-[3px] flex items-center gap-1 overflow-hidden px-1 text-[11px] leading-none appearance-none text-left rotation-cast ${showName ? 'justify-start' : 'justify-center'}`}
                                title={`${box.name} · ${mmssMillis(box.castTime)} · ${box.duration}ms`}
                                style={{
                                    left: `${box.leftPct}%`,
                                    width: `${box.widthPct}%`,
                                    minWidth: `${MIN_BOX_PX}px`,
                                    background: selected ? 'var(--axi-ground)' : 'var(--axi-surface-raised-paint)',
                                    border: boxBorder(box),
                                    outline: selected ? '2px solid var(--axi-accent)' : undefined,
                                    outlineOffset: selected ? '-1px' : undefined,
                                    borderRadius: 'var(--axi-radius-sm)',
                                    color: 'var(--axi-text)',
                                }}
                            >
                                {/* The icon is the thing that must survive a narrow box —
                                    a 700ms cast at a 30s row is ~12px wide, nowhere near
                                    enough for a name. `shrink-0` on the icon and
                                    `min-w-0 truncate` on the name mean the name is what
                                    disappears first as the box narrows, never the icon. */}
                                {iconSrc && (
                                    <img src={iconSrc} alt="" className="h-5 w-5 object-contain shrink-0" />
                                )}
                                {showName && <span className="truncate min-w-0">{box.name}</span>}
                            </button>
                        );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};
