import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopPlayersSection } from '../stats/sections/TopPlayersSection';
import { StatsSharedContext } from '../stats/StatsViewContext';
import { DEFAULT_ENABLED_TOP_STATS } from '../stats/topStatsCatalog';

const makeContextValue = (stats: any, formatWithCommas: (value: number, decimals: number) => string, renderProfessionIcon: (...args: any[]) => null) => ({
    stats,
    expandedSection: null,
    expandedSectionClosing: false,
    openExpandedSection: () => {},
    closeExpandedSection: () => {},
    isSectionVisible: () => true,
    isFirstVisibleSection: () => false,
    sectionClass: (_id: string, base: string) => base,
    sidebarListClass: '',
    formatWithCommas,
    renderProfessionIcon,
    roundCountStats: false,
    expandedPortalRef: { current: null },
});

const makeEmptyStat = () => ({ value: 0, player: '-', profession: 'Unknown', professionList: [], count: 0 });

const makeBaseStats = () => ({
    maxDownContrib: makeEmptyStat(),
    maxBarrier: makeEmptyStat(),
    maxHealing: makeEmptyStat(),
    maxDodges: makeEmptyStat(),
    maxStrips: makeEmptyStat(),
    maxCleanses: makeEmptyStat(),
    maxCC: makeEmptyStat(),
    maxStab: makeEmptyStat(),
    closestToTag: makeEmptyStat(),
    leaderboards: {},
    boonLeaderboards: {
        b1187: [{ rank: 1, account: 'A.1', profession: 'Chronomancer', professionList: ['Chronomancer'], value: 74, count: 5 }],
    },
});

const renderSection = (overrides: Record<string, any> = {}) => {
    const stats = overrides.stats ?? makeBaseStats();
    const enabledTopStats = overrides.enabledTopStats ?? DEFAULT_ENABLED_TOP_STATS;
    render(
        <StatsSharedContext.Provider value={makeContextValue(stats, (v: number) => `${Math.round(v)}u`, () => null)}>
            <TopPlayersSection
                showTopStats={true}
                showMvp={false}
                topStatsMode={overrides.topStatsMode ?? 'total'}
                interruptMode={overrides.interruptMode ?? 'ccOnly'}
                expandedLeader={null}
                setExpandedLeader={() => {}}
                formatTopStatValue={(value: number) => `${Math.round(value)}u`}
                isMvpStatEnabled={() => true}
                enabledTopStats={enabledTopStats}
            />
        </StatsSharedContext.Provider>
    );
};

describe('TopPlayersSection', () => {
    it('uses the highest leaderboard value for Down Contribution card when precomputed top stat is stale', () => {
        const stats = {
            ...makeBaseStats(),
            maxDownContrib: {
                value: 4000,
                player: 'VincentCross.1469',
                profession: 'Catalyst',
                professionList: ['Catalyst'],
                count: 15
            },
            leaderboards: {
                downContrib: [
                    { rank: 1, account: 'VincentCross.1469', profession: 'Catalyst', professionList: ['Catalyst'], value: 4000, count: 15 },
                    { rank: 2, account: 'harasho.4281', profession: 'Luminary', professionList: ['Luminary'], value: 374000, count: 17 }
                ]
            }
        };

        renderSection({ stats, enabledTopStats: ['downContrib'] });

        expect(screen.getByText('374000u')).toBeInTheDocument();
        expect(screen.queryByText('4000u')).not.toBeInTheDocument();
    });

    const makeStatsWithInterrupts = () => ({
        ...makeBaseStats(),
        maxCC: { value: 50, player: 'CCPlayer.1234', profession: 'Warrior', professionList: ['Warrior'], count: 5 },
        maxInterrupts: { value: 30, player: 'IntPlayer.5678', profession: 'Mesmer', professionList: ['Mesmer'], count: 5 },
        maxCCAndInterrupts: { value: 80, player: 'BothPlayer.9999', profession: 'Guardian', professionList: ['Guardian'], count: 5 },
        leaderboards: {
            cc: [{ rank: 1, account: 'CCPlayer.1234', profession: 'Warrior', professionList: ['Warrior'], value: 50, count: 5 }],
            interrupts: [{ rank: 1, account: 'IntPlayer.5678', profession: 'Mesmer', professionList: ['Mesmer'], value: 30, count: 5 }],
            ccAndInterrupts: [{ rank: 1, account: 'BothPlayer.9999', profession: 'Guardian', professionList: ['Guardian'], value: 80, count: 5 }],
        }
    });

    it('shows only CC card when interruptMode is ccOnly', () => {
        renderSection({ stats: makeStatsWithInterrupts(), interruptMode: 'ccOnly', enabledTopStats: ['cc'] });

        expect(screen.getByText('Total CC')).toBeInTheDocument();
        expect(screen.queryByText('Total Interrupts')).not.toBeInTheDocument();
        expect(screen.queryByText('Total CC + Interrupts')).not.toBeInTheDocument();
    });

    it('shows CC and Interrupts as separate cards when interruptMode is separate', () => {
        renderSection({ stats: makeStatsWithInterrupts(), interruptMode: 'separate', enabledTopStats: ['cc', 'interrupts'] });

        expect(screen.getByText('Total CC')).toBeInTheDocument();
        expect(screen.getByText('Total Interrupts')).toBeInTheDocument();
        expect(screen.queryByText('Total CC + Interrupts')).not.toBeInTheDocument();
    });

    it('shows combined CC + Interrupts card when interruptMode is combined', () => {
        renderSection({ stats: makeStatsWithInterrupts(), interruptMode: 'combined', enabledTopStats: ['ccAndInterrupts'] });

        expect(screen.queryByText('Total CC')).not.toBeInTheDocument();
        expect(screen.queryByText('Total Interrupts')).not.toBeInTheDocument();
        expect(screen.getByText('Total CC + Interrupts')).toBeInTheDocument();
    });

    it('renders only enabled non-boon cards in catalog order', () => {
        renderSection({ enabledTopStats: ['healing', 'downContrib'] });
        const titles = screen.getAllByTestId('leader-card-title').map((n) => n.textContent);
        // catalog order: downContrib (offense) comes before healing (defense)
        expect(titles).toContain('Down Contribution');
        expect(titles).toContain('Total Healing');
        expect(titles.indexOf('Down Contribution')).toBeLessThan(titles.indexOf('Total Healing'));
    });

    it('renders a boon card with BOON badge and unit', () => {
        renderSection({ enabledTopStats: ['boon:quickness'] });
        expect(screen.getByText('Quickness')).toBeInTheDocument();
        expect(screen.getByText('BOON')).toBeInTheDocument();
        expect(screen.getByText('uptime')).toBeInTheDocument();
    });

    it('shows placeholder when no stats are enabled', () => {
        renderSection({ enabledTopStats: [] });
        expect(screen.getByText(/No top stats selected/i)).toBeInTheDocument();
    });
});
