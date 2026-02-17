import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { StatsView } from '../StatsView';
import { DEFAULT_STATS_VIEW_SETTINGS } from '../global.d';

describe('StatsView (integration)', () => {
    it('renders key sections from precomputed stats', () => {
        const reportPath = path.resolve(process.cwd(), 'web/report.json');
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

        render(
            <StatsView
                logs={[]}
                onBack={() => {}}
                precomputedStats={report.stats}
                statsViewSettings={report.stats?.statsViewSettings}
                embedded
                dashboardTitle="Statistics Dashboard - Overview"
            />
        );

        expect(screen.getByText(/Statistics Dashboard - Overview/i)).toBeInTheDocument();
        expect(screen.getByText(/Fight Breakdown/i)).toBeInTheDocument();
        expect(screen.getByText(/Fight Comparison/i)).toBeInTheDocument();
        expect(screen.getByText(/Skill Usage Tracker/i)).toBeInTheDocument();
        expect(screen.getByText(/APM Breakdown/i)).toBeInTheDocument();
    });

    it('auto-selects first player skill in Player Breakdown when data exists', async () => {
        const skill = { id: 's1', name: 'Skill 1', damage: 10000, downContribution: 150 };
        const stats = {
            playerSkillBreakdowns: [
                {
                    key: 'acct.1234|Guardian',
                    account: 'acct.1234',
                    displayName: 'acct.1234',
                    profession: 'Guardian',
                    professionList: ['Guardian'],
                    totalFightMs: 60000,
                    skills: [skill],
                    skillMap: { s1: skill }
                }
            ]
        };

        render(
            <StatsView
                logs={[]}
                onBack={() => {}}
                precomputedStats={stats as any}
                statsViewSettings={DEFAULT_STATS_VIEW_SETTINGS}
                embedded
                dashboardTitle="Player Breakdown Regression"
            />
        );

        await waitFor(() => {
            expect(screen.queryByText(/Select a player and skill to view breakdown details/i)).toBeNull();
        });
        expect(screen.getByText(/Skill 1/i)).toBeInTheDocument();
        expect(screen.getAllByText(/Total Damage/i).length).toBeGreaterThan(0);
    });

    it('shows fullscreen Player Breakdown dense-table controls from the latest release', async () => {
        const skillOne = { id: 's1', name: 'Skill One', damage: 10000, downContribution: 100 };
        const skillTwo = { id: 's2', name: 'Skill Two', damage: 15000, downContribution: 250 };
        const stats = {
            playerSkillBreakdowns: [
                {
                    key: 'acct.2345|Guardian',
                    account: 'acct.2345',
                    displayName: 'acct.2345',
                    profession: 'Guardian',
                    professionList: ['Guardian'],
                    totalFightMs: 60000,
                    skills: [skillTwo, skillOne],
                    skillMap: { s1: skillOne, s2: skillTwo }
                }
            ]
        };

        render(
            <StatsView
                logs={[]}
                onBack={() => {}}
                precomputedStats={stats as any}
                statsViewSettings={DEFAULT_STATS_VIEW_SETTINGS}
                embedded
                dashboardTitle="Player Breakdown Subnav"
            />
        );

        const playerBreakdownSection = document.getElementById('player-breakdown');
        expect(playerBreakdownSection).not.toBeNull();
        fireEvent.click(within(playerBreakdownSection as HTMLElement).getByRole('button', { name: /Expand Player Breakdown/i }));

        await waitFor(() => {
            expect(within(playerBreakdownSection as HTMLElement).getByText(/Class Breakdown - Dense View/i)).toBeInTheDocument();
        });
        expect(within(playerBreakdownSection as HTMLElement).getByPlaceholderText(/Search\.\.\./i)).toBeInTheDocument();
        expect(within(playerBreakdownSection as HTMLElement).getByRole('button', { name: /^Columns$/i })).toBeInTheDocument();
        expect(within(playerBreakdownSection as HTMLElement).getByRole('button', { name: /^Players$/i })).toBeInTheDocument();
    });

    it('shows fullscreen APM dense table controls and populated rows', async () => {
        const stats = {
            skillUsageData: {
                logRecords: [],
                players: [
                    {
                        key: 'acct.3456|Guardian',
                        account: 'acct.3456',
                        displayName: 'acct.3456',
                        profession: 'Guardian',
                        professionList: ['Guardian'],
                        logs: 1,
                        totalActiveSeconds: 60,
                        skillTotals: { s1: 30, s2: 10 }
                    }
                ],
                skillOptions: [
                    { id: 's1', name: 'Auto Shot', total: 30 },
                    { id: 's2', name: 'Burst Skill', total: 10 }
                ]
            }
        };

        render(
            <StatsView
                logs={[]}
                onBack={() => {}}
                precomputedStats={stats as any}
                statsViewSettings={DEFAULT_STATS_VIEW_SETTINGS}
                embedded
                dashboardTitle="APM Subnav"
            />
        );

        const apmSection = document.getElementById('apm-stats');
        expect(apmSection).not.toBeNull();
        fireEvent.click(within(apmSection as HTMLElement).getByRole('button', { name: /Expand APM Breakdown/i }));
        fireEvent.click(within(apmSection as HTMLElement).getByRole('button', { name: /Guardian/i }));

        await waitFor(() => {
            expect(within(apmSection as HTMLElement).getByText(/APM - Dense View/i)).toBeInTheDocument();
        });
        expect(within(apmSection as HTMLElement).getByPlaceholderText(/Search\.\.\./i)).toBeInTheDocument();
        expect(within(apmSection as HTMLElement).getByRole('button', { name: /^Columns$/i })).toBeInTheDocument();
        expect(within(apmSection as HTMLElement).getByRole('button', { name: /^Players$/i })).toBeInTheDocument();
        expect(within(apmSection as HTMLElement).getByText(/acct\.3456/i)).toBeInTheDocument();
    });

    it('shows a syncing banner when fights exist but stats logs are not yet synchronized', () => {
        render(
            <StatsView
                logs={[]}
                onBack={() => {}}
                precomputedStats={{}}
                statsViewSettings={DEFAULT_STATS_VIEW_SETTINGS}
                embedded
                statsDataProgress={{ active: false, total: 43, processed: 43, pending: 0, unavailable: 0 }}
                dashboardTitle="Stats Syncing Banner"
            />
        );

        expect(screen.getByText(/Preparing fights for stats/i)).toBeInTheDocument();
        expect(screen.getByText(/Syncing uploaded fights into the stats dashboard/i)).toBeInTheDocument();
    });

    it('shows an unavailable-details banner when all fights fail to load details', () => {
        render(
            <StatsView
                logs={[]}
                onBack={() => {}}
                precomputedStats={{}}
                statsViewSettings={DEFAULT_STATS_VIEW_SETTINGS}
                embedded
                statsDataProgress={{ active: false, total: 12, processed: 12, pending: 0, unavailable: 12 }}
                dashboardTitle="Stats Unavailable Banner"
            />
        );

        expect(screen.getByText(/Fight details unavailable/i)).toBeInTheDocument();
        expect(screen.getByText(/12 of 12 fights could not be loaded from dps\.report/i)).toBeInTheDocument();
    });

    it('prefers uploaded-log count in the header when computed stats only include detailed fights', () => {
        const logs = [
            { id: '1', filePath: 'one.zevtc', permalink: '', status: 'success' },
            { id: '2', filePath: 'two.zevtc', permalink: '', status: 'success' },
            { id: '3', filePath: 'three.zevtc', permalink: '', status: 'success' }
        ];

        render(
            <StatsView
                logs={logs as any}
                onBack={() => {}}
                precomputedStats={{ total: 1 }}
                statsViewSettings={DEFAULT_STATS_VIEW_SETTINGS}
                embedded
                dashboardTitle="Header Count"
            />
        );

        expect(screen.getByText(/Performance across 3 uploaded logs/i)).toBeInTheDocument();
    });
});
