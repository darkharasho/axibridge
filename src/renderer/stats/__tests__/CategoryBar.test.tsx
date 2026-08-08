import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategoryBar } from '../CategoryBar';
import { useStatsStore } from '../statsStore';

beforeEach(() => {
    useStatsStore.setState({ activeCategory: 'overview' });
});

describe('CategoryBar', () => {
    it('renders all ten categories', () => {
        render(<CategoryBar />);
        // getAllByRole(...)[0], not getByRole: the default active category is
        // 'overview', so its own SectionSubnav ('Overview' and 'Top Players' among
        // its sections) is visible alongside the category buttons. That means the
        // 'Overview' and 'Players' labels legitimately match two buttons each (the
        // category button and a same/similar-named section button) — a real
        // consequence of "the active category's subnav is always shown, not gated
        // behind hover", which the third test below and real callers (search
        // palette, History's handleRequestCategory) depend on. Assert at least one
        // match rather than exactly one.
        for (const label of ['Overview', 'Offense', 'Defense', 'Boons & Strips', 'Support & Healing', 'Squad Cohesion', 'Commander', 'Players', 'Roster', 'Replay']) {
            expect(screen.getAllByRole('button', { name: new RegExp(label, 'i') })[0]).toBeTruthy();
        }
    });

    it('activates a category on click and pushes visibility up', () => {
        const onVisibility = vi.fn();
        render(<CategoryBar onSectionVisibilityChange={onVisibility} />);
        fireEvent.click(screen.getByRole('button', { name: /Boons & Strips/i }));
        expect(useStatsStore.getState().activeCategory).toBe('boons-strips');
        const lastFn = onVisibility.mock.calls.at(-1)![0] as (id: string) => boolean;
        expect(lastFn('boon-uptime')).toBe(true);
        expect(lastFn('offense-detailed')).toBe(false);
    });

    it('shows the active category subnav sections', () => {
        useStatsStore.setState({ activeCategory: 'squad-cohesion' });
        render(<CategoryBar />);
        expect(screen.getByRole('button', { name: /On Tag Review/i })).toBeTruthy();
    });

    it('hides categories with no allowed sections', () => {
        render(<CategoryBar isSectionAllowed={(id) => !id.startsWith('commander')} />);
        expect(screen.queryByRole('button', { name: /Commander/i })).toBeNull();
    });
});
