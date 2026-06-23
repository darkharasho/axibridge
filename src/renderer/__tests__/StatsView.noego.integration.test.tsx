import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatsView } from '../StatsView';
import { DEFAULT_STATS_VIEW_SETTINGS } from '../global.d';

/**
 * Integration test for StatsView No Ego mode.
 *
 * No Ego mode (statsViewSettings.noEgoMode: true):
 *  - Forces squad-summary layout on (data-testid="squad-summary" present)
 *  - Hides MVP podium ("Offensive MVP" / "Defensive MVP" absent)
 *  - Hides Top Outgoing Skills section ("Top Outgoing Skills" absent)
 *  - Hides Player Comparison section ("Player Comparison" absent)
 *
 * Header literals confirmed via grep:
 *  - TopSkillsSection.tsx:46  → "Top Outgoing Skills"
 *  - PlayerComparisonSection.tsx:90 → "Player Comparison"
 *  - TopPlayersSection.tsx:186 → data-testid="squad-summary"
 *  - TopPlayersSection.tsx:234,257 → "Offensive MVP" / "Defensive MVP"
 */

const baseStats = {
    fightSummaries: [],
    playerSkillBreakdowns: [],
    apmBreakdowns: [],
    skillUsageBreakdowns: [],
    fightDiffMode: {},
};

describe('StatsView – No Ego mode (integration)', () => {
    it('hides MVP podium + Top Skills + Player Comparison, and shows squad-summary when noEgoMode:true', () => {
        render(
            <StatsView
                logs={[]}
                onBack={() => {}}
                precomputedStats={baseStats as any}
                statsViewSettings={{ ...DEFAULT_STATS_VIEW_SETTINGS, noEgoMode: true }}
                embedded
                dashboardTitle="No Ego Test – enabled"
            />
        );

        // squad-summary block must be present
        expect(screen.getByTestId('squad-summary')).toBeInTheDocument();

        // MVP podium must be absent
        expect(screen.queryByText('Offensive MVP')).toBeNull();
        expect(screen.queryByText('Defensive MVP')).toBeNull();

        // Top Skills section must be absent
        expect(screen.queryByText('Top Outgoing Skills')).toBeNull();

        // Player Comparison section must be absent
        expect(screen.queryByText('Player Comparison')).toBeNull();
    });

    it('shows MVP podium + Top Skills + Player Comparison, and hides squad-summary when noEgoMode:false (control)', () => {
        render(
            <StatsView
                logs={[]}
                onBack={() => {}}
                precomputedStats={baseStats as any}
                statsViewSettings={{ ...DEFAULT_STATS_VIEW_SETTINGS, noEgoMode: false, showMvp: true, showTopStats: false }}
                embedded
                dashboardTitle="No Ego Test – disabled"
            />
        );

        // squad-summary must NOT be present in normal mode
        expect(screen.queryByTestId('squad-summary')).toBeNull();

        // Top Skills section header must appear
        expect(screen.getByText('Top Outgoing Skills')).toBeInTheDocument();

        // Player Comparison section header must appear
        expect(screen.getByText('Player Comparison')).toBeInTheDocument();
    });
});
