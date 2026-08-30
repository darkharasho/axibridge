import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { SectorOutlineLayer } from '../SectorOutlineLayer';
import { WvwMap } from '../../../../shared/wvwLandmarks';
import { WVW_SECTORS } from '../../../../shared/wvwSectors';

const renderLayer = (props: Partial<React.ComponentProps<typeof SectorOutlineLayer>> = {}) =>
    render(
        <svg>
            <SectorOutlineLayer
                mapKey={WvwMap.GreenBorderlands}
                mapWidth={523}
                mapHeight={750}
                scale={2}
                {...props}
            />
        </svg>,
    );

describe('SectorOutlineLayer', () => {
    it('renders one clipped polygon per sector', () => {
        const { container } = renderLayer();
        const polys = container.querySelectorAll('polygon[data-sector-id]');
        expect(polys.length).toBe(WVW_SECTORS[WvwMap.GreenBorderlands].length);
        expect(container.querySelectorAll('clipPath').length).toBe(polys.length);
        polys.forEach(p => expect(p.getAttribute('clip-path')).toMatch(/^url\(#/));
    });

    it('uses neutral slate stroke when no owners are known', () => {
        const { container } = renderLayer();
        const poly = container.querySelector('polygon[data-sector-id="999"]');
        expect(poly?.getAttribute('stroke')).toBe('rgba(148,163,184,0.55)');
    });

    it('colours owned sectors by team and leaves others neutral', () => {
        const { container } = renderLayer({ sectorOwners: { 999: 'Red' } });
        expect(container.querySelector('polygon[data-sector-id="999"]')?.getAttribute('stroke')).toBe('#ef4444');
        const other = Array.from(container.querySelectorAll('polygon[data-sector-id]'))
            .find(p => p.getAttribute('data-sector-id') !== '999');
        expect(other?.getAttribute('stroke')).toBe('rgba(148,163,184,0.55)');
    });

    it('treats Neutral owner like unknown', () => {
        const { container } = renderLayer({ sectorOwners: { 999: 'Neutral' } });
        expect(container.querySelector('polygon[data-sector-id="999"]')?.getAttribute('stroke')).toBe('rgba(148,163,184,0.55)');
    });

    it('scales polygon points when the fight map size differs from the reference', () => {
        const base = renderLayer().container.querySelector('polygon[data-sector-id="999"]')!.getAttribute('points')!;
        const doubled = renderLayer({ mapWidth: 1046, mapHeight: 1500 }).container
            .querySelector('polygon[data-sector-id="999"]')!.getAttribute('points')!;
        const first = (s: string) => s.split(' ')[0].split(',').map(Number);
        expect(first(doubled)[0]).toBeCloseTo(first(base)[0] * 2, 1);
        expect(first(doubled)[1]).toBeCloseTo(first(base)[1] * 2, 1);
    });

    it('keeps stroke width at ~1.6 screen px regardless of zoom (2× width, clipped)', () => {
        const { container } = renderLayer({ scale: 4 });
        const poly = container.querySelector('polygon[data-sector-id="999"]');
        expect(Number(poly?.getAttribute('stroke-width'))).toBeCloseTo(3.2 / 4, 5);
    });
});
