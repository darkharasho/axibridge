import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Donut } from '../Donut';

const SIZE = 38;
const STROKE_WIDTH = 5;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRC = 2 * Math.PI * RADIUS;

describe('Donut', () => {
  it('renders an arc whose dash length reflects the percentage', () => {
    const { container } = render(<Donut pct={0.5} color="green" />);
    const arc = container.querySelector('[data-role="donut-arc"]') as SVGCircleElement;
    expect(arc).toBeTruthy();
    const dashAttr = arc.getAttribute('stroke-dasharray') ?? '';
    const [dashStr] = dashAttr.split(' ');
    const dash = parseFloat(dashStr);
    expect(dash).toBeCloseTo(CIRC * 0.5, 2);
  });

  it('renders the optional label', () => {
    const { container } = render(<Donut pct={0.25} color="red" label="42%" />);
    const lbl = container.querySelector('[data-role="donut-label"]');
    expect(lbl?.textContent).toBe('42%');
  });
});
