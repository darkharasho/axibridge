import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MapOutlineLayer } from '../MapOutlineLayer';

describe('MapOutlineLayer', () => {
    it('renders nothing when outlineUrl is undefined', () => {
        const { container } = render(
            <svg viewBox="0 0 716 750"><MapOutlineLayer outlineUrl={undefined} mapWidth={716} mapHeight={750} /></svg>
        );
        expect(container.querySelector('image')).toBeNull();
    });

    it('renders a full-extent image when an outline URL is provided', () => {
        const { container } = render(
            <svg viewBox="0 0 716 750">
                <MapOutlineLayer outlineUrl="data:image/svg+xml;base64,AAAA" mapWidth={716} mapHeight={750} opacity={0.7} />
            </svg>
        );
        const img = container.querySelector('image');
        expect(img).not.toBeNull();
        expect(img?.getAttribute('href')).toBe('data:image/svg+xml;base64,AAAA');
        expect(img?.getAttribute('width')).toBe('716');
        expect(img?.getAttribute('height')).toBe('750');
        expect(img?.getAttribute('preserveAspectRatio')).toBe('none');
        expect(img?.getAttribute('opacity')).toBe('0.7');
    });
});
