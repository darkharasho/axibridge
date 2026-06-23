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

  it('does not flag a support player on a damage-style leaderboard (role-aware)', () => {
    const ctxRole: any = {
      stats: {
        leaderboards: {
          downContrib: [
            { account: 'D1', value: 40, profession: 'Guardian' },
            { account: 'D2', value: 42, profession: 'Guardian' },
            { account: 'D3', value: 44, profession: 'Guardian' },
            { account: 'D4', value: 46, profession: 'Guardian' },
            { account: 'D5', value: 48, profession: 'Guardian' },
            { account: 'Healer1', value: 3, profession: 'Druid' },
            { account: 'Healer2', value: 4, profession: 'Druid' },
            { account: 'Healer3', value: 5, profession: 'Druid' },
            { account: 'Healer4', value: 4, profession: 'Druid' },
          ],
        },
        roleClassifications: [
          { account: 'D1', role: 'damage' }, { account: 'D2', role: 'damage' },
          { account: 'D3', role: 'damage' }, { account: 'D4', role: 'damage' },
          { account: 'D5', role: 'damage' },
          { account: 'Healer1', role: 'support' }, { account: 'Healer2', role: 'support' },
          { account: 'Healer3', role: 'support' }, { account: 'Healer4', role: 'support' },
        ],
      },
      formatWithCommas: (n: number) => String(n),
      renderProfessionIcon: () => null,
    };
    render(
      <StatsSharedContext.Provider value={ctxRole}>
        <TopPlayersSection {...base} noEgoMode enabledTopStats={['downContrib']} />
      </StatsSharedContext.Provider>,
    );
    const outliers = screen.getByTestId('metric-card-outliers');
    expect(outliers).not.toHaveTextContent('Healer1');
  });
});
