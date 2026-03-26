import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OverviewSection } from '../stats/sections/OverviewSection';
import { StatsSharedContext } from '../stats/StatsViewContext';

const makeContextValue = (stats: any) => ({
    stats,
    expandedSection: null,
    expandedSectionClosing: false,
    openExpandedSection: () => {},
    closeExpandedSection: () => {},
    isSectionVisible: () => true,
    isFirstVisibleSection: () => false,
    sectionClass: (_id: string, base: string) => base,
    sidebarListClass: '',
    formatWithCommas: (value: number) => String(value),
    renderProfessionIcon: () => null,
    roundCountStats: false,
    expandedPortalRef: { current: null },
});

describe('OverviewSection', () => {
    it('uses squad totals directly for allied downs and deaths', () => {
        const stats = {
            avgSquadSize: 10,
            avgEnemies: 11,
            wins: 6,
            losses: 1,
            squadKDR: '1.75',
            enemyKDR: '0.57',
            totalSquadDowns: 16,
            totalSquadDeaths: 8,
            totalEnemyDowns: 20,
            totalEnemyDeaths: 14,
            // Keep these intentionally different to catch swapped-field regressions.
            totalEnemyKills: 8,
            totalSquadKills: 14
        };

        render(
            <StatsSharedContext.Provider value={makeContextValue(stats)}>
                <OverviewSection />
            </StatsSharedContext.Provider>
        );

        expect(screen.getByText('Allied Downs').parentElement?.textContent).toContain('16');
        expect(screen.getByText('Allied Deaths').parentElement?.textContent).toContain('8');
        expect(screen.getByText('Enemy Downs').parentElement?.textContent).toContain('20');
        expect(screen.getByText('Enemy Deaths').parentElement?.textContent).toContain('14');
    });
});
