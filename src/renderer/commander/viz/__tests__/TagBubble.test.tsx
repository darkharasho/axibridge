import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TagBubble } from '../TagBubble';

describe('TagBubble', () => {
  it('renders the correct number of inside and outside dots', () => {
    const { container } = render(<TagBubble inside={5} outside={3} />);
    expect(container.querySelectorAll('[data-role="dot-inside"]').length).toBe(5);
    expect(container.querySelectorAll('[data-role="dot-outside"]').length).toBe(3);
    expect(container.querySelector('[data-role="tag-radius"]')).toBeTruthy();
  });

  it('shows an outlier badge when outliers > 0', () => {
    const { container } = render(<TagBubble inside={1} outside={1} outliers={2} />);
    const badge = container.querySelector('[data-role="outliers"]');
    expect(badge?.textContent).toBe('+2');
  });
});
