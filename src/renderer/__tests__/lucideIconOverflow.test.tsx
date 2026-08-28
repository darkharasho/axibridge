import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AlertTriangle, Maximize2, X, ChevronDown, Swords } from 'lucide-react';

/**
 * Chrome (150.x) paints NOTHING for an <svg> smaller than 16 CSS px while the
 * UA default `overflow: hidden` is in effect. Every lucide icon rendered at
 * `w-3 h-3` (12px) or `w-3.5 h-3.5` (14px) therefore disappears — expand
 * buttons, warning badges, row chevrons.
 *
 * index.css carries an `overflow: visible` escape hatch for lucide icons. This
 * test guards the thing that silently broke it: the rule must actually MATCH a
 * lucide icon as the app renders it (i.e. with a caller-supplied className).
 * lucide-react 0.292 spreads `...rest` after its own `className`, so passing
 * any className strips the built-in `lucide` class — which made the original
 * `svg.lucide` selector match zero elements in production.
 */

const CSS = readFileSync(path.resolve(__dirname, '../index.css'), 'utf8');

/** Pull the selector list off the svg rule that sets `overflow: visible`. */
const overflowRuleSelector = (): string => {
    const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g);
    for (const [, selector, body] of rules) {
        if (!/overflow:\s*visible/.test(body)) continue;
        const cleaned = selector.trim().replace(/\s*\n\s*/g, ' ');
        if (/(^|[\s,])svg[\s.[:]/.test(`${cleaned} `)) return cleaned;
    }
    throw new Error('index.css has no svg rule setting `overflow: visible`');
};

describe('lucide icon overflow escape hatch', () => {
    it('index.css still defines an overflow:visible rule for icons', () => {
        expect(overflowRuleSelector()).toBeTruthy();
    });

    it.each([
        ['AlertTriangle', AlertTriangle, 'w-3 h-3 shrink-0'],
        ['Maximize2', Maximize2, 'w-3 h-3'],
        ['X', X, 'w-3 h-3'],
        ['ChevronDown', ChevronDown, 'w-3.5 h-3.5'],
        ['Swords', Swords, 'w-4 h-4 shrink-0']
    ])('the rule matches <%s /> as the app renders it', (_name, Icon, className) => {
        const { container } = render(<Icon className={className} />);
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg!.matches(overflowRuleSelector())).toBe(true);
    });

    it('does not match a chart canvas svg', () => {
        const wrapper = document.createElement('div');
        wrapper.className = 'recharts-wrapper';
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        el.setAttribute('class', 'recharts-surface');
        el.setAttribute('viewBox', '0 0 672 300');
        wrapper.appendChild(el);
        document.body.appendChild(wrapper);
        expect(el.matches(overflowRuleSelector())).toBe(false);
        wrapper.remove();
    });

    /* recharts legend swatches render at 14px and vanish under the same Chrome bug. */
    it('matches a recharts legend swatch', () => {
        const item = document.createElement('li');
        item.className = 'recharts-legend-item legend-item-0';
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        el.setAttribute('class', 'recharts-surface');
        el.setAttribute('viewBox', '0 0 32 32');
        item.appendChild(el);
        document.body.appendChild(item);
        expect(el.matches(overflowRuleSelector())).toBe(true);
        item.remove();
    });
});
