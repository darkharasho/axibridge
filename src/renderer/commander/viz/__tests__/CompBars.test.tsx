import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompBars } from '../CompBars';

describe('CompBars', () => {
  it('renders one bar per enemy across all professions', () => {
    const { container } = render(
      <CompBars
        comp={[
          { profession: 'Guardian', count: 3 },
          { profession: 'Necromancer', count: 2 },
          { profession: 'Mesmer', count: 1 },
        ]}
      />
    );
    const bars = container.querySelectorAll('[data-role="comp-bar"]');
    expect(bars.length).toBe(6);
    expect((bars[0] as HTMLElement).dataset.profession).toBe('Guardian');
    expect((bars[3] as HTMLElement).dataset.profession).toBe('Necromancer');
    expect((bars[5] as HTMLElement).dataset.profession).toBe('Mesmer');
  });

  it('applies an inline background color (profession color)', () => {
    const { container } = render(<CompBars comp={[{ profession: 'Guardian', count: 1 }]} />);
    const bar = container.querySelector('[data-role="comp-bar"]') as HTMLElement;
    expect(bar.style.backgroundColor).not.toBe('');
  });
});
