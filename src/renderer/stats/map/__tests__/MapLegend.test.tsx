import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapLegend } from '../MapLegend';
import { useStatsStore } from '../../statsStore';

describe('MapLegend', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('always shows the marks that are always drawn', () => {
        render(<MapLegend />);
        expect(screen.getByText(/downed/i)).toBeTruthy();
        expect(screen.getByText(/^death$/i)).toBeTruthy();
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

    it('explains each CC colour the map can draw', () => {
        render(<MapLegend />);   // ccTakenMarks defaults true
        expect(screen.getByText(/displaced/i)).toBeTruthy();
        expect(screen.getByText(/feared/i)).toBeTruthy();
    });

    it('drops every CC row together when ccTakenMarks is off', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', false);
        const { container } = render(<MapLegend />);
        expect(container.querySelectorAll('[data-legend-row^="cc"]').length).toBe(0);
    });

    /** Each row's swatch must be the colour EventOverlay actually strokes,
     *  or the legend teaches the wrong thing — which it has done before. */
    it('draws each CC swatch in the colour the overlay uses', () => {
        const { container } = render(<MapLegend />);
        const strokeOf = (key: string) =>
            container.querySelector(`[data-legend-row="${key}"] circle`)!.getAttribute('stroke');
        expect(strokeOf('cc')).toBe('#f59e0b');
        expect(strokeOf('cc-displacement')).toBe('#22d3ee');
        expect(strokeOf('cc-fear')).toBe('#ec4899');
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

    it('takes the float surface so it is opaque in all themes', () => {
    // Still the same requirement - a translucent pane over a moving map is
    // unreadable on a platform where the blur is a no-op - but the fill arrives
    // from --axi-surface-float via the upstream class now, not from an inline
    // literal. jsdom computes no stylesheet, so the class is what there is to
    // assert; asserting on style.background would be pinning the reskin this
    // migration removed.
        const { container } = render(<MapLegend />);
        const cardElement = container.querySelector('.app-dropdown') as HTMLElement;
        expect(cardElement.className).toContain('axi-panel--float');
    });

    // Expanded by default: the legend is what the marks mean, which a reader
    // needs before they need anything else.
    it('starts expanded', () => {
        const { container } = render(<MapLegend />);
        expect(container.querySelectorAll('[data-legend-row]').length).toBeGreaterThan(0);
    });

    it('collapses to the header strip and back', () => {
        const { container } = render(<MapLegend />);
        fireEvent.click(screen.getByTestId('legend-toggle'));
        expect(container.querySelectorAll('[data-legend-row]').length).toBe(0);
        // The one word that says what the panel is has to survive the collapse,
        // or the strip is an unlabelled button floating over the map.
        expect(screen.getByText(/on the map/i)).toBeTruthy();
        fireEvent.click(screen.getByTestId('legend-toggle'));
        expect(container.querySelectorAll('[data-legend-row]').length).toBeGreaterThan(0);
    });
});
