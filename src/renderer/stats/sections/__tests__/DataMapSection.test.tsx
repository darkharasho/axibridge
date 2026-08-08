import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataMapSection } from '../DataMapSection';
import { STATS_CATEGORIES } from '../../statsTaxonomy';

describe('DataMapSection', () => {
    it('renders one card per category with its description', () => {
        render(<DataMapSection onNavigate={() => {}} />);
        for (const category of STATS_CATEGORIES) {
            expect(screen.getByText(category.description)).toBeTruthy();
        }
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
});
