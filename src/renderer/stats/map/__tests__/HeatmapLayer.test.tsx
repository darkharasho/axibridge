import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HeatmapLayer } from '../HeatmapLayer';
import type { HeatmapRaster } from '../hooks/useHeatmapData';

const raster: HeatmapRaster = {
    buffer: new Float32Array(128 * 128).fill(0),
    size: [128, 128],
    max: 1,
};
raster.buffer[0] = 1;

describe('HeatmapLayer', () => {
    it('renders nothing when raster is null', () => {
        const { container } = render(
            <svg viewBox="0 0 600 600"><HeatmapLayer raster={null} mapWidth={600} mapHeight={600} mode="off" /></svg>
        );
        expect(container.querySelector('foreignObject')).toBeNull();
    });

    it('renders a foreignObject canvas when raster is present', () => {
        const { container } = render(
            <svg viewBox="0 0 600 600"><HeatmapLayer raster={raster} mapWidth={600} mapHeight={600} mode="deaths" /></svg>
        );
        const fo = container.querySelector('foreignObject');
        expect(fo).not.toBeNull();
        expect(fo?.querySelector('canvas')).not.toBeNull();
    });
});
