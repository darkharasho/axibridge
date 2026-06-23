// src/renderer/stats/components/__tests__/MetricDistributionCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricDistributionCard } from '../MetricDistributionCard';

const players = (vals: number[]) =>
  vals.map((value, i) => ({ account: `Player${i}`, value, profession: 'Guardian' }));

describe('MetricDistributionCard', () => {
  it('renders title, average and deviation hard numbers', () => {
    render(
      <MetricDistributionCard
        title="Cleanses"
        accentColor="#60a5fa"
        higherIsBetter
        players={players([2, 4, 4, 4, 5, 5, 7, 9])}
        formatValue={(n) => String(Math.round(n))}
      />,
    );
    expect(screen.getByText('Cleanses')).toBeInTheDocument();
    expect(screen.getByTestId('metric-card-mean')).toHaveTextContent('5');
    expect(screen.getByTestId('metric-card-stddev')).toHaveTextContent('2');
  });

  it('names needs-improvement outliers and never celebrates the high end', () => {
    render(
      <MetricDistributionCard
        title="Cleanses"
        accentColor="#60a5fa"
        higherIsBetter
        players={players([100, 100, 100, 100, 0]).map((p, i) => ({ ...p, account: i === 4 ? 'LowGuy' : p.account }))}
        formatValue={(n) => String(Math.round(n))}
      />,
    );
    const callouts = screen.getByTestId('metric-card-outliers');
    expect(callouts).toHaveTextContent('LowGuy');
    // No "MVP"/"top"/crown language anywhere
    expect(screen.queryByText(/\bMVP\b|top performer|#1|crown|\bbest\b|elite|winner|podium|champion/i)).toBeNull();
  });

  it('shows a quiet consistent-squad note when there are no outliers', () => {
    render(
      <MetricDistributionCard
        title="Cleanses"
        accentColor="#60a5fa"
        higherIsBetter
        players={players([5, 5, 5])}
        formatValue={(n) => String(Math.round(n))}
      />,
    );
    expect(screen.getByTestId('metric-card-outliers')).toHaveTextContent(/consistent/i);
  });
});
