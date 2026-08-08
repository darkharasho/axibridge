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

        // Exact accessible-name matching (a plain string, not a RegExp, does a full
        // equality check in testing-library) instead of substring/regex matching.
        // This alone resolves the false collision the regex version had: 'Players'
        // no longer matches the 'Top Players' section button, because 'Top Players'
        // !== 'Players'. Only one label has a REAL exact-name duplicate in this DOM:

        // 'Overview' is a genuine, structural duplicate. The default active category
        // is 'overview' (see beforeEach), and CategoryBar always renders the active
        // category's SectionSubnav (not gated behind hover — required by the second
        // and third tests below, and by real callers: search palette, History's
        // handleRequestCategory). statsTaxonomy.ts's 'overview' category contains a
        // section that is ALSO { id: 'overview', label: 'Overview' }, so both the
        // category button and that section button render with the exact same
        // accessible name. Assert both exist (length 2) rather than indexing into
        // the array — indexing by document order was the bug in the previous
        // version of this test: for a category later in STATS_CATEGORIES than
        // 'overview' (e.g. 'players', 8th), 'overview's own subnav items render
        // BEFORE that category's button, so getAllByRole(...)[0] could silently
        // resolve to an unrelated section button instead of the category button,
        // and .toBeTruthy() would never notice. toHaveLength(2) can't be fooled
        // that way: it fails if either the category button or the section button
        // is missing, and fails (differently) if a third match ever appeared.
        expect(screen.getAllByRole('button', { name: 'Overview' })).toHaveLength(2);

        // 'Replay' has the identical structural shape in the taxonomy — category
        // 'replay' contains exactly one section, itself also { id: 'replay', label:
        // 'Replay' } — but 'replay' is NOT the active category here, so its subnav
        // never mounts and there is no second 'Replay' element to find. Verified by
        // running this test with a temporarily renamed 'replay' category label (see
        // task-8-report.md fix-report section for the red-check transcript): the
        // assertion below fails cleanly (not vacuously) when that button disappears.
        expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy();

        // Remaining eight labels: each must resolve to exactly one button by exact
        // name (getByRole throws on 0 or 2+ matches, so this can't silently pass for
        // the wrong reason). 'Players' is included here — exact matching alone is
        // sufficient to exclude 'Top Players'; verified by a red-check (see
        // task-8-report.md) that renaming the 'players' category label makes this
        // specific assertion fail.
        for (const label of ['Offense', 'Defense', 'Boons & Strips', 'Support & Healing', 'Squad Cohesion', 'Commander', 'Players', 'Roster']) {
            expect(screen.getByRole('button', { name: label })).toBeTruthy();
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
