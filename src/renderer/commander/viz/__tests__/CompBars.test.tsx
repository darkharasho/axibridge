import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompBars } from '../CompBars';

describe('CompBars', () => {
  it('renders one chip per profession, sorted by count descending', () => {
    const { container } = render(
      <CompBars
        comp={[
          { profession: 'Guardian', count: 3 },
          { profession: 'Necromancer', count: 5 },
          { profession: 'Mesmer', count: 1 },
        ]}
      />,
    );
    const chips = container.querySelectorAll('[data-role="comp-bar"]');
    expect(chips.length).toBe(3);
    expect((chips[0] as HTMLElement).dataset.profession).toBe('Necromancer');
    expect((chips[1] as HTMLElement).dataset.profession).toBe('Guardian');
    expect((chips[2] as HTMLElement).dataset.profession).toBe('Mesmer');
  });

  it('collapses overflow into a "+N" chip', () => {
    const comp = Array.from({ length: 12 }, (_, i) => ({
      profession: `Prof${i}`,
      count: 12 - i,
    }));
    const { container } = render(<CompBars comp={comp} maxChips={5} />);
    const chips = container.querySelectorAll('[data-role="comp-bar"]');
    expect(chips.length).toBe(5);
    const more = container.querySelector('[data-role="comp-bar-more"]');
    expect(more?.textContent).toContain('+');
  });
});
