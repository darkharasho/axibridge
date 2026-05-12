import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StackedCountBar } from '../StackedCountBar';

describe('StackedCountBar', () => {
  it('splits segments by their share of the total', () => {
    const { container } = render(<StackedCountBar alive={6} downed={2} dead={2} />);
    const alive = container.querySelector('[data-role="alive"]') as HTMLElement;
    const downed = container.querySelector('[data-role="downed"]') as HTMLElement;
    const dead = container.querySelector('[data-role="dead"]') as HTMLElement;
    expect(alive.style.width).toBe('60%');
    expect(downed.style.width).toBe('20%');
    expect(dead.style.width).toBe('20%');
  });

  it('omits the downed segment when not provided', () => {
    const { container } = render(<StackedCountBar alive={3} dead={1} />);
    expect(container.querySelector('[data-role="downed"]')).toBeNull();
    const alive = container.querySelector('[data-role="alive"]') as HTMLElement;
    expect(alive.style.width).toBe('75%');
  });
});
