import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MiniTimeline } from '../MiniTimeline';

describe('MiniTimeline', () => {
  it('positions markers proportional to tSec / duration', () => {
    const { container } = render(
      <MiniTimeline
        duration={100}
        markers={[
          { tSec: 0, color: 'green' },
          { tSec: 25, color: 'yellow' },
          { tSec: 100, color: 'red' },
        ]}
      />
    );
    const markers = container.querySelectorAll('[data-role="marker"]');
    expect(markers.length).toBe(3);
    expect((markers[0] as HTMLElement).style.left).toBe('0%');
    expect((markers[1] as HTMLElement).style.left).toBe('25%');
    expect((markers[2] as HTMLElement).style.left).toBe('100%');
  });

  it('clamps overflowing markers to 100%', () => {
    const { container } = render(
      <MiniTimeline duration={10} markers={[{ tSec: 50, color: 'red' }]} />
    );
    const m = container.querySelector('[data-role="marker"]') as HTMLElement;
    expect(m.style.left).toBe('100%');
  });
});
