import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    CommanderStatsSection,
    CommanderTagMovementSection,
    CommanderTagDeathResponseSection,
    CommanderPushTimingSection,
    CommanderTargetConversionSection
} from '../stats/sections/CommanderStatsSection';
import { StatsSharedContext } from '../stats/StatsViewContext';

/**
 * Every `avg*` field on a commander row is a mean over that commander's fights,
 * so a one-fight report averages one sample. These assertions pin the two things
 * that follow: the headers stop saying "Avg", and the columns that collapse into
 * a verbatim copy of a neighbour stop being rendered at all.
 *
 * They are also the only automated cover for this path — the repo's native
 * fixtures produce zero commander rows, so the section renders its empty state
 * in a browser and cannot be checked there.
 */

const makeContextValue = (singleFight: boolean) => ({
    stats: {} as any,
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
    singleFight,
    mvpBoonMetric: 'uptime' as const,
    expandedPortalRef: { current: null },
});

// One fight: 20 squad against 34 enemies, 6 enemies downed and 1 killed. Every
// `avg*` below is therefore identical to the total it was divided by.
const commanderStats = {
    rows: [{
        key: 'c1',
        account: 'Tag.1234',
        characterNames: ['Tag'],
        profession: 'Guardian',
        professionList: ['Guardian'],
        fights: 1,
        wins: 1,
        losses: 0,
        winRatePct: 100,
        totalDurationMs: 101_000,
        avgSquadSize: 20,
        avgEnemySize: 34,
        kills: 1,
        downs: 6,
        kdr: 1.5,
        avgKillsPerFight: 1,
        avgDownsPerFight: 6,
        failedDownEstimate: 5,
        downToKillConversionPct: 16.7,
        avgTimeToFirstEnemyDownMs: 12_000,
        avgTimeToFirstEnemyDeathMs: 30_000,
        avgDownToKillConversionMs: 18_000,
        pushesWithEarlyDownPct: 100,
        stalledPushPct: 0,
        avgCommanderDistanceTraveled: 4200,
        avgCommanderMovementPerMinute: 2500,
        avgTagStationaryPct: 12,
        avgTagMovementBurstCount: 3,
        fightsWithCommanderDeath: 1,
        avgSquadDeathsAfterTagDeath: 4,
        avgEnemyKillsAfterTagDeath: 2,
        squadCollapseAfterTagDeathPct: 100,
        recoveryAfterTagDeathPct: 0,
        boonUptimePct: 0,
        boonEntries: 0,
        incomingSkillBreakdown: [],
        incomingBoonBreakdown: [],
        fightRows: [],
    }],
} as any;

const headersOf = (container: HTMLElement) =>
    [...container.querySelectorAll('thead th')].map((th) => th.textContent?.trim());

const renderWith = (singleFight: boolean, node: React.ReactElement) =>
    render(
        <StatsSharedContext.Provider value={makeContextValue(singleFight)}>
            {node}
        </StatsSharedContext.Provider>
    );

describe('commander stats in a single-fight report', () => {
    it('drops "Avg" from every header that averages across fights', () => {
        const cases: Array<[React.ReactElement, string, string]> = [
            [<CommanderStatsSection commanderStats={commanderStats} getProfessionIconPath={() => null} />, 'Avg Squad', 'Squad'],
            [<CommanderStatsSection commanderStats={commanderStats} getProfessionIconPath={() => null} />, 'Avg Enemy', 'Enemies'],
            [<CommanderTagMovementSection commanderStats={commanderStats} />, 'Avg Distance', 'Distance'],
            [<CommanderTagDeathResponseSection commanderStats={commanderStats} />, 'Avg Squad Deaths After', 'Squad Deaths After'],
            [<CommanderTagDeathResponseSection commanderStats={commanderStats} />, 'Avg Enemy Kills After', 'Enemy Kills After'],
            [<CommanderPushTimingSection commanderStats={commanderStats} />, 'Avg To First Down', 'To First Down'],
            [<CommanderPushTimingSection commanderStats={commanderStats} />, 'Avg To First Kill', 'To First Kill'],
            [<CommanderPushTimingSection commanderStats={commanderStats} />, 'Avg Down To Kill', 'Down To Kill'],
        ];

        for (const [node, averaged, plain] of cases) {
            const aggregate = renderWith(false, node);
            expect(headersOf(aggregate.container)).toContain(averaged);
            aggregate.unmount();

            const single = renderWith(true, node);
            const headers = headersOf(single.container);
            expect(headers).toContain(plain);
            expect(headers).not.toContain(averaged);
            single.unmount();
        }
    });

    it('drops the per-fight means that duplicate a neighbouring total', () => {
        const aggregate = renderWith(false, <CommanderTargetConversionSection commanderStats={commanderStats} />);
        expect(headersOf(aggregate.container)).toEqual(
            expect.arrayContaining(['Avg Downs / Fight', 'Avg Kills / Fight', 'Enemy Downs', 'Enemy Kills'])
        );
        aggregate.unmount();

        const single = renderWith(true, <CommanderTargetConversionSection commanderStats={commanderStats} />);
        expect(headersOf(single.container)).not.toContain('Avg Downs / Fight');
        expect(headersOf(single.container)).not.toContain('Avg Kills / Fight');
        // The component renders a per-commander detail table below the summary,
        // so scope the alignment check to the summary table these columns left.
        const table = single.container.querySelector('table') as HTMLElement;
        const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
        // The totals they duplicated stay, and the row still lines up with them.
        expect(headers).toContain('Enemy Downs');
        expect(headers).toContain('Enemy Kills');
        expect([...table.querySelectorAll('tbody tr td')]).toHaveLength(headers.length);
    });

    it('drops Fights, W/L and Win %, which restate the fight outcome', () => {
        const single = renderWith(true, <CommanderStatsSection commanderStats={commanderStats} getProfessionIconPath={() => null} />);
        const table = single.container.querySelector('table') as HTMLElement;
        const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
        expect(headers).not.toContain('Fights');
        expect(headers).not.toContain('W/L');
        expect(headers).not.toContain('Win %');
        expect(within(table).queryByText('100.0%')).toBeNull();
        expect([...table.querySelectorAll('tbody tr td')]).toHaveLength(headers.length);
    });

    it('keeps the aggregate columns when the report holds several fights', () => {
        const aggregate = renderWith(false, <CommanderStatsSection commanderStats={commanderStats} getProfessionIconPath={() => null} />);
        const table = aggregate.container.querySelector('table') as HTMLElement;
        const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
        expect(headers).toEqual(expect.arrayContaining(['Fights', 'W/L', 'Win %', 'Avg Squad', 'Avg Enemy']));
        expect([...table.querySelectorAll('tbody tr td')]).toHaveLength(headers.length);
    });
});
