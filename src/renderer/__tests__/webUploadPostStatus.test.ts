import { describe, it, expect } from 'vitest';
import { nextPostStatus } from '../app/hooks/useWebUpload';
import type { WebUploadPostStatus } from '../global.d';

describe('nextPostStatus', () => {
    it('stays idle through the upload stages', () => {
        const settled = ['Preparing', 'Building', 'Packaging', 'Uploading', 'Finalizing']
            .reduce<WebUploadPostStatus>((s, stage) => nextPostStatus(s, stage), 'idle');
        expect(settled).toBe('idle');
    });

    it('ignores warnings raised before the post starts', () => {
        // CORS / R2 / replay warnings belong to the upload, not the Discord step.
        expect(nextPostStatus('idle', 'Warning')).toBe('idle');
    });

    it('opens on Posting and settles on Complete', () => {
        const pending = nextPostStatus('idle', 'Posting');
        expect(pending).toBe('pending');
        expect(nextPostStatus(pending, 'Complete')).toBe('done');
    });

    it('stays pending across repeated Posting updates', () => {
        expect(nextPostStatus('pending', 'Posting')).toBe('pending');
    });

    it('settles as warn when the card or a hook failed, and stays warn', () => {
        const warned = nextPostStatus('pending', 'Warning');
        expect(warned).toBe('warn');
        expect(nextPostStatus(warned, 'Posting')).toBe('warn');
        expect(nextPostStatus(warned, 'Complete')).toBe('warn');
    });

    it('does not reopen once settled', () => {
        expect(nextPostStatus('done', 'Complete')).toBe('done');
    });
});
