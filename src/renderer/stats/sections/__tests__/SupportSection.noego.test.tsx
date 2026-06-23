import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SupportSection } from '../SupportSection';
import { StatsSharedContext } from '../../StatsViewContext';

// condiCleanse: uses supportTotals.condiCleanse (squad) + supportTotals.condiCleanseSelf (self)
// cleanseScope='all' → squad + self; 'squad' → squad only
// We use cleanseScope='squad' so value = row.supportTotals.condiCleanse directly.
const makeSupportPlayer = (account: string, condiCleanse: number) => ({
    account,
    profession: 'Druid',
    professionList: ['Druid'],
    totalFightMs: 120000,
    activeMs: 120000,
    supportTotals: { condiCleanse, condiCleanseSelf: 0 },
    supportRateWeights: {},
});

// Role-aware fixture: 10 damage players tightly clustered at high condiCleanse (10000),
// and 3 support players tightly clustered at very low condiCleanse (100).
// Squad math: mean ≈ 7715, σ ≈ 4171, cutoff (mean - 1.5σ) ≈ 1458.
// Support players at 100 are < 1458 → FLAGGED squad-wide.
// With roleAware: support cohort has stdDev=0 → NOT flagged within cohort.
const roleAwarePlayers = [
    makeSupportPlayer('Damage1.1111', 10000),
    makeSupportPlayer('Damage2.2222', 10000),
    makeSupportPlayer('Damage3.3333', 10000),
    makeSupportPlayer('Damage4.4444', 10000),
    makeSupportPlayer('Damage5.5555', 10000),
    makeSupportPlayer('Damage6.6666', 10000),
    makeSupportPlayer('Damage7.7777', 10000),
    makeSupportPlayer('Damage8.8888', 10000),
    makeSupportPlayer('Damage9.9999', 10000),
    makeSupportPlayer('Damage10.0001', 10000),
    makeSupportPlayer('Support1.6666', 100),
    makeSupportPlayer('Support2.7777', 100),
    makeSupportPlayer('Support3.8888', 100),
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

const ctx: any = {
    stats: {
        supportPlayers: roleAwarePlayers,
        roleClassifications,
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

describe('SupportSection — No Ego', () => {
    it('renders mean card and per-player detail expander in No Ego mode', () => {
        render(
            <StatsSharedContext.Provider value={ctx}>
                <SupportSection
                    supportSearch=""
                    setSupportSearch={() => {}}
                    activeSupportStat="condiCleanse"
                    setActiveSupportStat={() => {}}
                    supportViewMode="total"
                    setSupportViewMode={() => {}}
                    cleanseScope="squad"
                    setCleanseScope={() => {}}
                    noEgoMode
                />
            </StatsSharedContext.Provider>,
        );
        // One mean readout for the active metric
        expect(screen.getAllByTestId('metric-card-mean').length).toBe(1);
        // Per-player detail expander exists
        expect(screen.getByRole('button', { name: /per-player detail/i })).toBeInTheDocument();
    });

    it('role-aware: support players are NOT outliers on condiCleanse (higher-is-better) when roleAware is active', () => {
        render(
            <StatsSharedContext.Provider value={ctx}>
                <SupportSection
                    supportSearch=""
                    setSupportSearch={() => {}}
                    activeSupportStat="condiCleanse"
                    setActiveSupportStat={() => {}}
                    supportViewMode="total"
                    setSupportViewMode={() => {}}
                    cleanseScope="squad"
                    setCleanseScope={() => {}}
                    noEgoMode
                />
            </StatsSharedContext.Provider>,
        );

        const outlierEls = screen.queryAllByTestId('metric-card-outliers');
        const outlierText = outlierEls.map((el) => el.textContent).join(' ');
        expect(outlierText).not.toContain('Support1.6666');
        expect(outlierText).not.toContain('Support2.7777');
        expect(outlierText).not.toContain('Support3.8888');
    });
});
