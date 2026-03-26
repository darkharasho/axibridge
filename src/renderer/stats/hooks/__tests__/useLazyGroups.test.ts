import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLazyGroups } from '../useLazyGroups';
import { useStatsStore } from '../../statsStore';

// ResizeObserver is mocked globally in src/renderer/test/setup.ts,
// but we need a spy-able version here to verify observer wiring.
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

class MockResizeObserver {
    callback: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
        this.callback = cb;
    }
    observe = mockObserve;
    unobserve = mockUnobserve;
    disconnect = mockDisconnect;
}

// Override the global mock installed by setup.ts with a trackable version.
// @ts-ignore
global.ResizeObserver = MockResizeObserver;

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const GROUPS = [
    { id: 'overview', sectionIds: ['overview', 'fight-breakdown'] },
    { id: 'offense', sectionIds: ['offense-detailed', 'damage-modifiers'] },
    { id: 'defense', sectionIds: ['defense-detailed', 'boon-output'] },
];

// ─── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    useStatsStore.setState((useStatsStore as any).getInitialState());
    vi.clearAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('useLazyGroups — initial mount', () => {
    it('mounts only the active group (overview) on initial render', () => {
        const { result } = renderHook(() => useLazyGroups(GROUPS));
        expect(result.current.isGroupMounted('overview')).toBe(true);
        expect(result.current.isGroupMounted('offense')).toBe(false);
        expect(result.current.isGroupMounted('defense')).toBe(false);
    });

    it('exposes activeNavGroup matching the store default', () => {
        const { result } = renderHook(() => useLazyGroups(GROUPS));
        expect(result.current.activeNavGroup).toBe('overview');
    });
});

describe('useLazyGroups — activeNavGroup changes', () => {
    it('mounts the new group when activeNavGroup changes in the store', () => {
        const { result } = renderHook(() => useLazyGroups(GROUPS));

        act(() => {
            useStatsStore.getState().setActiveNavGroup('offense');
        });

        expect(result.current.isGroupMounted('offense')).toBe(true);
    });

    it('keeps previously mounted groups mounted after nav change', () => {
        const { result } = renderHook(() => useLazyGroups(GROUPS));

        act(() => {
            useStatsStore.getState().setActiveNavGroup('offense');
        });
        act(() => {
            useStatsStore.getState().setActiveNavGroup('defense');
        });

        // All three should now be mounted
        expect(result.current.isGroupMounted('overview')).toBe(true);
        expect(result.current.isGroupMounted('offense')).toBe(true);
        expect(result.current.isGroupMounted('defense')).toBe(true);
    });

    it('accumulates mounted groups — never unmounts visited groups', () => {
        const { result } = renderHook(() => useLazyGroups(GROUPS));

        // Visit offense then go back to overview
        act(() => {
            useStatsStore.getState().setActiveNavGroup('offense');
        });
        act(() => {
            useStatsStore.getState().setActiveNavGroup('overview');
        });

        expect(result.current.isGroupMounted('overview')).toBe(true);
        expect(result.current.isGroupMounted('offense')).toBe(true);
        expect(result.current.isGroupMounted('defense')).toBe(false);
    });
});

describe('useLazyGroups — getPlaceholderHeight', () => {
    it('returns DEFAULT_PLACEHOLDER_HEIGHT (400) when no height is stored', () => {
        const { result } = renderHook(() => useLazyGroups(GROUPS));
        expect(result.current.getPlaceholderHeight('offense')).toBe(400);
    });

    it('returns the stored height when one has been saved in the store', () => {
        useStatsStore.getState().setGroupHeight('offense', 820);
        const { result } = renderHook(() => useLazyGroups(GROUPS));
        expect(result.current.getPlaceholderHeight('offense')).toBe(820);
    });

    it('returns updated height after store update', () => {
        const { result } = renderHook(() => useLazyGroups(GROUPS));

        act(() => {
            useStatsStore.getState().setGroupHeight('defense', 512);
        });

        expect(result.current.getPlaceholderHeight('defense')).toBe(512);
    });
});

describe('useLazyGroups — groupResizeRef', () => {
    it('returns a callback function for a given groupId', () => {
        const { result } = renderHook(() => useLazyGroups(GROUPS));
        const refCallback = result.current.groupResizeRef('overview');
        expect(typeof refCallback).toBe('function');
    });

    it('attaches a ResizeObserver when a DOM element is provided', () => {
        const { result } = renderHook(() => useLazyGroups(GROUPS));
        const refCallback = result.current.groupResizeRef('overview');
        const fakeEl = document.createElement('div');

        act(() => {
            refCallback(fakeEl);
        });

        expect(mockObserve).toHaveBeenCalledWith(fakeEl);
    });

    it('disconnects the observer when null is passed (element unmounted)', () => {
        const { result } = renderHook(() => useLazyGroups(GROUPS));
        const refCallback = result.current.groupResizeRef('overview');
        const fakeEl = document.createElement('div');

        act(() => {
            refCallback(fakeEl);
        });
        act(() => {
            refCallback(null);
        });

        expect(mockDisconnect).toHaveBeenCalled();
    });

    it('disconnects old observer before attaching new one for the same groupId', () => {
        const { result } = renderHook(() => useLazyGroups(GROUPS));
        const refCallback = result.current.groupResizeRef('overview');
        const el1 = document.createElement('div');
        const el2 = document.createElement('div');

        act(() => {
            refCallback(el1);
        });
        const disconnectCountAfterFirst = mockDisconnect.mock.calls.length;

        act(() => {
            refCallback(el2);
        });

        // Should have disconnected the previous observer
        expect(mockDisconnect.mock.calls.length).toBeGreaterThan(disconnectCountAfterFirst);
        expect(mockObserve).toHaveBeenCalledWith(el2);
    });
});
