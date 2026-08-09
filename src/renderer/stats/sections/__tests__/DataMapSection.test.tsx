import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataMapSection } from '../DataMapSection';
import { STATS_CATEGORIES } from '../../statsTaxonomy';

describe('DataMapSection', () => {
    it('renders one card per content category, excluding its own', () => {
        render(<DataMapSection onNavigate={() => {}} />);
        for (const category of STATS_CATEGORIES) {
            if (category.id === 'data-map') continue;
            expect(screen.getByText(category.description)).toBeTruthy();
        }
        // The data-map category's only section is the map itself, which the
        // directory never lists — so it must not render a card for itself.
        // No other category or listed section carries the label 'Data Map'
        // (card labels are spans, not headings, so assert by text).
        expect(screen.queryByText('Data Map')).toBeNull();
    });

    it('lists section labels and navigates on click', () => {
        const onNavigate = vi.fn();
        render(<DataMapSection onNavigate={onNavigate} />);
        fireEvent.click(screen.getByRole('button', { name: /On Tag Review/i }));
        expect(onNavigate).toHaveBeenCalledWith('squad-cohesion', 'on-tag-review');
    });

    it('does not list the data map itself', () => {
        render(<DataMapSection onNavigate={() => {}} />);
        expect(screen.queryByRole('button', { name: /^Data Map$/i })).toBeNull();
    });

    it('hides categories whose sections are all disallowed', () => {
        render(
            <DataMapSection
                onNavigate={() => {}}
                isSectionAllowed={(id) => !id.startsWith('commander')}
            />
        );
        expect(screen.queryByText(STATS_CATEGORIES.find((c) => c.id === 'commander')!.description)).toBeNull();
    });

    it('renders a category with only its allowed sections when SOME (not all) are disallowed', () => {
        // T4 gap: a partially-allowed category must still render, listing just the
        // allowed subset of its sections. Disallow exactly one Overview section.
        render(
            <DataMapSection
                onNavigate={() => {}}
                isSectionAllowed={(id) => id !== 'fight-breakdown'}
            />
        );
        const overview = STATS_CATEGORIES.find((c) => c.id === 'overview')!;
        // Category card still present (its description renders).
        expect(screen.getByText(overview.description)).toBeTruthy();
        // An allowed sibling section still lists as a chip.
        expect(screen.getByRole('button', { name: 'Fight Comparison' })).toBeTruthy();
        // The single disallowed section does not.
        expect(screen.queryByRole('button', { name: 'Fight Breakdown' })).toBeNull();
    });
});
