import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BucketGridTable } from '../BucketGridTable';

const rows = [
    { key: 'a', displayName: 'Alice', group: 1, buckets: [0, 4, 2] },
    { key: 'b', displayName: 'Bob', group: 1, buckets: [1, 0, 0] },
];

describe('BucketGridTable', () => {
    it('renders one row per player and one cell per bucket', () => {
        const { container } = render(
            <BucketGridTable rows={rows} bucketCount={3} bucketMs={5000} accent="#f59e0b" recorded />,
        );
        expect(screen.getByText('Alice')).toBeTruthy();
        expect(container.querySelectorAll('[data-bucket-cell]')).toHaveLength(6);
    });

    it('scales cell intensity against the grid maximum', () => {
        const { container } = render(
            <BucketGridTable rows={rows} bucketCount={3} bucketMs={5000} accent="#f59e0b" recorded />,
        );
        const cells = container.querySelectorAll('[data-bucket-cell]');
        // Alice bucket 1 is the grid max (4) and must be fully saturated.
        expect(cells[1].getAttribute('data-intensity')).toBe('1');
        expect(cells[0].getAttribute('data-intensity')).toBe('0');
    });

    it('shows the not-recorded message instead of an empty grid', () => {
        render(
            <BucketGridTable
                rows={[]} bucketCount={0} bucketMs={5000} accent="#f59e0b"
                recorded={false} notRecordedMessage="Enable Raw timeline arrays and re-parse."
            />,
        );
        expect(screen.getByText('Enable Raw timeline arrays and re-parse.')).toBeTruthy();
    });
});
