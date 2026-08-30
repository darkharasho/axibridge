import React from 'react';

const TARGET_PX = 90;

/**
 * Snap a ruler to a round number of game units.
 *
 * `inchesPerScreenPx` is how many world inches one screen pixel currently
 * covers. Multiplying by a target width gives an ugly number (e.g. 3714
 * units), so we round it down the 1/2/5 x 10^n ladder and then report the
 * exact pixel width that rounded count occupies — the bar moves, the label
 * stays readable.
 */
export function pickScaleUnits(inchesPerScreenPx: number, targetPx = TARGET_PX): { units: number; widthPx: number } {
    if (!Number.isFinite(inchesPerScreenPx) || inchesPerScreenPx <= 0) {
        return { units: 1, widthPx: targetPx };
    }
    const raw = inchesPerScreenPx * targetPx;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / magnitude;
    const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
    const units = step * magnitude;
    return { units, widthPx: units / inchesPerScreenPx };
}

export interface ScaleBarProps {
    pixelsPerInch: { x: number; y: number };
    scale: number;
    style?: React.CSSProperties;
}

export const ScaleBar: React.FC<ScaleBarProps> = ({ pixelsPerInch, scale, style }) => {
    // pixelsPerInch is map-space px per world inch; multiplying by the
    // viewport scale converts to screen px per world inch.
    const screenPxPerInch = (pixelsPerInch?.x ?? 1) * scale;
    const { units, widthPx } = pickScaleUnits(screenPxPerInch > 0 ? 1 / screenPxPerInch : 0);

    return (
        <div
            data-testid="scale-bar"
            data-units={units}
            style={{
                display: 'flex', flexDirection: 'column', gap: 2,
                pointerEvents: 'none', userSelect: 'none', ...style,
            }}
        >
            <div style={{
                width: Math.round(widthPx), height: 5,
                borderLeft: '1px solid rgba(226,232,240,0.75)',
                borderRight: '1px solid rgba(226,232,240,0.75)',
                borderBottom: '1px solid rgba(226,232,240,0.75)',
            }} />
            <span style={{ fontSize: 9, letterSpacing: '.06em', color: 'rgba(203,213,225,0.75)' }}>
                {units.toLocaleString()} units
            </span>
        </div>
    );
};

export default ScaleBar;
