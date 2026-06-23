import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MetricDistributionCard } from '../MetricDistributionCard';

const players = (vals: number[]) =>
  vals.map((value, i) => ({ account: `P${i}`, value, profession: 'Guardian' }));

describe('MetricDistributionCard — large mode', () => {
  it('renders a taller dot-plot when large is set', () => {
    const small = render(
      <MetricDistributionCard title="Cleanses" accentColor="#60a5fa" higherIsBetter
        players={players([2, 4, 6, 8])} formatValue={(n) => String(n)} />,
    );
    const smallPlot = small.container.querySelector('[data-testid="metric-card-plot"]');
    expect(smallPlot?.className).toContain('h-8');

    const big = render(
      <MetricDistributionCard title="Cleanses" accentColor="#60a5fa" higherIsBetter large
        players={players([2, 4, 6, 8])} formatValue={(n) => String(n)} />,
    );
    const bigPlot = big.container.querySelector('[data-testid="metric-card-plot"]');
    expect(bigPlot?.className).toContain('h-14');
  });
});
