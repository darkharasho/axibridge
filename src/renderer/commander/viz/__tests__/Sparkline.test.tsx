import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from '../Sparkline';

describe('Sparkline', () => {
  it('renders an svg polyline with one point per series entry', () => {
    const { container } = render(
      <Sparkline series={[1, 2, 3, 4, 5]} color="green" />
    );
    const svg = container.querySelector('svg[data-role="sparkline"]');
    expect(svg).toBeTruthy();
    const primary = container.querySelector('polyline[data-role="primary"]') as SVGPolylineElement;
    expect(primary).toBeTruthy();
    const pointsAttr = primary.getAttribute('points') ?? '';
    const pointCount = pointsAttr.trim().split(/\s+/).filter(Boolean).length;
    expect(pointCount).toBe(5);
  });

  it('renders threshold line, secondary series and marker when provided', () => {
    const { container } = render(
      <Sparkline
        series={[0, 1, 2]}
        secondarySeries={[2, 1, 0]}
        thresholdLine={1}
        color="red"
        markerAt={{ index: 1, color: '#fff' }}
      />
    );
    expect(container.querySelector('[data-role="threshold-line"]')).toBeTruthy();
    expect(container.querySelector('[data-role="secondary"]')).toBeTruthy();
    expect(container.querySelector('[data-role="marker"]')).toBeTruthy();
  });
});
