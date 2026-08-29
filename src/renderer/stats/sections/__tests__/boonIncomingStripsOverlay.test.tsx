import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoonUptimeSection } from '../BoonUptimeSection';
import { BoonTimelineSection } from '../BoonTimelineSection';
import { nextBoonHeatmapOverlay, boonHeatmapAlpha } from '../boonHeatmapOverlay';

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

const player = {
    key: 'p1', account: 'A.1', displayName: 'A', profession: 'Guardian',
    professionList: ['Guardian'], logs: 3, total: 10, peak: 5, uptimePercent: 50,
    value: 1000, stability: 50, average: 5,
};
const point = {
    index: 0, fightId: 'f0', shortLabel: 'F1', fullLabel: 'Fight One', timestamp: 0,
    durationMs: 1000, total: 10, peak: 5, uptimePercent: 50, average: 3,
    maxUptimePercent: 100, maxTotal: 20, value: 1000,
};

const props = (overrides: Record<string, unknown> = {}) => ({
    boonSearch: '', setBoonSearch: () => {},
    boons: [{ id: 'b1', name: 'Might' }],
    activeBoonId: 'b1', setActiveBoonId: () => {},
    playerFilter: '', setPlayerFilter: () => {},
    players: [player], selectedPlayerKey: 'p1', setSelectedPlayerKey: () => {},
    selectedPlayer: player,
    chartData: [point], chartMaxY: 100,
    selectedFightIndex: 0, setSelectedFightIndex: () => {},
    drilldownTitle: 'Fight Breakdown',
    drilldownData: [
        { label: '0s-5s', value: 5, incomingDamage: 100, incomingIntensity: 0.5, incomingStrips: 4, incomingStripsIntensity: 1 },
        { label: '5s-10s', value: 3, incomingDamage: 0, incomingIntensity: 0, incomingStrips: 0, incomingStripsIntensity: 0 },
    ],
    overallUptimePercent: 50,
    timelineScope: 'squad', setTimelineScope: () => {},
    heatmapOverlay: 'none', setHeatmapOverlay: () => {},
    incomingStripsRecorded: true,
    showPartyDeaths: false, setShowPartyDeaths: () => {},
    showPartyDistance: false, setShowPartyDistance: () => {},
    partyMembers: [],
    ...overrides,
}) as any;

describe('nextBoonHeatmapOverlay', () => {
    it('cycles none -> incoming damage -> incoming strips -> none', () => {
        expect(nextBoonHeatmapOverlay('none')).toBe('incoming-damage');
        expect(nextBoonHeatmapOverlay('incoming-damage')).toBe('incoming-strips');
        expect(nextBoonHeatmapOverlay('incoming-strips')).toBe('none');
    });

    // A bucket with any activity must stay visibly distinct from an empty one,
    // which a bare linear ramp loses at the bottom of the range.
    it('keeps a floor so a low-intensity bucket is still visible', () => {
        expect(boonHeatmapAlpha(0)).toBeGreaterThan(0);
        expect(boonHeatmapAlpha(0)).toBeLessThan(boonHeatmapAlpha(0.01));
        expect(boonHeatmapAlpha(1)).toBeLessThanOrEqual(1);
        expect(boonHeatmapAlpha(5)).toBe(boonHeatmapAlpha(1));
    });
});

describe.each([
    ['Boon Uptime', BoonUptimeSection],
    ['Boon Timeline', BoonTimelineSection],
])('%s incoming-strips overlay', (_name, Section: any) => {
    it('advances the overlay mode when the toggle is clicked', () => {
        const setHeatmapOverlay = vi.fn();
        render(<Section {...props({ heatmapOverlay: 'incoming-damage', setHeatmapOverlay })} />);
        fireEvent.click(screen.getByRole('button', { name: /incoming damage/i }));
        expect(setHeatmapOverlay).toHaveBeenCalledWith('incoming-strips');
    });

    it('labels the toggle for the mode it will show next', () => {
        render(<Section {...props({ heatmapOverlay: 'incoming-strips' })} />);
        expect(screen.getByRole('button', { name: /incoming strips/i })).toBeInTheDocument();
    });

    // Absent is not zero: a log parsed before axilog 1.8.0 has no strips
    // series at all, and drawing that as an empty band would read as
    // "nobody was stripped this fight".
    it('says the series was not recorded instead of drawing an empty band', () => {
        render(<Section {...props({ heatmapOverlay: 'incoming-strips', incomingStripsRecorded: false })} />);
        expect(screen.getByText(/predates axilog 1\.8\.0/i)).toBeInTheDocument();
    });

    it('draws the chart normally for the damage overlay even when strips are absent', () => {
        render(<Section {...props({ heatmapOverlay: 'incoming-damage', incomingStripsRecorded: false })} />);
        expect(screen.queryByText(/predates axilog 1\.8\.0/i)).not.toBeInTheDocument();
    });
});
