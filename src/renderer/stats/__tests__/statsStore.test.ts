import { describe, it, expect, beforeEach } from 'vitest';
import { useStatsStore } from '../statsStore';

beforeEach(() => {
    useStatsStore.setState(useStatsStore.getInitialState());
});

describe('useStatsStore — result slice', () => {
    it('starts with null result and null inputsHash', () => {
        const { result, inputsHash } = useStatsStore.getState();
        expect(result).toBeNull();
        expect(inputsHash).toBeNull();
    });

    it('stores result with inputs hash via setResult', () => {
        const fakeResult = { players: [], fights: [] };
        useStatsStore.getState().setResult(fakeResult, 'abc123');
        const { result, inputsHash } = useStatsStore.getState();
        expect(result).toBe(fakeResult);
        expect(inputsHash).toBe('abc123');
    });

    it('clears result via clearResult', () => {
        useStatsStore.getState().setResult({ players: [] }, 'xyz');
        useStatsStore.getState().clearResult();
        const { result, inputsHash } = useStatsStore.getState();
        expect(result).toBeNull();
        expect(inputsHash).toBeNull();
    });
});

describe('useStatsStore — progress slice', () => {
    it('starts with idle progress', () => {
        const { progress } = useStatsStore.getState();
        expect(progress.phase).toBe('idle');
        expect(progress.active).toBe(false);
    });

    it('updates progress via setProgress', () => {
        const newProgress = {
            active: true,
            phase: 'computing' as const,
            streamed: 5,
            total: 10,
            startedAt: 1000,
            completedAt: 0,
        };
        useStatsStore.getState().setProgress(newProgress);
        expect(useStatsStore.getState().progress).toEqual(newProgress);
    });
});

describe('useStatsStore — groupHeights slice', () => {
    it('starts with empty groupHeights', () => {
        expect(useStatsStore.getState().groupHeights).toEqual({});
    });

    it('stores a group height', () => {
        useStatsStore.getState().setGroupHeight('offense', 320);
        expect(useStatsStore.getState().groupHeights['offense']).toBe(320);
    });

    it('preserves other group heights when setting one', () => {
        useStatsStore.getState().setGroupHeight('offense', 320);
        useStatsStore.getState().setGroupHeight('defense', 180);
        const { groupHeights } = useStatsStore.getState();
        expect(groupHeights['offense']).toBe(320);
        expect(groupHeights['defense']).toBe(180);
    });
});

describe('useStatsStore — activeNavGroup slice', () => {
    it('defaults activeNavGroup to "overview"', () => {
        expect(useStatsStore.getState().activeNavGroup).toBe('overview');
    });

    it('updates activeNavGroup', () => {
        useStatsStore.getState().setActiveNavGroup('offense');
        expect(useStatsStore.getState().activeNavGroup).toBe('offense');
    });
});

describe('useStatsStore — diagnostics slice', () => {
    it('starts with null diagnostics', () => {
        expect(useStatsStore.getState().diagnostics).toBeNull();
    });

    it('stores diagnostics', () => {
        const diag = {
            mode: 'worker' as const,
            logsInPayload: 10,
            streamedLogs: 10,
            totalLogs: 10,
            startedAt: 1000,
            completedAt: 2000,
            streamMs: 500,
            computeMs: 500,
            totalMs: 1000,
            flushId: null,
        };
        useStatsStore.getState().setDiagnostics(diag);
        expect(useStatsStore.getState().diagnostics).toEqual(diag);
    });

    it('clears diagnostics by setting null', () => {
        useStatsStore.getState().setDiagnostics({
            mode: 'fallback',
            logsInPayload: 1,
            streamedLogs: 1,
            totalLogs: 1,
            startedAt: 0,
            completedAt: 0,
            streamMs: 0,
            computeMs: 0,
            totalMs: 0,
            flushId: null,
        });
        useStatsStore.getState().setDiagnostics(null);
        expect(useStatsStore.getState().diagnostics).toBeNull();
    });
});
