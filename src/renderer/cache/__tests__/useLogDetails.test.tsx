import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { useLogDetails } from '../useLogDetails';
import { DetailsCacheProvider } from '../DetailsCacheContext';
import { DetailsCache } from '../DetailsCache';

vi.mock('idb-keyval', () => ({
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
}));

const mockFetcher = vi.fn().mockResolvedValue(null);

function createWrapper() {
    const cache = new DetailsCache({ lruCapacity: 3, fetchDetails: mockFetcher });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <DetailsCacheProvider cache={cache}>{children}</DetailsCacheProvider>
    );
    return { Wrapper, cache };
}

describe('useLogDetails', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns idle status when logId is undefined', () => {
        const { Wrapper } = createWrapper();
        const { result } = renderHook(() => useLogDetails(undefined), { wrapper: Wrapper });
        expect(result.current.status).toBe('idle');
        expect(result.current.details).toBeNull();
    });

    it('returns loaded status on LRU hit', async () => {
        const { Wrapper, cache } = createWrapper();
        await cache.put('log-1', { id: 'cached' });
        const { result } = renderHook(() => useLogDetails('log-1'), { wrapper: Wrapper });
        expect(result.current.status).toBe('loaded');
        expect(result.current.details).toEqual({ id: 'cached' });
    });

    it('returns loading then loaded on cache miss with successful fetch', async () => {
        mockFetcher.mockResolvedValueOnce({ id: 'fetched' });
        const { Wrapper } = createWrapper();
        const { result } = renderHook(() => useLogDetails('log-1'), { wrapper: Wrapper });
        expect(result.current.status).toBe('loading');
        await waitFor(() => {
            expect(result.current.status).toBe('loaded');
        });
        expect(result.current.details).toEqual({ id: 'fetched' });
    });

    it('returns error status when fetch fails', async () => {
        mockFetcher.mockRejectedValueOnce(new Error('network down'));
        const { Wrapper } = createWrapper();
        const { result } = renderHook(() => useLogDetails('log-1'), { wrapper: Wrapper });
        await waitFor(() => {
            expect(result.current.status).toBe('error');
        });
        expect(result.current.details).toBeNull();
    });
});
