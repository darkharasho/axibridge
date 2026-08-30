import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ObjectiveLayer } from '../layers/ObjectiveLayer';
import { objectiveTier } from '../objectiveTiers';
import { WvwMap } from '../../../../shared/wvwLandmarks';

describe('objectiveTier', () => {
    it('classifies keeps, towers and the castle as major', () => {
        expect(objectiveTier('Overlook Keep')).toBe('major');
        expect(objectiveTier('Cliffside Tower')).toBe('major');
        expect(objectiveTier('Stonemist Castle')).toBe('major');
    });

    it('classifies camps and ruins as minor', () => {
        expect(objectiveTier('Golanta Clearing')).toBe('minor');
        expect(objectiveTier('Temple of Lost Prayers')).toBe('minor');
    });
});

describe('ObjectiveLayer', () => {
    it('renders nothing without a map key', () => {
        const { container } = render(<svg><ObjectiveLayer mapKey={null} /></svg>);
        expect(container.querySelectorAll('[data-objective]').length).toBe(0);
    });

    it('sizes major objectives larger than minor ones', () => {
        const { container } = render(<svg><ObjectiveLayer mapKey={WvwMap.EternalBattlegrounds} /></svg>);
        const dots = [...container.querySelectorAll('[data-objective]')];
        expect(dots.length).toBeGreaterThan(0);
        const radii = new Set(dots.map(d => d.querySelector('circle')?.getAttribute('r')));
        expect(radii).toContain('5');
        expect(radii).toContain('3.5');
    });

    it('does not paint labels with a heavy black stroke', () => {
        const { container } = render(<svg><ObjectiveLayer mapKey={WvwMap.EternalBattlegrounds} /></svg>);
        const label = container.querySelector('[data-objective] text');
        expect(label?.getAttribute('stroke')).toBeNull();
    });
});
