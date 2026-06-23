import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OffenseSection } from '../OffenseSection';
import { StatsSharedContext } from '../../StatsViewContext';

const makeOffensePlayer = (account: string, damage: number) => ({
    account,
    profession: 'Guardian',
    professionList: ['Guardian'],
    totalFightMs: 120000,
    offenseTotals: { damage },
    offenseRateWeights: {},
});

const ctx: any = {
    stats: {
        offensePlayers: [
            makeOffensePlayer('Alpha.1234', 50000),
            makeOffensePlayer('Beta.5678', 40000),
            makeOffensePlayer('Gamma.9012', 60000),
            makeOffensePlayer('Delta.3456', 30000),
        ],
    },
    expandedSection: null,
    expandedSectionClosing: false,
    openExpandedSection: () => {},
    closeExpandedSection: () => {},
    isSectionVisible: () => true,
    isFirstVisibleSection: () => false,
    sectionClass: (_id: string, base: string) => base,
    sidebarListClass: '',
    formatWithCommas: (n: number, d: number) => n.toFixed(d),
    renderProfessionIcon: () => null,
    roundCountStats: false,
    expandedPortalRef: { current: null },
};

describe('OffenseSection — No Ego', () => {
    it('renders metric distribution cards and expander button', () => {
        render(
            <StatsSharedContext.Provider value={ctx}>
                <OffenseSection
                    offenseSearch=""
                    setOffenseSearch={() => {}}
                    activeOffenseStat="damage"
                    setActiveOffenseStat={() => {}}
                    offenseViewMode="total"
                    setOffenseViewMode={() => {}}
                    noEgoMode
                />
            </StatsSharedContext.Provider>,
        );
        // At least one distribution card present
        expect(screen.getAllByTestId('metric-card-mean').length).toBeGreaterThan(0);
        // Full grid collapsed behind an expander
        expect(
            screen.getByRole('button', { name: /per-player detail|show detail|detailed/i }),
        ).toBeInTheDocument();
    });
});
