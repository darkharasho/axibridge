import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    singleFight: false,
    mvpBoonMetric: 'uptime' as const,
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

    // The alt link is always on: every fight row offers dps.report alongside our
    // own share link, so a reader who prefers dps.report never needs a setting.
    const renderFight = (fight: Record<string, unknown>) => render(
        <StatsSharedContext.Provider value={makeContextValue({ fightBreakdown: [fight] })}>
            <FightBreakdownSection
                fightBreakdownTab="sizes"
                setFightBreakdownTab={() => {}}
            />
        </StatsSharedContext.Provider>
    );

    it('opens the dps.report permalink from its own column', async () => {
        const opened: string[] = [];
        // In Electron the link goes through openExternal, not a renderer tab.
        (window as any).electronAPI = { openExternal: (url: string) => { opened.push(url); } };
        renderFight({
            id: 'fight-alt',
            label: 'Fight Alt',
            permalink: 'https://bridge.axi.link/r/abc123',
            dpsReportUrl: 'https://dps.report/alt-link',
            timestamp: 1700000020,
            mapName: 'Red Desert Borderlands',
            duration: '02:00',
            isWin: true
        });

        await userEvent.click(screen.getByRole('button', { name: /open on dps\.report/i }));
        expect(opened).toEqual(['https://dps.report/alt-link']);
    });

    it('shows a placeholder when the fight was never uploaded to dps.report', () => {
        renderFight({
            id: 'fight-noalt',
            label: 'Fight No Alt',
            permalink: 'https://bridge.axi.link/r/abc123',
            dpsReportUrl: '',
            timestamp: 1700000030,
            mapName: 'Red Desert Borderlands',
            duration: '02:00',
            isWin: true
        });

        expect(screen.queryByRole('button', { name: /open on dps\.report/i })).toBeNull();
        expect(screen.getByTitle('Not uploaded to dps.report')).toBeInTheDocument();
    });
});
