import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BoonUptimeSection } from '../BoonUptimeSection';
import { BoonTimelineSection } from '../BoonTimelineSection';
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

const DRILLDOWN_TITLE = 'Drilldown Control Row Marker';

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
const drilldownData = [{ name: 'A', value: 5, incomingDamage: 100, incomingIntensity: 0.5 }];

const shared = {
    boonSearch: '', setBoonSearch: () => {},
    boons: [{ id: 'b1', name: 'Might' }],
    activeBoonId: 'b1', setActiveBoonId: () => {},
    playerFilter: '', setPlayerFilter: () => {},
    players: [player], selectedPlayerKey: 'p1', setSelectedPlayerKey: () => {},
    selectedPlayer: player,
    chartData: [point], chartMaxY: 100,
    selectedFightIndex: 0, setSelectedFightIndex: () => {},
    drilldownTitle: DRILLDOWN_TITLE,
    drilldownData,
    overallUptimePercent: 50,
    timelineScope: 'squad', setTimelineScope: () => {},
    // All three sections take an overlay mode. The member sets differ
    // (StabPerformance is party-scoped, the boon sections squad-scoped), but
    // 'none' is valid in both, so one prop serves this placement test.
    heatmapOverlay: 'none' as const, setHeatmapOverlay: () => {},
    showPartyDeaths: false, setShowPartyDeaths: () => {},
    showPartyDistance: false, setShowPartyDistance: () => {},
    partyMembers: [],
} as any;

/** The drilldown control row is the flex row holding the drilldown title and the Clear button. */
const drilldownControlRow = () => screen.getByText(DRILLDOWN_TITLE).parentElement as HTMLElement;

describe('drilldown toggles live in the drilldown control row, not the card header', () => {
    it('Boon Uptime: the heatmap overlay toggle sits beside Clear', () => {
        render(<BoonUptimeSection {...shared} />);
        const row = drilldownControlRow();
        expect(within(row).getByRole('button', { name: /clear/i })).toBeInTheDocument();
        expect(within(row).getByRole('button', { name: /incoming damage/i })).toBeInTheDocument();
    });

    it('Boon Timeline: the heatmap overlay toggle sits beside Clear', () => {
        render(<BoonTimelineSection {...shared} />);
        const row = drilldownControlRow();
        expect(within(row).getByRole('button', { name: /incoming damage/i })).toBeInTheDocument();
    });

    it('Stab Performance: party overlay toggles sit beside Clear', () => {
        render(<StabPerformanceSection {...shared} />);
        const row = drilldownControlRow();
        expect(within(row).getByRole('button', { name: /party damage/i })).toBeInTheDocument();
        expect(within(row).getByRole('button', { name: /^deaths$/i })).toBeInTheDocument();
        expect(within(row).getByRole('button', { name: /^distance$/i })).toBeInTheDocument();
    });
});
