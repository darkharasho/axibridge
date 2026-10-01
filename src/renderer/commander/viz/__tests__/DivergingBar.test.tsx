import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DivergingBar } from '../DivergingBar';

describe('DivergingBar', () => {
  it('splits width proportionally between positive and negative', () => {
    const { container } = render(<DivergingBar positive={3} negative={1} />);
    const pos = container.querySelector('[data-role="positive"]') as HTMLElement;
    const neg = container.querySelector('[data-role="negative"]') as HTMLElement;
    expect(pos.style.getPropertyValue('--axi-meter-v')).toBe('75%');
    expect(neg.style.getPropertyValue('--axi-meter-v')).toBe('25%');
  });

  it('treats negative absolute magnitude correctly', () => {
    const { container } = render(<DivergingBar positive={0} negative={-4} />);
    const neg = container.querySelector('[data-role="negative"]') as HTMLElement;
    expect(neg.style.getPropertyValue('--axi-meter-v')).toBe('100%');
  });
});
