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

describe('useStatsStore — activeCategory slice', () => {
    it('defaults activeCategory to "overview"', () => {
        expect(useStatsStore.getState().activeCategory).toBe('overview');
    });

    it('updates activeCategory', () => {
        useStatsStore.getState().setActiveCategory('offense');
        expect(useStatsStore.getState().activeCategory).toBe('offense');
    });

    it('defaults activeCategory to overview and updates it', () => {
        expect(useStatsStore.getState().activeCategory).toBe('overview');
        useStatsStore.getState().setActiveCategory('defense');
        expect(useStatsStore.getState().activeCategory).toBe('defense');
    });
});

describe('useStatsStore — activeSectionId slice', () => {
    it('defaults activeSectionId to "overview"', () => {
        expect(useStatsStore.getState().activeSectionId).toBe('overview');
    });

    it('updates activeSectionId via setActiveSectionId', () => {
        useStatsStore.getState().setActiveSectionId('on-tag-review');
        expect(useStatsStore.getState().activeSectionId).toBe('on-tag-review');
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

describe('useStatsStore — replayLayers defaults', () => {
    it('shows CC taken marks on the map by default', () => {
        expect(useStatsStore.getState().replayLayers.ccTakenMarks).toBe(true);
    });

    it('restores CC taken marks to on when the layers are reset', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', false);
        useStatsStore.getState().resetReplayLayers();
        expect(useStatsStore.getState().replayLayers.ccTakenMarks).toBe(true);
    });
});
