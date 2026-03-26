import { create } from 'zustand';
import type { AggregationProgressState, AggregationDiagnosticsState } from './hooks/useStatsAggregationWorker';

// Hash function moved from aggregationCache.ts — used by App.tsx store sync
export function hashAggregationSettings(mvpWeights: any, statsViewSettings: any, disruptionMethod: any): string {
    const key = JSON.stringify({ mvpWeights, statsViewSettings, disruptionMethod });
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) - hash) + key.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

interface StatsStoreState {
    result: any | null;
    inputsHash: string | null;
    progress: AggregationProgressState;
    diagnostics: AggregationDiagnosticsState | null;
    groupHeights: Record<string, number>;
    activeNavGroup: string;

    setResult: (result: any, inputsHash: string) => void;
    setProgress: (progress: AggregationProgressState) => void;
    setDiagnostics: (diagnostics: AggregationDiagnosticsState | null) => void;
    setGroupHeight: (groupId: string, height: number) => void;
    setActiveNavGroup: (groupId: string) => void;
    clearResult: () => void;
}

const initialState = {
    result: null,
    inputsHash: null,
    progress: {
        active: false,
        phase: 'idle' as const,
        streamed: 0,
        total: 0,
        startedAt: 0,
        completedAt: 0,
    },
    diagnostics: null,
    groupHeights: {},
    activeNavGroup: 'overview',
};

export const useStatsStore = create<StatsStoreState>()((set) => ({
    ...initialState,

    setResult: (result, inputsHash) => set({ result, inputsHash }),
    setProgress: (progress) => set({ progress }),
    setDiagnostics: (diagnostics) => set({ diagnostics }),
    setGroupHeight: (groupId, height) =>
        set((state) => ({
            groupHeights: { ...state.groupHeights, [groupId]: height },
        })),
    setActiveNavGroup: (groupId) => set({ activeNavGroup: groupId }),
    clearResult: () => set({ result: null, inputsHash: null }),
    getInitialState: () => initialState,
}));

// Attach getInitialState as a static method for test resets
(useStatsStore as any).getInitialState = () => initialState;
