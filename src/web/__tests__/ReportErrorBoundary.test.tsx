import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportErrorBoundary } from '../ReportErrorBoundary';

const Boom = (): JSX.Element => {
    throw new Error('report.json is missing fights[]');
};

describe('ReportErrorBoundary', () => {
    it('renders the error card instead of a blank page when a child throws', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(
            <ReportErrorBoundary>
                <Boom />
            </ReportErrorBoundary>
        );
        expect(screen.getByText('This report failed to render')).toBeTruthy();
        expect(screen.getAllByText(/report.json is missing fights/).length).toBeGreaterThan(0);
        spy.mockRestore();
    });

    it('renders children when nothing throws', () => {
        render(
            <ReportErrorBoundary>
                <p>ok</p>
            </ReportErrorBoundary>
        );
        expect(screen.getByText('ok')).toBeTruthy();
    });
});
