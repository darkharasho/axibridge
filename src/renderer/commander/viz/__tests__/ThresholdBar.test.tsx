import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThresholdBar } from '../ThresholdBar';

describe('ThresholdBar', () => {
  it('renders a fill width proportional to value/max and a threshold tick', () => {
    const { container } = render(
      <ThresholdBar value={0.74} max={2} threshold={1} severity="red" />
    );
    const fill = container.querySelector('[data-role="fill"]') as HTMLElement;
    const tick = container.querySelector('[data-role="threshold"]') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(tick).toBeTruthy();
    expect(fill.style.width).toBe('37%');
    expect(tick.style.left).toBe('50%');
    expect(fill.className).toContain('rose');
  });

  it('clamps overflow values to 100%', () => {
    const { container } = render(<ThresholdBar value={5} max={2} threshold={1} severity="green" />);
    const fill = container.querySelector('[data-role="fill"]') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });
});
