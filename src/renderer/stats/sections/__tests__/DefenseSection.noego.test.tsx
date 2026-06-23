import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DefenseSection } from '../DefenseSection';
import { StatsSharedContext } from '../../StatsViewContext';

const makeDefensePlayer = (account: string, damageBarrier: number) => ({
    account,
    profession: 'Guardian',
    professionList: ['Guardian'],
    totalFightMs: 120000,
    activeMs: 120000,
    defenseTotals: { damageBarrier },
    defenseRateWeights: {},
});

// Role-aware fixture: 9 damage players at high damageBarrier (10000) + 1 at 1500 (DmgLow.9999),
// and 3 support players tightly clustered at very low damageBarrier (100).
// Damage cohort math: mean = (9*10000 + 1500)/10 = 9150, σ ≈ 2549.
// cutoff (mean - 1.5σ) ≈ 9150 - 3824 ≈ 5326. DmgLow.9999 at 1500 < 5326 → FLAGGED within damage cohort.
// Support cohort: stdDev=0 → NOT flagged within cohort.
const roleAwarePlayers = [
    makeDefensePlayer('Damage1.1111', 10000),
    makeDefensePlayer('Damage2.2222', 10000),
    makeDefensePlayer('Damage3.3333', 10000),
    makeDefensePlayer('Damage4.4444', 10000),
    makeDefensePlayer('Damage5.5555', 10000),
    makeDefensePlayer('Damage6.6666', 10000),
    makeDefensePlayer('Damage7.7777', 10000),
    makeDefensePlayer('Damage8.8888', 10000),
    makeDefensePlayer('Damage9.9999', 10000),
    makeDefensePlayer('DmgLow.9999', 1500),
    makeDefensePlayer('Support1.6666', 100),
    makeDefensePlayer('Support2.7777', 100),
    makeDefensePlayer('Support3.8888', 100),
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
    { account: 'DmgLow.9999', role: 'damage' },
    { account: 'Support1.6666', role: 'support' },
    { account: 'Support2.7777', role: 'support' },
    { account: 'Support3.8888', role: 'support' },
];

const ctx: any = {
    stats: {
        defensePlayers: roleAwarePlayers,
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

describe('DefenseSection — No Ego', () => {
    it('renders mean card and per-player detail expander in No Ego mode', () => {
        render(
            <StatsSharedContext.Provider value={ctx}>
                <DefenseSection
                    defenseSearch=""
                    setDefenseSearch={() => {}}
                    activeDefenseStat="damageBarrier"
                    setActiveDefenseStat={() => {}}
                    defenseViewMode="total"
                    setDefenseViewMode={() => {}}
                    noEgoMode
                />
            </StatsSharedContext.Provider>,
        );
        // One mean readout for the active metric
        expect(screen.getAllByTestId('metric-card-mean').length).toBe(1);
        // Per-player detail expander exists
        expect(screen.getByRole('button', { name: /per-player detail/i })).toBeInTheDocument();
    });

    it('role-aware: support players are NOT outliers on damageBarrier (higher-is-better) when roleAware is active', () => {
        render(
            <StatsSharedContext.Provider value={ctx}>
                <DefenseSection
                    defenseSearch=""
                    setDefenseSearch={() => {}}
                    activeDefenseStat="damageBarrier"
                    setActiveDefenseStat={() => {}}
                    defenseViewMode="total"
                    setDefenseViewMode={() => {}}
                    noEgoMode
                />
            </StatsSharedContext.Provider>,
        );

        const outlierEls = screen.queryAllByTestId('metric-card-outliers');
        const outlierText = outlierEls.map((el) => el.textContent).join(' ');
        // POSITIVE: DmgLow.9999 is ~3σ below the damage cohort mean → must appear as outlier
        expect(outlierText).toContain('DmgLow.9999');
        // NEGATIVE: support players judged within their own zero-variance cohort → NOT flagged
        expect(outlierText).not.toContain('Support1.6666');
        expect(outlierText).not.toContain('Support2.7777');
        expect(outlierText).not.toContain('Support3.8888');
    });
});
