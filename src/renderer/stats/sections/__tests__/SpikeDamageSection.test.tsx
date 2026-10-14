import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpikeDamageSection } from '../SpikeDamageSection';

vi.mock('../../StatsViewContext', () => ({
    useStatsSharedContext: () => ({
        expandedSection: null,
        expandedSectionClosing: false,
        openExpandedSection: () => {},
        closeExpandedSection: () => {},
        renderProfessionIcon: () => null,
        formatWithCommas: (value: number) => value.toLocaleString('en-US'),
    }),
}));

const player = {
    key: 'tysun', account: 'Tysun.5092', displayName: 'Tysun.5092', characterName: 'Tysun',
    profession: 'Berserker', professionList: ['Berserker'], logs: 1,
    peakHit: 22487, peak1s: 30000, peak5s: 60000, peak30s: 90000,
    peakHitDown: 4000, peak1sDown: 0, peak5sDown: 0, peak30sDown: 0,
    peakFightLabel: 'Green BL: Sunnyhill (2:41)', peakSkillName: 'Fierce Blow',
};

const renderSection = (overrides: Record<string, unknown> = {}) => render(
    <SpikeDamageSection
        {...({
            spikePlayerFilter: '', setSpikePlayerFilter: () => {},
            groupedSpikePlayers: [{ profession: 'Berserker', players: [player] }],
            spikeMode: 'hit', setSpikeMode: () => {},
            selectedSpikePlayerKey: 'tysun', setSelectedSpikePlayerKey: () => {},
            selectedSpikePlayer: player,
            spikeChartData: [], spikeChartMaxY: 0,
            selectedSpikeFightIndex: null, setSelectedSpikeFightIndex: () => {},
            spikeDrilldownTitle: '', spikeDrilldownData: [],
            spikeDrilldownDownIndices: [], spikeDrilldownDeathIndices: [],
            spikeFightSkillRows: [],
            ...overrides,
        } as any)}
    />,
);

describe('SpikeDamageSection peak skill', () => {
    it('names the skill behind the highest hit', () => {
        renderSection();
        expect(screen.getByText('· Fierce Blow')).toBeTruthy();
    });

    it('omits the skill for burst windows and down contribution', () => {
        const { unmount } = renderSection({ spikeMode: '5s' });
        expect(screen.queryByText('· Fierce Blow')).toBeNull();
        unmount();
        renderSection({ damageBasis: 'downContribution' });
        expect(screen.queryByText('· Fierce Blow')).toBeNull();
    });
});
