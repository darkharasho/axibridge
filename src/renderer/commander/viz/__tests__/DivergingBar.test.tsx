import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DivergingBar } from '../DivergingBar';

describe('DivergingBar', () => {
  it('splits width proportionally between positive and negative', () => {
    const { container } = render(<DivergingBar positive={3} negative={1} />);
    const pos = container.querySelector('[data-role="positive"]') as HTMLElement;
    const neg = container.querySelector('[data-role="negative"]') as HTMLElement;
    expect(pos.style.width).toBe('75%');
    expect(neg.style.width).toBe('25%');
  });

  it('treats negative absolute magnitude correctly', () => {
    const { container } = render(<DivergingBar positive={0} negative={-4} />);
    const neg = container.querySelector('[data-role="negative"]') as HTMLElement;
    expect(neg.style.width).toBe('100%');
  });
});
