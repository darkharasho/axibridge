import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MapOutlineLayer } from '../MapOutlineLayer';

const SAMPLE = '<svg viewBox="0 0 100 50"><path d="M0 0 L10 10" fill="#000"/></svg>';

describe('MapOutlineLayer', () => {
    it('renders nothing when svg is undefined', () => {
        const { container } = render(
            <svg viewBox="0 0 716 750"><MapOutlineLayer svg={undefined} mapWidth={716} mapHeight={750} /></svg>
        );
        expect(container.querySelector('path')).toBeNull();
        expect(container.querySelector('image')).toBeNull();
    });

    it('inlines the outline as vectors (no rasterizing <image>) scaled to the map extent', () => {
        const { container } = render(
            <svg viewBox="0 0 200 100">
                <MapOutlineLayer svg={SAMPLE} mapWidth={200} mapHeight={100} opacity={0.7} />
            </svg>
        );
        // Vectors are inlined for crispness — there must be no rasterizing <image>.
        expect(container.querySelector('image')).toBeNull();
        const g = container.querySelector('g');
        expect(g).not.toBeNull();
        // viewBox 100x50 stretched to a 200x100 map => scale 2 2.
        expect(g?.getAttribute('transform')).toBe('translate(0 0) scale(2 2)');
        expect(g?.getAttribute('opacity')).toBe('0.7');
        expect(container.querySelector('path')).not.toBeNull();
    });

    it('defaults opacity to 0.7 and applies offsetX/offsetY in the transform', () => {
        const { container } = render(
            <svg viewBox="0 0 100 50">
                <MapOutlineLayer svg={SAMPLE} mapWidth={100} mapHeight={50} offsetX={-14} offsetY={20} />
            </svg>
        );
        const g = container.querySelector('g');
        expect(g?.getAttribute('transform')).toBe('translate(-14 20) scale(1 1)');
        expect(g?.getAttribute('opacity')).toBe('0.7');
    });
});
