import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { LayersPanel } from '../LayersPopover';
import { useStatsStore } from '../../statsStore';

function Wrapper() {
    const [open, setOpen] = useState(false);
    return <LayersPanel open={open} onToggle={() => setOpen((v: boolean) => !v)} />;
}

describe('LayersPanel', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);
    });

    it('is closed by default and opens on toggle', () => {
        render(<Wrapper />);
        expect(screen.queryByLabelText(/centroid/i)).toBeNull();
        fireEvent.click(screen.getByTitle(/show layers/i));
        expect(screen.getByLabelText(/centroid/i)).toBeTruthy();
    });

    it('toggling a checkbox updates replayLayers', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        fireEvent.click(screen.getByLabelText(/centroid/i));
        expect(useStatsStore.getState().replayLayers.centroidSpread).toBe(true);
    });

    it('heatmap radio switches mode', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        fireEvent.click(screen.getByLabelText(/deaths/i));
        expect(useStatsStore.getState().replayLayers.heatmap).toBe('deaths');
    });

    it('renders the Zone borders toggle checked by default and toggles the store', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        const checkbox = screen.getByRole('checkbox', { name: /zone borders/i });
        expect((checkbox as HTMLInputElement).checked).toBe(true);
        fireEvent.click(checkbox);
        expect(useStatsStore.getState().replayLayers.zoneBorders).toBe(false);
    });

    it('renders the CC lane toggle checked by default and toggling it off removes the lane', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        const checkbox = screen.getByRole('checkbox', { name: /cc lane/i });
        expect((checkbox as HTMLInputElement).checked).toBe(true);
        fireEvent.click(checkbox);
        expect(useStatsStore.getState().replayLayers.ccLane).toBe(false);
    });

    it('renders the Strip lane toggle checked by default and toggling it off removes the lane', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        const checkbox = screen.getByRole('checkbox', { name: /strip lane/i });
        expect((checkbox as HTMLInputElement).checked).toBe(true);
        fireEvent.click(checkbox);
        expect(useStatsStore.getState().replayLayers.stripLane).toBe(false);
    });

    it('renders the Scale bar toggle checked by default and toggles the store', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        const checkbox = screen.getByRole('checkbox', { name: /scale bar/i });
        expect((checkbox as HTMLInputElement).checked).toBe(true);
        fireEvent.click(checkbox);
        expect(useStatsStore.getState().replayLayers.scaleBar).toBe(false);
    });

    it('no longer renders the inline phase legend', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        fireEvent.click(screen.getByRole('checkbox', { name: /fight phases/i }));
        expect(screen.queryByText(/first ~10 s, no deaths yet/i)).toBeNull();
    });

    it('no longer renders the inline lane legend', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        expect(screen.queryByText(/scaled to its own peak/i)).toBeNull();
    });

    it('colour-codes the CC lane chip amber and the strip chip fuchsia', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        const cc = screen.getByRole('checkbox', { name: /cc lane/i }).closest('label')!;
        const strip = screen.getByRole('checkbox', { name: /strip lane/i }).closest('label')!;
        expect(cc.getAttribute('data-accent')).toBe('cc');
        expect(strip.getAttribute('data-accent')).toBe('strip');
    });

    it('is 216px wide when open', () => {
        const { container } = render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        const panel = container.querySelector('[data-layers-panel]') as HTMLElement;
        expect(panel.style.width).toBe('216px');
    });

    it('has a non-empty background so it reads opaque over the map', () => {
        const { container } = render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        const panel = container.querySelector('[data-layers-panel]') as HTMLElement;
        expect(panel.style.background).not.toBe('');
    });
});
