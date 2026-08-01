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
});
