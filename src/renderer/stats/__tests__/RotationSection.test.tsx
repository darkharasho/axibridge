import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RotationSection } from '../sections/RotationSection';
import type { RotationFightData } from '../computeRotationTimeline';

const fight: RotationFightData = {
    id: 'f1', label: 'Eternal: Bay (0:10)', durationMs: 10000,
    palette: [
        { id: 1, name: 'Symbol of Blades', icon: 'https://example.com/symbol-of-blades.png' },
        { id: 99, name: 'Unknown Skill' },
    ],
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

    it('renders the palette icon in the two casts that have one, and no <img> for the one that does not', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const casts = container.querySelectorAll('[data-cast]');
        expect(casts).toHaveLength(3);
        // skill sequence is [0, 1, 0] against the palette above: slots 0 and 2
        // resolve to the icon-bearing "Symbol of Blades", slot 1 to the
        // icon-less "Unknown Skill".
        expect(casts[0].querySelector('img')?.getAttribute('src')).toBe('https://example.com/symbol-of-blades.png');
        expect(casts[1].querySelector('img')).toBeNull();
        expect(casts[2].querySelector('img')?.getAttribute('src')).toBe('https://example.com/symbol-of-blades.png');
    });

    it('never emits an <img> for a bare numeric icon index (an unexpanded iconIndex reference)', () => {
        const numericIconFight: RotationFightData = {
            ...fight,
            palette: [{ id: 1, name: 'Symbol of Blades', icon: 3 }, { id: 99, name: 'Unknown Skill' }],
        };
        const { container } = render(
            <RotationSection fights={[numericIconFight]} recorded selectedFightId="f1" />);
        // Scoped to the cast boxes themselves — the player sidebar renders its
        // own profession `<img>`, unrelated to this guard.
        const casts = container.querySelectorAll('[data-cast]');
        casts.forEach((cast) => expect(cast.querySelector('img')).toBeNull());
    });

    it('offers a 10s row width and defaults to 15s', () => {
        render(<RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const select = screen.getByLabelText('Row width') as HTMLSelectElement;
        expect(select.value).toBe('15000');
        expect(Array.from(select.options).map(o => o.textContent)).toEqual(['10s', '15s', '30s', '60s']);
    });

    it('keeps a zero-duration cast clickable at the widest row setting', () => {
        const zeroDur: RotationFightData = {
            ...fight,
            players: [{ ...fight.players[0], skill: [0], dt: [2000], dur: [0], interrupted: [] }],
        };
        const { container } = render(
            <RotationSection fights={[zeroDur]} recorded selectedFightId="f1" />);
        const box = container.querySelector('[data-cast]') as HTMLElement;
        expect(box).toBeTruthy();
        expect(box.style.minWidth).toBe('26px');
    });

    /** jsdom reports every width as 0, so a test that wants a measured track
     *  must stub the row's rect and then drive the ResizeObserver stub with a
     *  window resize event — see the comment in src/renderer/test/setup.ts. */
    const measureTrack = (container: HTMLElement, width: number) => {
        const row = container.querySelector('[data-track-row]') as HTMLElement;
        vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ width } as DOMRect);
        act(() => { window.dispatchEvent(new Event('resize')); });
    };

    it('shows the skill name once the track is wide enough for it', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        // 4000px, not 2000: at the new 15s default the first cast is 502ms
        // wide = 3.35% of the row, which is only ~67px at 2000 and would take
        // the icon-only branch. 4000 puts it at ~134px, clear of NAME_MIN_PX.
        measureTrack(container, 4000);
        const box = container.querySelectorAll('[data-cast]')[0] as HTMLElement;
        expect(box.textContent).toContain('Symbol of Blades');
    });

    it('falls back to the icon alone when the box is too narrow for a name', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        measureTrack(container, 120);
        const box = container.querySelectorAll('[data-cast]')[0] as HTMLElement;
        expect(box.textContent).not.toContain('Symbol of Blades');
        expect(box.querySelector('img')).toBeTruthy();
    });

    it('renders the icon alone when the track has never been measured', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const box = container.querySelectorAll('[data-cast]')[0] as HTMLElement;
        expect(box.textContent).not.toContain('Symbol of Blades');
        expect(box.querySelector('img')).toBeTruthy();
    });
});
