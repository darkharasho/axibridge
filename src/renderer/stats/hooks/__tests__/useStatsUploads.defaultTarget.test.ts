import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStatsUploads } from '../useStatsUploads';

describe('useStatsUploads: default publish target', () => {
    const original = (window as any).electronAPI;
    afterEach(() => { (window as any).electronAPI = original; });

    it.each([undefined, []])('still offers the default when githubSites is %j', async (githubSites) => {
        (window as any).electronAPI = {
            getSettings: vi.fn().mockResolvedValue({ githubRepoOwner: 'guild', githubRepoName: 'site', githubSites })
        };
        const { result } = renderHook(() => useStatsUploads({
            logs: [], stats: {}, skillUsageData: {}, activeStatsViewSettings: {}, embedded: false, onWebUpload: vi.fn()
        }));
        await waitFor(() => expect(result.current.webUploadTargets).toHaveLength(1));
        expect(result.current.webUploadTargets[0]).toMatchObject({ fullName: 'guild/site', isDefault: true });
    });
});
