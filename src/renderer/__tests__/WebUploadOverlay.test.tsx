import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WebUploadOverlay, getUploadStepIndex, getFailedStepIndex } from '../app/WebUploadOverlay';
import type { IWebUploadState } from '../global.d';

const base: IWebUploadState = {
    uploading: false,
    message: null,
    stage: null,
    progress: null,
    detail: null,
    url: null,
    buildStatus: 'idle',
    buildStatusRepo: null,
};

describe('getUploadStepIndex', () => {
    it('returns 0 for Preparing', () => expect(getUploadStepIndex('Preparing')).toBe(0));
    it('returns 1 for Building', () => expect(getUploadStepIndex('Building')).toBe(1));
    it('returns 2 for Packaging', () => expect(getUploadStepIndex('Packaging')).toBe(2));
    it('returns 3 for Uploading', () => expect(getUploadStepIndex('Uploading')).toBe(3));
    it('returns 4 for Finalizing', () => expect(getUploadStepIndex('Finalizing')).toBe(4));
    it('returns -1 for null', () => expect(getUploadStepIndex(null)).toBe(-1));
    it('returns -1 for Complete', () => expect(getUploadStepIndex('Complete')).toBe(-1));
    it('returns -1 for Warning', () => expect(getUploadStepIndex('Warning')).toBe(-1));
    it('returns -1 for Upload failed', () => expect(getUploadStepIndex('Upload failed')).toBe(-1));
    it('is case-insensitive', () => expect(getUploadStepIndex('preparing')).toBe(0));
});

describe('getFailedStepIndex', () => {
    it('returns 1 for Build failed', () => expect(getFailedStepIndex('Build failed')).toBe(1));
    it('returns 3 for Upload failed', () => expect(getFailedStepIndex('Upload failed')).toBe(3));
    it('returns -1 for null', () => expect(getFailedStepIndex(null)).toBe(-1));
    it('returns -1 for unrecognised failure', () => expect(getFailedStepIndex('Something failed')).toBe(-1));
});

describe('WebUploadOverlay', () => {
    it('renders nothing when not uploading and no stage', () => {
        const { container } = render(
            <WebUploadOverlay webUploadState={base} isDev={false} setWebUploadState={vi.fn()} logEntries={[]} />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders when uploading is true', () => {
        render(
            <WebUploadOverlay
                webUploadState={{ ...base, uploading: true, stage: 'Preparing', message: 'Validating settings...' }}
                isDev={false}
                setWebUploadState={vi.fn()}
                logEntries={[]}
            />
        );
        expect(screen.getByText('Preparing')).toBeInTheDocument();
    });

    it('shows step counter when a step is recognised', () => {
        render(
            <WebUploadOverlay
                webUploadState={{ ...base, uploading: true, stage: 'Packaging', message: 'Preparing bundle...' }}
                isDev={false}
                setWebUploadState={vi.fn()}
                logEntries={[]}
            />
        );
        expect(screen.getByText('3 / 5')).toBeInTheDocument();
    });

    it('shows five step labels', () => {
        render(
            <WebUploadOverlay
                webUploadState={{ ...base, uploading: true, stage: 'Uploading', message: 'Uploading...' }}
                isDev={false}
                setWebUploadState={vi.fn()}
                logEntries={[]}
            />
        );
        for (const label of ['Prepare', 'Build', 'Package', 'Upload', 'Finalize']) {
            expect(screen.getByText(label)).toBeInTheDocument();
        }
    });

    it('shows Dismiss button on failure', () => {
        render(
            <WebUploadOverlay
                webUploadState={{ ...base, stage: 'Upload failed', message: 'Auth failed.' }}
                isDev={false}
                setWebUploadState={vi.fn()}
                logEntries={[]}
            />
        );
        expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });

    it('shows Dismiss button when buildStatus is errored', () => {
        render(
            <WebUploadOverlay
                webUploadState={{ ...base, stage: 'Upload complete', buildStatus: 'errored' }}
                isDev={false}
                setWebUploadState={vi.fn()}
                logEntries={[]}
            />
        );
        expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });

    it('calls setWebUploadState when Dismiss is clicked', () => {
        const setFn = vi.fn();
        render(
            <WebUploadOverlay
                webUploadState={{ ...base, stage: 'Upload failed', message: 'Auth failed.' }}
                isDev={false}
                setWebUploadState={setFn}
                logEntries={[]}
            />
        );
        screen.getByRole('button', { name: /dismiss/i }).click();
        expect(setFn).toHaveBeenCalled();
    });
});
