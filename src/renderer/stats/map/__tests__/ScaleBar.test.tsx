import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScaleBar, pickScaleUnits } from '../ScaleBar';

describe('pickScaleUnits', () => {
    it('snaps to a 1/2/5 ladder', () => {
        // 90 target px at 1 inch per screen px would be 90 units -> snaps to 50.
        expect(pickScaleUnits(1).units).toBe(50);
        // 4 inches per px -> 360 units -> snaps to 200.
        expect(pickScaleUnits(4).units).toBe(200);
        // 0.02 inches per px -> 1.8 units -> snaps to 1.
        expect(pickScaleUnits(0.02).units).toBe(1);
    });

    it('reports the pixel width the chosen unit count occupies', () => {
        const { units, widthPx } = pickScaleUnits(1);
        expect(widthPx).toBeCloseTo(units / 1, 5);
    });

    it('never returns a zero or negative width', () => {
        expect(pickScaleUnits(0).widthPx).toBeGreaterThan(0);
        expect(pickScaleUnits(-3).widthPx).toBeGreaterThan(0);
    });
});

describe('ScaleBar', () => {
    it('labels the ruler in game units', () => {
        render(<ScaleBar pixelsPerInch={{ x: 1, y: 1 }} scale={1} />);
        expect(screen.getByText(/units$/)).toBeTruthy();
    });

    it('shows fewer units as the map zooms in', () => {
        const { unmount } = render(<ScaleBar pixelsPerInch={{ x: 1, y: 1 }} scale={1} />);
        const wide = screen.getByTestId('scale-bar').getAttribute('data-units');
        unmount();
        render(<ScaleBar pixelsPerInch={{ x: 1, y: 1 }} scale={16} />);
        const close = screen.getByTestId('scale-bar').getAttribute('data-units');
        expect(Number(close)).toBeLessThan(Number(wide));
    });
});
