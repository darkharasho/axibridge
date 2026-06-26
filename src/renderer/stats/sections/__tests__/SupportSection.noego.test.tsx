import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SupportSection } from '../SupportSection';
import { StatsSharedContext } from '../../StatsViewContext';

// condiCleanse: uses supportTotals.condiCleanse (squad) + supportTotals.condiCleanseSelf (self)
// cleanseScope='all' → squad + self; 'squad' → squad only
// We use cleanseScope='squad' so value = row.supportTotals.condiCleanse directly.
const makeDamagePlayer = (account: string, condiCleanse: number) => ({
    account,
    profession: 'Guardian',
    professionList: ['Guardian'],
    totalFightMs: 120000,
    activeMs: 120000,
    supportTotals: { condiCleanse, condiCleanseSelf: 0 },
    supportRateWeights: {},
});

const makeSupportPlayer = (account: string, condiCleanse: number) => ({
    account,
    profession: 'Druid',
    professionList: ['Druid'],
    totalFightMs: 120000,
    activeMs: 120000,
    supportTotals: { condiCleanse, condiCleanseSelf: 0 },
    supportRateWeights: {},
});

// Role-aware fixture: 9 damage players at high condiCleanse (10000) + 1 at 1500 (DmgLow.9999),
// and 3 support players tightly clustered at very low condiCleanse (100).
// Damage cohort math: mean = (9*10000 + 1500)/10 = 9150, σ ≈ 2549.
// cutoff (mean - 1.5σ) ≈ 9150 - 3824 ≈ 5326. DmgLow.9999 at 1500 < 5326 → FLAGGED within damage cohort.
// Support cohort: stdDev=0 → NOT flagged within cohort.
const roleAwarePlayers = [
    makeDamagePlayer('Damage1.1111', 10000),
    makeDamagePlayer('Damage2.2222', 10000),
    makeDamagePlayer('Damage3.3333', 10000),
    makeDamagePlayer('Damage4.4444', 10000),
    makeDamagePlayer('Damage5.5555', 10000),
    makeDamagePlayer('Damage6.6666', 10000),
    makeDamagePlayer('Damage7.7777', 10000),
    makeDamagePlayer('Damage8.8888', 10000),
    makeDamagePlayer('Damage9.9999', 10000),
    makeDamagePlayer('DmgLow.9999', 1500),
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
    { account: 'DmgLow.9999', role: 'damage' },
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
        // No visible "Per-player detail" button; table hidden until secret gesture
        expect(screen.queryByRole('button', { name: /per-player detail/i })).toBeNull();
        expect(screen.queryByText('Fight Time')).toBeNull();
        const secretIcon = screen.getByTestId('noego-secret-icon');
        fireEvent.click(secretIcon);
        fireEvent.click(secretIcon);
        fireEvent.click(secretIcon);
        expect(screen.getByText('Fight Time')).toBeInTheDocument();
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
        // POSITIVE: DmgLow.9999 is ~3σ below the damage cohort mean → must appear as outlier
        expect(outlierText).toContain('DmgLow.9999');
        // NEGATIVE: support players judged within their own zero-variance cohort → NOT flagged
        expect(outlierText).not.toContain('Support1.6666');
        expect(outlierText).not.toContain('Support2.7777');
        expect(outlierText).not.toContain('Support3.8888');
    });
});
