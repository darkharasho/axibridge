import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RotationSection } from '../sections/RotationSection';
import type { RotationFightData } from '../computeRotationTimeline';

const fight: RotationFightData = {
    id: 'f1', label: 'Eternal: Bay (0:10)', durationMs: 10000,
    palette: [{ id: 1, name: 'Symbol of Blades' }, { id: 99, name: 'Unknown Skill' }],
    players: [{
        key: 'a.1234|Guardian', displayName: 'Tester', profession: 'Guardian', group: 1,
        activeMs: 9000,
        skill: [0, 1, 0], dt: [-198, 1200, 3000], dur: [700, 300, 500], interrupted: [1],
    }],
};

describe('RotationSection', () => {
    it('renders nothing when the drilldown is absent from an older report', () => {
        const { container } = render(
            <RotationSection fights={undefined as any} recorded={undefined as any} selectedFightId={null} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('tells the user to re-parse when no log carried rotation', () => {
        render(<RotationSection fights={[]} recorded={false} selectedFightId={null} />);
        expect(screen.getByText(/re-parse/i)).toBeTruthy();
    });

    it('says the data was dropped when it was recorded but trimmed away', () => {
        render(<RotationSection fights={[]} recorded selectedFightId={null} />);
        expect(screen.getByText(/upload size limit/i)).toBeTruthy();
    });

    it('draws one element per cast, marking the interrupted one', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const casts = container.querySelectorAll('[data-cast]');
        expect(casts).toHaveLength(3);
        expect(container.querySelectorAll('[data-interrupted="true"]')).toHaveLength(1);
    });

    it('marks a cast that began before the log started and clamps it to the left edge', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const pre = container.querySelector('[data-prelog="true"]') as HTMLElement;
        expect(pre).toBeTruthy();
        expect(pre.style.left).toBe('0%');
    });

    it('never renders a raw skill id', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        expect(container.innerHTML).not.toMatch(/Skill \d+/);
    });
});
