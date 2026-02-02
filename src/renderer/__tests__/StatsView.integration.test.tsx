import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { StatsView } from '../StatsView';

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
});
