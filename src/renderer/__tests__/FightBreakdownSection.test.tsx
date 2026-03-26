import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FightBreakdownSection } from '../stats/sections/FightBreakdownSection';
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
    formatWithCommas: (value: number, _decimals: number) => String(Math.round(value)),
    renderProfessionIcon: () => null,
    roundCountStats: false,
    expandedPortalRef: { current: null },
});

describe('FightBreakdownSection', () => {
    it('renders map label inside report link', () => {
        const stats = {
            fightBreakdown: [
                {
                    id: 'fight-1',
                    label: 'Fight 1',
                    permalink: 'https://dps.report/abc',
                    timestamp: 1700000000,
                    mapName: 'Green Alpine Borderlands',
                    duration: '01:00',
                    isWin: true,
                    squadCount: 5,
                    allyCount: 0,
                    enemyCount: 3,
                    teamCounts: { red: 1, green: 1, blue: 1 }
                }
            ]
        };

        render(
            <StatsSharedContext.Provider value={makeContextValue(stats)}>
                <FightBreakdownSection
                    fightBreakdownTab="sizes"
                    setFightBreakdownTab={() => {}}
                />
            </StatsSharedContext.Provider>
        );

        expect(screen.getByText(/Green Alpine Borderlands/i)).toBeInTheDocument();
    });

    it('renders unknown outcome when result cannot be determined', () => {
        const stats = {
            fightBreakdown: [
                {
                    id: 'fight-unknown',
                    label: 'Fight Unknown',
                    permalink: '',
                    timestamp: 1700000010,
                    mapName: 'Blue Borderlands',
                    duration: '00:45',
                    isWin: null,
                    squadCount: 0,
                    allyCount: 0,
                    enemyCount: 0
                }
            ]
        };

        render(
            <StatsSharedContext.Provider value={makeContextValue(stats)}>
                <FightBreakdownSection
                    fightBreakdownTab="sizes"
                    setFightBreakdownTab={() => {}}
                />
            </StatsSharedContext.Provider>
        );

        expect(screen.getByText(/^Unknown$/i)).toBeInTheDocument();
    });
});
