import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GroundMarkerLayer } from '../GroundMarkerLayer';
import type { GroundMarkerPlacement } from '../../../../shared/movementData';

const marker = (over: Partial<GroundMarkerPlacement> = {}): GroundMarkerPlacement => ({
    name: 'arrow', icon: 'arrow.png', x: 10, y: 20, startMs: 1000, endMs: 5000, ...over,
});

const draw = (markers: GroundMarkerPlacement[], timeMs: number) =>
    render(<svg><GroundMarkerLayer markers={markers} timeMs={timeMs} scale={1} /></svg>).container;

describe('GroundMarkerLayer', () => {
    it('draws a marker inside its window', () => {
        expect(draw([marker()], 3000).querySelectorAll('image')).toHaveLength(1);
    });

    it('draws nothing before the marker is placed', () => {
        expect(draw([marker()], 500).querySelectorAll('image')).toHaveLength(0);
    });

    // Half-open window: the removal instant is the first frame WITHOUT it.
    it('stops drawing exactly at the removal time', () => {
        expect(draw([marker()], 4999).querySelectorAll('image')).toHaveLength(1);
        expect(draw([marker()], 5000).querySelectorAll('image')).toHaveLength(0);
    });

    it('keeps drawing a marker that was never removed', () => {
        // `endMs: null` is a real state, not a missing value — a commander who
        // drops a marker and leaves it produces exactly this.
        const m = marker({ endMs: null });
        expect(draw([m], 1000).querySelectorAll('image')).toHaveLength(1);
        expect(draw([m], 9_999_999).querySelectorAll('image')).toHaveLength(1);
    });

    it('falls back to a ring when the shape has no art', () => {
        const c = draw([marker({ icon: undefined })], 3000);
        expect(c.querySelectorAll('image')).toHaveLength(0);
        // The backing disc plus the fallback ring.
        expect(c.querySelectorAll('circle')).toHaveLength(2);
    });

    it('renders nothing at all when no marker is live, rather than an empty group', () => {
        expect(draw([marker()], 500).querySelector('.ground-marker-layer')).toBeNull();
        expect(draw([], 3000).querySelector('.ground-marker-layer')).toBeNull();
    });

    it('counter-scales so markers keep a constant on-screen size when zoomed', () => {
        const c = render(<svg><GroundMarkerLayer markers={[marker()]} timeMs={3000} scale={4} /></svg>).container;
        expect(c.querySelector('.ground-marker-layer g')?.getAttribute('transform')).toContain('scale(0.25)');
    });
});
