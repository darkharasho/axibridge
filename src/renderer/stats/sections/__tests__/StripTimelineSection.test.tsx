import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StripTimelineSection } from '../StripTimelineSection';

const fights = [{
    id: 'f1', bucketCount: 2, durationMs: 10_000, recorded: true,
    players: {
        a: { group: 1, displayName: 'Alice', cc: [0, 0], stripsOut: [3, 0], stripsIn: [0, 7] },
    },
}];

describe('StripTimelineSection', () => {
    it('shows outgoing strips by default', () => {
        render(<StripTimelineSection fights={fights as any} recorded selectedFightId="f1" />);
        expect(screen.getByTitle(/Alice — 0:00: 3/)).toBeTruthy();
    });

    it('switches to incoming strips when toggled', () => {
        render(<StripTimelineSection fights={fights as any} recorded selectedFightId="f1" />);
        fireEvent.click(screen.getByRole('button', { name: /incoming/i }));
        expect(screen.getByTitle(/Alice — 0:05: 7/)).toBeTruthy();
    });

    it('renders the not-recorded message when the resolved fight has no data, even if the dataset-wide flag is true', () => {
        const unrecordedFights = [{
            id: 'f1', bucketCount: 2, durationMs: 10_000, recorded: false,
            players: {
                a: { group: 1, displayName: 'Alice', cc: [0, 0], stripsOut: [0, 0], stripsIn: [0, 0] },
            },
        }];
        const { container } = render(
            <StripTimelineSection fights={unrecordedFights as any} recorded selectedFightId="f1" />,
        );
        expect(screen.getByText(/Per-player strip timelines need Raw timeline arrays enabled/)).toBeTruthy();
        expect(container.querySelectorAll('[data-bucket-cell]')).toHaveLength(0);
    });
});
