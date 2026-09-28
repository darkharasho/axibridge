import { readFileSync } from 'fs';
import { resolve } from 'path';
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

    it('renders each cast as a button that reports its selection state', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const boxes = Array.from(container.querySelectorAll('[data-cast]')) as HTMLElement[];
        expect(boxes.every(b => b.tagName === 'BUTTON')).toBe(true);
        expect(boxes[0].getAttribute('aria-pressed')).toBe('false');
        act(() => { boxes[0].click(); });
        expect((container.querySelectorAll('[data-cast]')[0] as HTMLElement)
            .getAttribute('aria-pressed')).toBe('true');
    });

    it('keeps the cast data attributes after the boxes become buttons', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        expect(container.querySelectorAll('[data-cast]')).toHaveLength(3);
        expect(container.querySelectorAll('[data-interrupted="true"]')).toHaveLength(1);
        expect(container.querySelector('[data-prelog="true"]')).toBeTruthy();
    });

    const openCast = (container: HTMLElement, index: number) => {
        const box = container.querySelectorAll('[data-cast]')[index] as HTMLElement;
        act(() => { box.click(); });
    };

    it('opens a sheet with the clicked cast timing and gap', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        openCast(container, 1);
        expect(screen.getByTestId('rotation-cast-sheet')).toBeTruthy();
        expect(screen.getByText('0:01.002')).toBeTruthy();
        expect(screen.getByText('300 ms')).toBeTruthy();
        expect(screen.getByText('500 ms')).toBeTruthy();
        expect(screen.getByText('Interrupted')).toBeTruthy();
    });

    it('shows an em dash for the gap before the very first cast', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        openCast(container, 0);
        const gap = screen.getByTestId('rotation-cast-gap');
        expect(gap.textContent).toBe('—');
    });

    it('reports a negative gap as-is when two casts overlap', () => {
        const overlapping: RotationFightData = {
            ...fight,
            players: [{
                ...fight.players[0],
                skill: [0, 0], dt: [0, 200], dur: [1000, 1000], interrupted: [],
            }],
        };
        const { container } = render(
            <RotationSection fights={[overlapping]} recorded selectedFightId="f1" />);
        openCast(container, 1);
        expect(screen.getByTestId('rotation-cast-gap').textContent).toBe('-800 ms');
    });

    it('closes the sheet when the same cast is clicked again, and on Escape', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        openCast(container, 1);
        openCast(container, 1);
        expect(screen.queryByTestId('rotation-cast-sheet')).toBeNull();
        openCast(container, 1);
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
        expect(screen.queryByTestId('rotation-cast-sheet')).toBeNull();
    });

    it('closes the sheet when the selected player changes', () => {
        const twoPlayers: RotationFightData = {
            ...fight,
            players: [
                fight.players[0],
                { ...fight.players[0], key: 'b.5678|Necromancer', displayName: 'Other', profession: 'Necromancer' },
            ],
        };
        const { container } = render(
            <RotationSection fights={[twoPlayers]} recorded selectedFightId="f1" />);
        openCast(container, 1);
        expect(screen.getByTestId('rotation-cast-sheet')).toBeTruthy();
        // The rail sorts by group then name, so 'Other' sorts before 'Tester'
        // and is the default selection — clicking 'Other' would change nothing.
        // 'Tester' is the click that actually swaps the player.
        act(() => { (screen.getAllByText('Tester')[0].closest('button') as HTMLElement).click(); });
        expect(screen.queryByTestId('rotation-cast-sheet')).toBeNull();
    });

    it('never emits an <img> in the sheet for a bare numeric icon index', () => {
        const numericIcon: RotationFightData = {
            ...fight,
            palette: [{ id: 1, name: 'Symbol of Blades', icon: 7 as unknown as string }],
            players: [{ ...fight.players[0], skill: [0], dt: [0], dur: [500], interrupted: [] }],
        };
        const { container } = render(
            <RotationSection fights={[numericIcon]} recorded selectedFightId="f1" />);
        openCast(container, 0);
        expect(screen.getByTestId('rotation-cast-sheet').querySelector('img')).toBeNull();
    });

    it('hides the player rail below the sm breakpoint and shows a chip strip instead', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const rail = container.querySelector('[data-player-rail]') as HTMLElement;
        const strip = container.querySelector('[data-player-chips]') as HTMLElement;
        expect(rail.className).toContain('hidden');
        expect(rail.className).toContain('sm:flex');
        expect(strip.className).toContain('sm:hidden');
    });

    it('selects a player from the chip strip', () => {
        const twoPlayers: RotationFightData = {
            ...fight,
            players: [
                fight.players[0],
                { ...fight.players[0], key: 'b.5678|Necromancer', displayName: 'Other', profession: 'Necromancer' },
            ],
        };
        const { container } = render(
            <RotationSection fights={[twoPlayers]} recorded selectedFightId="f1" />);
        const strip = container.querySelector('[data-player-chips]') as HTMLElement;
        const chip = Array.from(strip.querySelectorAll('button'))
            .find(b => b.textContent?.includes('Other')) as HTMLElement;
        act(() => { chip.click(); });
        expect(chip.getAttribute('aria-pressed')).toBe('true');
    });

    it('does not let the sheet Escape also close the expanded section', () => {
        // `StatsView` closes the expanded pane on a `window` Escape while a
        // section is expanded. The sheet's own `document` listener fires first,
        // so without stopPropagation one Escape collapses the whole pane and
        // loses the fight, player, and scroll position.
        const outer = vi.fn();
        window.addEventListener('keydown', outer);
        try {
            const { container } = render(
                <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
            openCast(container, 1);
            act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
            expect(screen.queryByTestId('rotation-cast-sheet')).toBeNull();
            expect(outer).not.toHaveBeenCalled();
        } finally {
            window.removeEventListener('keydown', outer);
        }
    });

    it('gives cast buttons a focus-visible outline the global reset does not strip', () => {
        // src/renderer/index.css sets `outline: none` on every `button:focus`
        // and `button:focus-visible`, and an inline style cannot express
        // `:focus-visible` — so keyboard focus on a cast is invisible without a
        // dedicated class. The class and the rule have to travel together.
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const box = container.querySelector('[data-cast]') as HTMLElement;
        expect(box.className).toContain('rotation-cast');
        const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
        expect(css).toMatch(/\.rotation-cast:focus-visible\s*\{[^}]*outline:/);
    });

    it('labels each row with the fight clock, not a raw second count', () => {
        const longFight: RotationFightData = { ...fight, durationMs: 40000 };
        const { container } = render(
            <RotationSection fights={[longFight]} recorded selectedFightId="f1" />);
        const labels = Array.from(container.querySelectorAll('[data-row-label]'))
            .map(el => el.textContent);
        expect(labels).toEqual(['0:00', '0:15', '0:30']);
    });
});
