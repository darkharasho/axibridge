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

// Role-aware fixture: 10 damage players tightly clustered at high damage,
// and 3 support players tightly clustered at very low damage.
// Without roleAware: squad stdDev is moderate; supports at ~100 are well below
// mean - 1.5σ (squad cutoff ≈ 1459 given squad mean ≈ 7715, σ ≈ 4171) → FLAGGED.
// With roleAware: supports form their own cohort (all at 100 → stdDev = 0) → NOT flagged.
const makeRoleAwarePlayer = (account: string, damage: number) => ({
    account,
    profession: 'Guardian',
    professionList: ['Guardian'],
    totalFightMs: 120000,
    offenseTotals: { damage },
    offenseRateWeights: {},
});

const roleAwarePlayers = [
    // 10 damage players at 10000
    makeRoleAwarePlayer('Damage1.1111', 10000),
    makeRoleAwarePlayer('Damage2.2222', 10000),
    makeRoleAwarePlayer('Damage3.3333', 10000),
    makeRoleAwarePlayer('Damage4.4444', 10000),
    makeRoleAwarePlayer('Damage5.5555', 10000),
    makeRoleAwarePlayer('Damage6.6666', 10000),
    makeRoleAwarePlayer('Damage7.7777', 10000),
    makeRoleAwarePlayer('Damage8.8888', 10000),
    makeRoleAwarePlayer('Damage9.9999', 10000),
    makeRoleAwarePlayer('Damage10.0001', 10000),
    // 3 support players all at 100 (squad-wide outliers: value < cutoff ~1459; cohort stdDev=0 → not flagged within cohort)
    makeRoleAwarePlayer('Support1.6666', 100),
    makeRoleAwarePlayer('Support2.7777', 100),
    makeRoleAwarePlayer('Support3.8888', 100),
];

const roleClassifications = [
    { account: 'Damage1.1111', role: 'damage' },
    { account: 'Damage2.2222', role: 'damage' },
    { account: 'Damage3.3333', role: 'damage' },
    { account: 'Damage4.4444', role: 'damage' },
    { account: 'Damage5.5555', role: 'damage' },
    { account: 'Damage6.6666', role: 'damage' },
    { account: 'Damage7.7777', role: 'damage' },
    { account: 'Damage8.8888', role: 'damage' },
    { account: 'Damage9.9999', role: 'damage' },
    { account: 'Damage10.0001', role: 'damage' },
    { account: 'Support1.6666', role: 'support' },
    { account: 'Support2.7777', role: 'support' },
    { account: 'Support3.8888', role: 'support' },
];

const roleAwareCtx: any = {
    ...ctx,
    stats: {
        offensePlayers: roleAwarePlayers,
        roleClassifications,
    },
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

    it('role-aware: support player is NOT an outlier on damage metric when roleAware is active', () => {
        render(
            <StatsSharedContext.Provider value={roleAwareCtx}>
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

        // Find the outliers list (low performers) in the damage card
        const outlierEls = screen.queryAllByTestId('metric-card-outliers');
        // Support players should NOT appear in any outlier list
        const outlierText = outlierEls.map((el) => el.textContent).join(' ');
        expect(outlierText).not.toContain('Support1.6666');
        expect(outlierText).not.toContain('Support2.7777');
        expect(outlierText).not.toContain('Support3.8888');
    });
});
