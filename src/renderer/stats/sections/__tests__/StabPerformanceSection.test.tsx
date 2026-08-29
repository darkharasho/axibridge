import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StabPerformanceSection } from '../StabPerformanceSection';

vi.mock('../../StatsViewContext', () => ({
    useStatsSharedContext: () => ({
        formatWithCommas: (n: number, d?: number) => Number(n).toFixed(d ?? 0),
        renderProfessionIcon: () => null,
        expandedSection: null,
        expandedSectionClosing: false,
        openExpandedSection: () => {},
        closeExpandedSection: () => {},
    }),
}));

// Mirrors the prop set StatsView.tsx passes to StabPerformanceSection at its
// stab-perf call site (both the modern and classic layouts pass the same
// shape). Only `heatmapOverlay` is varied across the three tests.
const player = {
    key: 'p1', account: 'A.1', displayName: 'A', profession: 'Guardian',
    professionList: ['Guardian'], logs: 3, total: 1000,
};
const point = {
    index: 0, fightId: 'f0', shortLabel: 'F1', fullLabel: 'Fight One', timestamp: 0,
    total: 1000, maxTotal: 2000,
};
const drilldownData = [
    { label: '0s-5s', value: 10, incomingDamage: 100, incomingIntensity: 0.5, stripsTaken: 3, stripsTakenIntensity: 0.75 },
    { label: '5s-10s', value: 20, incomingDamage: 0, incomingIntensity: 0, stripsTaken: 0, stripsTakenIntensity: 0 },
];

const props = (overlay: 'none' | 'incoming-damage' | 'strips-taken') => ({
    playerFilter: '', setPlayerFilter: () => {},
    players: [player],
    selectedPlayerKey: 'p1', setSelectedPlayerKey: () => {},
    selectedPlayer: player,
    chartData: [point], chartMaxY: 2000,
    selectedFightIndex: 0, setSelectedFightIndex: () => {},
    drilldownTitle: 'Fight Breakdown',
    drilldownData,
    partyMembers: [],
    heatmapOverlay: overlay,
    setHeatmapOverlay: () => {},
    stripsTakenRecorded: true,
    showPartyDeaths: false, setShowPartyDeaths: () => {},
    showPartyDistance: false, setShowPartyDistance: () => {},
} as any);

describe('StabPerformanceSection heatmap overlay', () => {
    it('tints cells from incoming damage in incoming-damage mode', () => {
        const { container } = render(<StabPerformanceSection {...props('incoming-damage')} />);
        expect(container.querySelector('[data-overlay="incoming-damage"]')).not.toBeNull();
    });

    it('tints cells from strips taken in strips-taken mode', () => {
        const { container } = render(<StabPerformanceSection {...props('strips-taken')} />);
        expect(container.querySelector('[data-overlay="strips-taken"]')).not.toBeNull();
    });

    it('renders no overlay in none mode', () => {
        const { container } = render(<StabPerformanceSection {...props('none')} />);
        expect(container.querySelector('[data-overlay]')).toBeNull();
    });

    it('surfaces absent strip data instead of a zero-intensity heatmap when the fight was not recorded', () => {
        const { container, getByText } = render(
            <StabPerformanceSection {...props('strips-taken')} stripsTakenRecorded={false} />
        );
        // "Absent is not zero": a pre-1.8.0 (or replay-array-off) fight must
        // say so, not silently render a tint-free grid that reads as "no
        // strips happened".
        expect(getByText(/not recorded for this fight/i)).toBeInTheDocument();
        // The chart (and therefore any strips-taken heat bar/cell) must not
        // render at all in the absent-data branch.
        const overlayWrapper = container.querySelector('[data-overlay="strips-taken"]');
        expect(overlayWrapper).not.toBeNull();
        expect(overlayWrapper!.querySelector('.recharts-responsive-container')).toBeNull();
    });

    it('renders the strips-taken overlay normally (zero intensity, no message) when recorded but all-zero', () => {
        const zeroData = drilldownData.map((entry) => ({ ...entry, stripsTaken: 0, stripsTakenIntensity: 0 }));
        const { container, queryByText } = render(
            <StabPerformanceSection {...props('strips-taken')} drilldownData={zeroData} stripsTakenRecorded />
        );
        expect(queryByText(/not recorded for this fight/i)).toBeNull();
        expect(container.querySelector('[data-overlay="strips-taken"]')).not.toBeNull();
    });
});

describe('StabPerformanceSection overlay toggles', () => {
    it('selects the clicked overlay directly, without cycling through the other', () => {
        const setHeatmapOverlay = vi.fn();
        render(<StabPerformanceSection {...props('none')} setHeatmapOverlay={setHeatmapOverlay} />);
        fireEvent.click(screen.getByRole('button', { name: /strips taken/i }));
        expect(setHeatmapOverlay).toHaveBeenCalledWith('strips-taken');
    });

    it('turns the active overlay off when its own button is clicked again', () => {
        const setHeatmapOverlay = vi.fn();
        render(<StabPerformanceSection {...props('incoming-damage')} setHeatmapOverlay={setHeatmapOverlay} />);
        fireEvent.click(screen.getByRole('button', { name: /party damage/i }));
        expect(setHeatmapOverlay).toHaveBeenCalledWith('none');
    });

    // Both overlay names stay on screen whatever the current mode is, so the
    // reader can see that strips-taken exists without clicking to find out.
    it('shows both overlay names at once, and marks which is active', () => {
        render(<StabPerformanceSection {...props('strips-taken')} />);
        expect(screen.getByRole('button', { name: /party damage/i })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: /strips taken/i })).toHaveAttribute('aria-pressed', 'true');
    });
});
