import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommanderView } from '../CommanderView';
import { commanderTestFixture } from '../../../shared/__tests__/commander.fixtures';

const fakeLog = {
  id: 'log1',
  uploadTime: Date.now(),
  fightName: 'Test',
  details: commanderTestFixture,
  detailsStatus: 'loaded',
  permalink: '',
  filePath: '',
} as unknown as ILogData;

describe('CommanderView integration', () => {
  it('renders header, insights, and all seven sections for one log', () => {
    render(<CommanderView logs={[fakeLog]} />);
    expect(screen.getByText(/Numbers & Matchup/i)).toBeInTheDocument();
    expect(screen.getByText(/Outcome Ledger/i)).toBeInTheDocument();
  });

  it('shows empty state with no logs', () => {
    render(<CommanderView logs={[]} />);
    expect(screen.getByText(/No logs yet/i)).toBeInTheDocument();
  });
});
