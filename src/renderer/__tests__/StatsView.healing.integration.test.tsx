import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { StatsView } from '../StatsView';
import { computeStatsAggregation } from '../stats/computeStatsAggregation';
import { DEFAULT_STATS_VIEW_SETTINGS } from '../global.d';

describe('StatsView (healing integration)', () => {
    it('renders healing stats when ext healing data exists', () => {
        const fixturePath = path.resolve(process.cwd(), 'test-fixtures/ei/20260130-193742.json');
        const details = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        const log = { details, status: 'success', filePath: fixturePath };
        const { stats } = computeStatsAggregation({ logs: [log] });

        render(
            <StatsView
                logs={[]}
                onBack={() => {}}
                precomputedStats={stats}
                statsViewSettings={DEFAULT_STATS_VIEW_SETTINGS}
                embedded
                dashboardTitle="Healing Stats Dashboard"
            />
        );

        expect(screen.getAllByText(/Healing Stats/i).length).toBeGreaterThan(0);
        expect(screen.queryByText(/No healing stats available/i)).toBeNull();
        expect(screen.queryByText(/No healing data for this view/i)).toBeNull();
    });
});
