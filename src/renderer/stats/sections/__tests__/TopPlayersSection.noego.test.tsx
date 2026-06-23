import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopPlayersSection } from '../TopPlayersSection';
import { StatsSharedContext } from '../../StatsViewContext';

// Minimal context value; fill required fields per StatsSharedContextValue.
const ctx: any = {
  stats: {
    leaderboards: {
      cleanses: [
        { account: 'A', value: 100, profession: 'Guardian' },
        { account: 'B', value: 100, profession: 'Guardian' },
        { account: 'C', value: 100, profession: 'Guardian' },
        { account: 'LowGuy', value: 0, profession: 'Guardian' },
      ],
    },
  },
  formatWithCommas: (n: number) => String(n),
  renderProfessionIcon: () => null,
};

const renderWith = (props: any) =>
  render(
    <StatsSharedContext.Provider value={ctx}>
      <TopPlayersSection {...props} />
    </StatsSharedContext.Provider>,
  );

const base = {
  showTopStats: true,
  showMvp: false,
  topStatsMode: 'total' as const,
  expandedLeader: null,
  setExpandedLeader: () => {},
  formatTopStatValue: (n: number) => String(Math.round(n)),
  isMvpStatEnabled: () => true,
  enabledTopStats: ['cleanses'],
};

describe('TopPlayersSection — No Ego', () => {
  it('shows squad-summary cards and no podium when noEgoMode', () => {
    renderWith({ ...base, noEgoMode: true });
    expect(screen.getByTestId('squad-summary')).toBeInTheDocument();
    expect(screen.queryByText('Offensive MVP')).toBeNull();
    expect(screen.getByTestId('metric-card-outliers')).toHaveTextContent('LowGuy');
  });

  it('shows the normal leaderboard layout when noEgoMode is off', () => {
    renderWith({ ...base, noEgoMode: false });
    expect(screen.queryByTestId('squad-summary')).toBeNull();
  });
});
