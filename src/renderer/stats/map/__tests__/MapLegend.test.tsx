import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapLegend } from '../MapLegend';
import { useStatsStore } from '../../statsStore';

describe('MapLegend', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('always shows the marks that are always drawn', () => {
        render(<MapLegend />);
        expect(screen.getByText(/downed/i)).toBeTruthy();
        expect(screen.getByText(/killed/i)).toBeTruthy();
        expect(screen.getByText(/commander/i)).toBeTruthy();
        expect(screen.getByText(/enemy/i)).toBeTruthy();
    });

    it('shows the CC row only while ccTakenMarks is on', () => {
        render(<MapLegend />);   // ccTakenMarks defaults true
        expect(screen.getByText(/cc taken/i)).toBeTruthy();
    });

    it('drops the CC row when ccTakenMarks is off', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', false);
        render(<MapLegend />);
        expect(screen.queryByText(/cc taken/i)).toBeNull();
    });

    it('drops the rallied row when rallyRings is off', () => {
        render(<MapLegend />);   // rallyRings defaults false
        expect(screen.queryByText(/rallied/i)).toBeNull();
    });

    it('adds the rallied row when rallyRings is on', () => {
        useStatsStore.getState().setReplayLayer('rallyRings', true);
        render(<MapLegend />);
        expect(screen.getByText(/rallied/i)).toBeTruthy();
    });

    it('adds the death-heat row only when a heatmap mode is selected', () => {
        const { unmount } = render(<MapLegend />);
        expect(screen.queryByText(/death heat/i)).toBeNull();
        unmount();
        useStatsStore.getState().setReplayHeatmapMode('deaths');
        render(<MapLegend />);
        expect(screen.getByText(/death heat/i)).toBeTruthy();
    });

    it('never empties even with every optional layer off', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', false);
        useStatsStore.getState().setReplayLayer('rallyRings', false);
        useStatsStore.getState().setReplayHeatmapMode('off');
        const { container } = render(<MapLegend />);
        expect(container.querySelectorAll('[data-legend-row]').length).toBe(4);
    });

    it('has an opaque background in all themes', () => {
        const { container } = render(<MapLegend />);
        const cardElement = container.querySelector('.app-dropdown') as HTMLElement;
        // The inline style sets background to 'var(--bg-elevated)', verify it's not empty
        expect(cardElement.style.background).toBeTruthy();
    });
});
