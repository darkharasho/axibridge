// src/renderer/stats/components/__tests__/MetricDistributionCard.roleaware.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricDistributionCard } from '../MetricDistributionCard';

const downContrib = [
  { account: 'D1', value: 40, role: 'damage' as const },
  { account: 'D2', value: 42, role: 'damage' as const },
  { account: 'D3', value: 44, role: 'damage' as const },
  { account: 'D4', value: 46, role: 'damage' as const },
  { account: 'D5', value: 48, role: 'damage' as const },
  { account: 'Healer1', value: 3, role: 'support' as const },
  { account: 'Healer2', value: 4, role: 'support' as const },
  { account: 'Healer3', value: 5, role: 'support' as const },
  { account: 'Healer4', value: 4, role: 'support' as const },
];

describe('MetricDistributionCard — role-aware', () => {
  it('does not flag a support player on a damage metric', () => {
    render(
      <MetricDistributionCard
        title="Down Contribution"
        accentColor="#f87171"
        higherIsBetter
        roleAware
        players={downContrib}
        formatValue={(n) => String(Math.round(n))}
      />,
    );
    const outliers = screen.getByTestId('metric-card-outliers');
    expect(outliers).not.toHaveTextContent('Healer1');
    expect(outliers).not.toHaveTextContent('Healer2');
  });

  it('shows the σ gap on a flagged outlier row', () => {
    const squad = [
      { account: 'S1', value: 100, role: 'support' as const },
      { account: 'S2', value: 100, role: 'support' as const },
      { account: 'S3', value: 100, role: 'support' as const },
      { account: 'SLow', value: 0, role: 'support' as const },
    ];
    render(
      <MetricDistributionCard
        title="Cleanses"
        accentColor="#60a5fa"
        higherIsBetter
        roleAware
        players={squad}
        formatValue={(n) => String(Math.round(n))}
      />,
    );
    const outliers = screen.getByTestId('metric-card-outliers');
    expect(outliers).toHaveTextContent('SLow');
    expect(outliers.textContent || '').toMatch(/σ/); // gap rendered with a sigma marker
  });

  it('keeps role color on a flagged outlier dot (role-aware)', () => {
    const squad = [
      { account: 'S1', value: 100, role: 'support' as const },
      { account: 'S2', value: 100, role: 'support' as const },
      { account: 'S3', value: 100, role: 'support' as const },
      { account: 'SLow', value: 0, role: 'support' as const },
    ];
    const { container } = render(
      <MetricDistributionCard
        title="Cleanses" accentColor="#60a5fa" higherIsBetter roleAware
        players={squad} formatValue={(n) => String(Math.round(n))} />,
    );
    // The outlier dot for SLow is identified by its title attribute.
    const dot = container.querySelector('[title^="SLow:"]') as HTMLElement;
    expect(dot).toBeTruthy();
    // Support role color is cyan (#22d3ee); it must remain the fill even though SLow is an outlier.
    expect(dot.style.background).toMatch(/34,\s*211,\s*238|#22d3ee/i);
    // And it is marked as an outlier via an outline.
    expect(dot.style.outline).toContain('solid');
  });

  it('falls back to current behavior when roleAware is false', () => {
    // With a single squad-wide baseline, the lone low player IS flagged.
    const squad = [
      { account: 'A', value: 100 },
      { account: 'B', value: 100 },
      { account: 'C', value: 100 },
      { account: 'Low', value: 0 },
    ];
    render(
      <MetricDistributionCard
        title="Cleanses"
        accentColor="#60a5fa"
        higherIsBetter
        players={squad}
        formatValue={(n) => String(Math.round(n))}
      />,
    );
    expect(screen.getByTestId('metric-card-outliers')).toHaveTextContent('Low');
  });
});
