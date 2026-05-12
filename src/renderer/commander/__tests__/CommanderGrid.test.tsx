import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommanderGrid } from '../CommanderGrid';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../shared/commanderThresholds';
import { computeCommanderFightData } from '../../../shared/commanderMetrics';
import { commanderTestFixture } from '../../../shared/__tests__/commander.fixtures';

describe('CommanderGrid', () => {
  it('renders all seven sections', () => {
    const fight = computeCommanderFightData(commanderTestFixture);
    render(<CommanderGrid fight={fight} thresholds={DEFAULT_COMMANDER_THRESHOLDS} />);
    expect(screen.getByText(/Numbers & Matchup/i)).toBeInTheDocument();
    expect(screen.getByText(/Outcome Ledger/i)).toBeInTheDocument();
  });
});
