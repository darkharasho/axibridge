import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnpublishedSectionNotice } from '../UnpublishedSectionNotice';

describe('UnpublishedSectionNotice', () => {
    it('names the section and the setting that would include it', () => {
        render(<UnpublishedSectionNotice sectionLabel="Map Replay" settingLabel="Publish Combat Replay" />);
        const notice = screen.getByTestId('unpublished-section-notice');
        expect(notice.textContent).toMatch(/Not in published reports/);
        expect(notice.textContent).toMatch(/Map Replay/);
        expect(notice.textContent).toMatch(/Publish Combat Replay/);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('offers to turn the setting on when the host can write it', () => {
        const onEnable = vi.fn();
        render(<UnpublishedSectionNotice sectionLabel="Map Replay" settingLabel="Publish Combat Replay" onEnable={onEnable} />);
        fireEvent.click(screen.getByRole('button', { name: 'Include in uploads' }));
        expect(onEnable).toHaveBeenCalledTimes(1);
    });
});
