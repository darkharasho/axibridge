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

    it('allows selecting a specific player skill from the sidebar sub-nav', async () => {
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

        fireEvent.click(screen.getByRole('button', { name: /acct\.2345/i }));
        fireEvent.click(screen.getByRole('button', { name: /Skill Two/i }));

        await waitFor(() => {
            expect(screen.queryByText(/Select a player and skill to view breakdown details/i)).toBeNull();
        });
        expect(screen.getAllByText(/Skill Two/i).length).toBeGreaterThan(0);
    });

    it('allows selecting a specific APM skill from the spec sub-nav', async () => {
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
        fireEvent.click(within(apmSection as HTMLElement).getByRole('button', { name: /Guardian/i }));
        fireEvent.click(within(apmSection as HTMLElement).getByRole('button', { name: /Burst Skill/i }));

        await waitFor(() => {
            expect(within(apmSection as HTMLElement).queryByText(/APM \(No Auto\)/i)).toBeNull();
        });
        expect(within(apmSection as HTMLElement).getAllByText(/Burst Skill/i).length).toBeGreaterThan(0);
    });
});
