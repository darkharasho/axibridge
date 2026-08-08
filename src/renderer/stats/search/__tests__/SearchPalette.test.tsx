import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchPalette } from '../SearchPalette';
import { buildSearchIndex } from '../searchIndex';

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
});
