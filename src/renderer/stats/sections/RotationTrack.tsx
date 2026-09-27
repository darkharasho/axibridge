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

export const RotationTrack: React.FC<RotationTrackProps> = ({ fight, player, wrapMs }) => {
    const rows = useMemo(() => buildRows(fight, player, wrapMs), [fight, player, wrapMs]);

    return (
        <div className="flex flex-col gap-1.5">
            {rows.map((row, rowIndex) => (
                <div
                    key={rowIndex}
                    className="relative h-6 w-full overflow-hidden"
                    style={{ background: 'var(--bg-card-inner)', borderRadius: 'var(--radius-md)' }}
                >
                    {row.map((box) => (
                        <div
                            key={box.key}
                            data-cast=""
                            data-interrupted={box.interrupted ? 'true' : undefined}
                            data-prelog={box.prelog ? 'true' : undefined}
                            className="absolute top-0.5 bottom-0.5 flex items-center overflow-hidden px-0.5 text-[9px] leading-none"
                            title={`${box.name} · ${mmssMillis(box.castTime)} · ${box.duration}ms`}
                            style={{
                                left: `${box.leftPct}%`,
                                width: `${box.widthPct}%`,
                                background: 'var(--bg-hover)',
                                border: `1px solid ${box.interrupted ? 'var(--status-error)' : box.prelog ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            <span className="truncate">{box.name}</span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};
