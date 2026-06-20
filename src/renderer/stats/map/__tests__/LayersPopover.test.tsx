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
});

describe('LayersPanel — outline section', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('renders the four outline options and selects standard by default', () => {
        render(<LayersPanel open onToggle={() => {}} />);
        expect(screen.getByLabelText('Off', { selector: 'input[name="replay-outline"]' })).toBeTruthy();
        const standard = screen.getByLabelText('Standard', { selector: 'input[name="replay-outline"]' }) as HTMLInputElement;
        expect(standard.checked).toBe(true);
    });

    it('switching to High detail updates the store', () => {
        render(<LayersPanel open onToggle={() => {}} />);
        fireEvent.click(screen.getByLabelText('High detail', { selector: 'input[name="replay-outline"]' }));
        expect(useStatsStore.getState().replayLayers.outline).toBe('high');
    });
});
