import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoonUptimeSection } from '../BoonUptimeSection';
import { BoonTimelineSection } from '../BoonTimelineSection';
import { toggleBoonHeatmapOverlay, boonHeatmapAlpha } from '../boonHeatmapOverlay';

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
        { label: '0s-5s', value: 5, incomingDamage: 100, incomingIntensity: 0.5, incomingStrips: 4, incomingStripsIntensity: 1, incomingCc: 7, incomingCcIntensity: 1 },
        { label: '5s-10s', value: 3, incomingDamage: 0, incomingIntensity: 0, incomingStrips: 0, incomingStripsIntensity: 0, incomingCc: 0, incomingCcIntensity: 0 },
    ],
    overallUptimePercent: 50,
    timelineScope: 'squad', setTimelineScope: () => {},
    heatmapOverlay: 'none', setHeatmapOverlay: () => {},
    incomingStripsRecorded: true,
    incomingCcRecorded: true,
    showPartyDeaths: false, setShowPartyDeaths: () => {},
    showPartyDistance: false, setShowPartyDistance: () => {},
    partyMembers: [],
    ...overrides,
}) as any;

describe('toggleBoonHeatmapOverlay', () => {
    it('turns a mode on from off, and off again when it is already showing', () => {
        expect(toggleBoonHeatmapOverlay('none', 'incoming-damage')).toBe('incoming-damage');
        expect(toggleBoonHeatmapOverlay('incoming-damage', 'incoming-damage')).toBe('none');
        expect(toggleBoonHeatmapOverlay('none', 'incoming-strips')).toBe('incoming-strips');
        expect(toggleBoonHeatmapOverlay('incoming-strips', 'incoming-strips')).toBe('none');
        expect(toggleBoonHeatmapOverlay('none', 'incoming-cc')).toBe('incoming-cc');
        expect(toggleBoonHeatmapOverlay('incoming-cc', 'incoming-cc')).toBe('none');
    });

    // Both overlays paint the same band behind the same line, so picking one
    // must replace the other rather than requiring two clicks to swap.
    it('replaces the other mode instead of cycling through it', () => {
        expect(toggleBoonHeatmapOverlay('incoming-damage', 'incoming-strips')).toBe('incoming-strips');
        expect(toggleBoonHeatmapOverlay('incoming-strips', 'incoming-damage')).toBe('incoming-damage');
        expect(toggleBoonHeatmapOverlay('incoming-damage', 'incoming-cc')).toBe('incoming-cc');
        expect(toggleBoonHeatmapOverlay('incoming-cc', 'incoming-strips')).toBe('incoming-strips');
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
    it('selects the clicked overlay directly, without cycling through the other', () => {
        const setHeatmapOverlay = vi.fn();
        render(<Section {...props({ heatmapOverlay: 'none', setHeatmapOverlay })} />);
        fireEvent.click(screen.getByRole('button', { name: /incoming strips/i }));
        expect(setHeatmapOverlay).toHaveBeenCalledWith('incoming-strips');
    });

    it('turns the active overlay off when its own button is clicked again', () => {
        const setHeatmapOverlay = vi.fn();
        render(<Section {...props({ heatmapOverlay: 'incoming-damage', setHeatmapOverlay })} />);
        fireEvent.click(screen.getByRole('button', { name: /incoming damage/i }));
        expect(setHeatmapOverlay).toHaveBeenCalledWith('none');
    });

    // The point of two buttons over one cycling button: both overlays are
    // named on screen whatever the current mode is, so the reader can see
    // that strips exist without clicking to find out.
    it('shows every overlay name at once, and marks which is active', () => {
        render(<Section {...props({ heatmapOverlay: 'incoming-strips' })} />);
        expect(screen.getByRole('button', { name: /incoming damage/i })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: /incoming strips/i })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: /incoming cc/i })).toHaveAttribute('aria-pressed', 'false');
    });

    it('selects the incoming-CC overlay directly from any other mode', () => {
        const setHeatmapOverlay = vi.fn();
        render(<Section {...props({ heatmapOverlay: 'incoming-strips', setHeatmapOverlay })} />);
        fireEvent.click(screen.getByRole('button', { name: /incoming cc/i }));
        expect(setHeatmapOverlay).toHaveBeenCalledWith('incoming-cc');
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

describe.each([
    ['Boon Uptime', BoonUptimeSection],
    ['Boon Timeline', BoonTimelineSection],
])('%s incoming-CC overlay absence', (_name, Section: any) => {
    // The whole reason incoming CC has its own recorded flag: `cc_taken`
    // shipped in axilog 1.9.0, so a log parsed by 1.8.x has strips and no CC.
    // The message must name 1.9.0, or it sends the reader off to re-parse
    // logs that were never going to carry the lane.
    it('names the 1.9.0 floor when the CC lane is absent', () => {
        render(<Section {...props({ heatmapOverlay: 'incoming-cc', incomingCcRecorded: false })} />);
        expect(screen.getByText(/predates axilog 1\.9\.0/i)).toBeInTheDocument();
    });

    it('still draws the strips overlay on a fight that recorded strips but no CC', () => {
        render(<Section {...props({
            heatmapOverlay: 'incoming-strips', incomingStripsRecorded: true, incomingCcRecorded: false,
        })} />);
        expect(screen.queryByText(/predates axilog/i)).not.toBeInTheDocument();
    });

    it('names the 1.8.0 floor when the strips lane is the absent one', () => {
        render(<Section {...props({ heatmapOverlay: 'incoming-strips', incomingStripsRecorded: false })} />);
        expect(screen.getByText(/predates axilog 1\.8\.0/i)).toBeInTheDocument();
    });
});
