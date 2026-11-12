import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BoonOutputSection } from '../BoonOutputSection';

const resistanceRow = (account: string, sources?: any) => ({
    account,
    profession: 'Firebrand',
    professionList: ['Firebrand'],
    activeTimeMs: 60_000,
    numFights: 1,
    groupSupported: 5,
    squadSupported: 20,
    categories: {
        selfBuffs: { generationMs: 1000, wastedMs: 0 },
        groupBuffs: { generationMs: 1000, wastedMs: 0 },
        squadBuffs: { generationMs: 1000, wastedMs: 0 },
    },
    ...(sources ? { sources } : {}),
});

const table = {
    id: 'b26980',
    name: 'Resistance',
    stacking: false,
    rows: [
        resistanceRow('Guard.1', {
            skills: [
                { name: 'Symbol of Luminance', ms: 630 },
                { name: 'Chapter 4: Stalwart Stand', ms: 220 },
            ],
            unnamedMs: 0,
            otherMs: 150,
            totalMs: 1000,
        }),
        resistanceRow('Old.2'),
    ],
};

vi.mock('../../StatsViewContext', () => ({
    useStatsSharedContext: () => ({
        stats: { boonTables: [table] },
        renderProfessionIcon: () => null,
        roundCountStats: false,
        expandedSection: null,
        expandedSectionClosing: false,
        openExpandedSection: () => {},
        closeExpandedSection: () => {},
        sidebarListClass: '',
    }),
}));

const renderSection = () => render(
    <BoonOutputSection
        activeBoonCategory="squadBuffs"
        setActiveBoonCategory={() => {}}
        activeBoonMetric="total"
        setActiveBoonMetric={() => {}}
        activeBoonTab="b26980"
        setActiveBoonTab={() => {}}
        activeBoonTable={table}
        boonSearch=""
        setBoonSearch={() => {}}
        formatBoonMetricDisplay={() => '1.00'}
        getBoonMetricValue={() => 1}
    />,
);

describe('BoonOutputSection per-skill sources', () => {
    it('expands a player into their skill split, with the unmatched share shown', () => {
        renderSection();
        expect(screen.getByText(/click a player to see which skills gave it/i)).toBeInTheDocument();
        expect(screen.queryByTestId('boon-sources-panel')).toBeNull();

        const toggle = screen.getByRole('button', { name: /Guard\.1/ });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');

        const panel = screen.getByTestId('boon-sources-panel');
        expect(within(panel).getByText('Symbol of Luminance')).toBeInTheDocument();
        expect(within(panel).getByText('63.0%')).toBeInTheDocument();
        expect(within(panel).getByText('22.0%')).toBeInTheDocument();
        expect(within(panel).getByText(/Other \(traits, relics, unmatched\)/)).toBeInTheDocument();
        expect(within(panel).getByText('15.0%')).toBeInTheDocument();

        fireEvent.click(toggle);
        expect(screen.queryByTestId('boon-sources-panel')).toBeNull();
    });

    it('leaves rows without a split as plain, non-expandable rows', () => {
        renderSection();
        expect(screen.queryByRole('button', { name: /Old\.2/ })).toBeNull();
        expect(screen.getByText('Old.2')).toBeInTheDocument();
    });
});
