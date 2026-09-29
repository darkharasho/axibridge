import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchPalette } from '../SearchPalette';
import { buildSearchIndex } from '../searchIndex';

// The flash-highlight keyframes/class live in a <style> tag rendered by
// SearchPalette itself. Assertions below check for their presence anywhere in
// the document rather than scoping to a single container, since the fix under
// test is precisely that this <style> must NOT be scoped to the open dialog's
// own (unmounted-on-close) subtree.
const documentContainsFlashKeyframes = () =>
    (document.head.innerHTML + document.body.innerHTML).includes('axiSearchFlash');

const INDEX = buildSearchIndex({ players: [{ account: 'Ravi.1234', displayName: 'Ravi', profession: 'Firebrand' }] });

// jsdom doesn't implement scrollIntoView; the palette calls it on the active
// row when keyboard/mouse selection changes. Stub in the test env, not src.
beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
});

describe('SearchPalette', () => {
    it('renders nothing when closed', () => {
        const { container } = render(<SearchPalette open={false} onClose={() => {}} index={INDEX} onSelect={() => {}} />);
        expect(container.querySelector('input')).toBeNull();
        // The flash keyframes must still be present even while closed — the
        // highlight is applied asynchronously (after a selection has already
        // closed the palette), so its stylesheet can't be gated on `open`.
        expect(documentContainsFlashKeyframes()).toBe(true);
    });

    it('shows grouped results as the user types', () => {
        render(<SearchPalette open onClose={() => {}} index={INDEX} onSelect={() => {}} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'stab' } });
        expect(screen.getByText('Stab Performance')).toBeTruthy();
    });

    it('selects with Enter and arrow keys', () => {
        const onSelect = vi.fn();
        render(<SearchPalette open onClose={() => {}} index={INDEX} onSelect={onSelect} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'ravi' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ account: 'Ravi.1234' }));
    });

    it('closes on Escape', () => {
        const onClose = vi.fn();
        render(<SearchPalette open onClose={onClose} index={INDEX} onSelect={() => {}} />);
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('keeps the flash keyframes style in the document after a selection closes the palette', () => {
        // Regression test for a real bug: the <style> tag defining .bridge-search-flash
        // used to be rendered only inside the open-dialog JSX, so it unmounted the
        // instant onClose() fired — before useSearchJump's requestAnimationFrame-
        // scheduled flash could ever apply, making the highlight a silent no-op on
        // every selection. SearchPalette is a controlled component (it doesn't flip
        // `open` itself), so simulate what the real host does in response to
        // onClose(): re-render with open={false}.
        const onSelect = vi.fn();
        const onClose = vi.fn();
        const { rerender } = render(<SearchPalette open onClose={onClose} index={INDEX} onSelect={onSelect} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'ravi' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();

        rerender(<SearchPalette open={false} onClose={onClose} index={INDEX} onSelect={onSelect} />);

        expect(documentContainsFlashKeyframes()).toBe(true);
    });

    it('renders the overlay above FullscreenPortal\'s replay fullscreen host (zIndex 9999)', () => {
        // Regression test: FullscreenPortal.tsx appends a zIndex:9999, near-opaque,
        // click-intercepting host to document.body for replay's in-app fullscreen
        // mode. The palette must render above it or Ctrl+K opens it invisibly and
        // unusably underneath.
        const { container } = render(<SearchPalette open onClose={() => {}} index={INDEX} onSelect={() => {}} />);
        const overlay = container.firstElementChild as HTMLElement;
        expect(overlay).toBeTruthy();
        expect(overlay.className).toContain('z-[10000]');
    });

    it('narrows results to one type when a filter pill is pressed', () => {
        render(<SearchPalette open onClose={() => {}} index={INDEX} onSelect={() => {}} />);
        // "stab" hits both a section (Stab Performance) and a metric.
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'stab' } });
        expect(screen.getByText('Stab Performance')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Players', pressed: false }));

        expect(screen.queryByText('Stab Performance')).toBeNull();
        expect(screen.getByText(/No results for/)).toBeTruthy();
    });

    it('clears the filter when its own pill is pressed again', () => {
        render(<SearchPalette open onClose={() => {}} index={INDEX} onSelect={() => {}} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'stab' } });
        const pill = screen.getByRole('button', { name: 'Players' });
        fireEvent.click(pill);
        expect(pill.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(pill);
        expect(pill.getAttribute('aria-pressed')).toBe('false');
        expect(screen.getByText('Stab Performance')).toBeTruthy();
    });

    it('says how many matches the result cap is hiding', () => {
        const { container } = render(<SearchPalette open onClose={() => {}} index={INDEX} onSelect={() => {}} />);
        const count = () => container.querySelector('[data-search-count]')!.textContent;
        // A one-letter query matches far more than the 12 the list shows, so the
        // count has to name the total rather than let 12 pass for the answer.
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a' } });
        expect(count()).toMatch(/^12 of \d+$/);
        // A query with few hits reports them plainly instead.
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ravi.1234' } });
        expect(count()).toBe('1 match');
    });

    it('is drawn by the upstream palette classes, not by an app-side reskin', () => {
        // The palette floats over scrolling content, and blur is a no-op on Linux,
        // so it needs an opaque fill of its own under glass. That used to be an
        // app-side !important override keyed on .bridge-search-panel; upstream now
        // draws .axi-palette__panel on --axi-surface-float and the glass theme
        // restates that token, so the app carries none of it. This asserts the
        // markup the upstream rules key on, and that the old class is gone.
        const { container } = render(<SearchPalette open onClose={() => {}} index={INDEX} onSelect={() => {}} />);
        expect(container.querySelector('.axi-scrim.axi-palette')).toBeTruthy();
        expect(container.querySelector('.axi-palette__panel')).toBeTruthy();
        expect(container.querySelector('.axi-palette__bar .axi-search .axi-input')).toBeTruthy();
        // .bridge-search-flash is deliberately excluded: it is the jump-target
        // highlight useSearchJump applies elsewhere in the page, which is
        // behaviour rather than a surface, and it never lands inside the panel.
        for (const dead of ['panel', 'bar', 'field', 'icon', 'trigger', 'results', 'group', 'empty', 'filters']) {
            expect(container.querySelector(`.bridge-search-${dead}`), dead).toBeNull();
        }
    });
});
