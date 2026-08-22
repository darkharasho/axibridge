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

export interface FightRosterEntry {
    id: string;
    label: string;
    timestamp: number;
    duration: string;
    isWin?: boolean;
    enemyClassCounts?: Record<string, number>;
}

interface StatsStoreState {
    result: any | null;
    inputsHash: string | null;
    progress: AggregationProgressState;
    diagnostics: AggregationDiagnosticsState | null;
    activeCategory: string;
    // Active section within the current category page. Written by the desktop
    // scroll-spy (useStatsNavigation) and by jumps (search palette, data map,
    // subnav clicks); read by CategoryBar/SectionSubnav to drive the highlight.
    activeSectionId: string;
    selectedReplayFightId: string | null;
    replayPlayhead: { timeMs: number; playing: boolean; speed: number };
    replayViewport: { scale: number; tx: number; ty: number; followTarget: string | null };
    replaySelectedParty: number;
    replayLayers: {
        zoneBorders: boolean;
        centroidSpread: boolean;
        tagRangeRings: boolean;
        squadHealthStrip: boolean;
        partyHulls: boolean;
        phases: boolean;
        rallyRings: boolean;
        targetFocusLines: boolean;
        damagePulses: boolean;
        /** Also pulse ENEMY downs/deaths, not just the squad's. Off by
         *  default: on a real WvW log these outnumber squad events ~20:1. */
        enemyPulses: boolean;
        heatmap: 'off' | 'deaths' | 'time' | 'damage-taken';
    };
    replaySpotlightParty: number | null;

    /** Log keys (see statsLogKey) excluded from aggregation. Empty = no slice.
     *  Ephemeral by design: never persisted, dies with the session. */
    excludedFightKeys: Set<string>;

    toggleFightExcluded: (key: string) => void;
    setFightsExcluded: (keys: string[], excluded: boolean) => void;
    clearFightSlice: () => void;
    resetFightSlicing: () => void;

    /** Every fight currently loaded, whether or not the active slice includes it.
     *  The slice picker reads this, not the aggregation — a fight the user has
     *  unchecked leaves the aggregation and would otherwise become un-recheckable. */
    fightRoster: FightRosterEntry[];
    mergeFightRoster: (fights: FightRosterEntry[], validKeys: string[]) => void;

    setResult: (result: any, inputsHash: string) => void;
    setProgress: (progress: AggregationProgressState) => void;
    setDiagnostics: (diagnostics: AggregationDiagnosticsState | null) => void;
    setActiveCategory: (categoryId: string) => void;
    setActiveSectionId: (sectionId: string) => void;
    clearResult: () => void;
    setSelectedReplayFight: (fightId: string | null) => void;
    setReplayPlayhead: (patch: Partial<{ timeMs: number; playing: boolean; speed: number }>) => void;
    setReplayViewport: (patch: Partial<{ scale: number; tx: number; ty: number }>) => void;
    setReplayFollowTarget: (target: string | null) => void;
    setReplaySelectedParty: (party: number) => void;
    resetReplayViewport: () => void;
    setReplayLayer: (key: keyof Omit<StatsStoreState['replayLayers'], 'heatmap'>, value: boolean) => void;
    setReplayHeatmapMode: (mode: StatsStoreState['replayLayers']['heatmap']) => void;
    setReplaySpotlightParty: (party: number | null) => void;
    resetReplayLayers: () => void;
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
    activeCategory: 'overview',
    activeSectionId: 'overview',
    selectedReplayFightId: null,
    replayPlayhead: { timeMs: 0, playing: false, speed: 1 },
    replayViewport: { scale: 3, tx: 0, ty: 0, followTarget: null },
    replaySelectedParty: 0,
    replayLayers: {
        zoneBorders: true,
        centroidSpread: false,
        tagRangeRings: false,
        squadHealthStrip: false,
        partyHulls: false,
        phases: false,
        rallyRings: false,
        targetFocusLines: false,
        damagePulses: false,
        enemyPulses: false,
        heatmap: 'off' as const,
    },
    replaySpotlightParty: null,
    excludedFightKeys: new Set<string>(),
    fightRoster: [] as FightRosterEntry[],
};

export const useStatsStore = create<StatsStoreState>()((set) => ({
    ...initialState,

    setResult: (result, inputsHash) => set({ result, inputsHash }),
    setProgress: (progress) => set({ progress }),
    setDiagnostics: (diagnostics) => set({ diagnostics }),
    setActiveCategory: (categoryId) => set({ activeCategory: categoryId }),
    setActiveSectionId: (sectionId) => set({ activeSectionId: sectionId }),
    clearResult: () => set({ result: null, inputsHash: null }),
    setSelectedReplayFight: (fightId) => set((state) => ({
        selectedReplayFightId: fightId,
        replayPlayhead: { ...state.replayPlayhead, timeMs: 0, playing: false },
        replayViewport: { ...state.replayViewport, followTarget: null },
    })),
    setReplayPlayhead: (patch) => set((state) => ({
        replayPlayhead: { ...state.replayPlayhead, ...patch },
    })),
    setReplayViewport: (patch) => set((state) => ({
        replayViewport: { ...state.replayViewport, ...patch },
    })),
    setReplayFollowTarget: (target) => set((state) => ({
        replayViewport: { ...state.replayViewport, followTarget: target },
    })),
    setReplaySelectedParty: (party) => set({
        replaySelectedParty: Math.max(0, Math.min(5, Math.floor(Number.isFinite(party) ? party : 0))),
    }),
    resetReplayViewport: () => set((state) => ({
        replayViewport: { ...state.replayViewport, scale: 3, tx: 0, ty: 0 },
    })),
    setReplayLayer: (key, value) => set((state) => ({
        replayLayers: { ...state.replayLayers, [key]: value },
    })),
    setReplayHeatmapMode: (mode) => set((state) => ({
        replayLayers: { ...state.replayLayers, heatmap: mode },
    })),
    setReplaySpotlightParty: (party) => set({
        replaySpotlightParty: party === null || !Number.isFinite(party)
            ? null
            : party <= 0
                ? null
                : Math.min(5, Math.floor(party)),
    }),
    resetReplayLayers: () => set(() => ({
        replayLayers: {
            zoneBorders: true,
            centroidSpread: false, tagRangeRings: false,
            squadHealthStrip: false, partyHulls: false, phases: false,
            rallyRings: false, targetFocusLines: false, damagePulses: false, enemyPulses: false,
            heatmap: 'off',
        },
        replaySpotlightParty: null,
    })),
    toggleFightExcluded: (key) => set((state) => {
        const next = new Set(state.excludedFightKeys);
        if (next.has(key)) next.delete(key); else next.add(key);
        return { excludedFightKeys: next };
    }),
    setFightsExcluded: (keys, excluded) => set((state) => {
        const next = new Set(state.excludedFightKeys);
        keys.forEach((key) => { if (excluded) next.add(key); else next.delete(key); });
        return { excludedFightKeys: next };
    }),
    clearFightSlice: () => set({ excludedFightKeys: new Set<string>() }),
    resetFightSlicing: () => set({ excludedFightKeys: new Set<string>(), fightRoster: [] }),

    mergeFightRoster: (fights, validKeys) => set((state) => {
        const valid = new Set(validKeys);
        const byId = new Map<string, FightRosterEntry>();
        state.fightRoster.forEach((entry) => {
            if (valid.has(entry.id)) byId.set(entry.id, entry);
        });
        fights.forEach((entry) => {
            if (entry?.id && valid.has(entry.id)) byId.set(entry.id, entry);
        });
        const next = [...byId.values()].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const unchanged = next.length === state.fightRoster.length
            && next.every((entry, i) => {
                const prev = state.fightRoster[i];
                return prev?.id === entry.id
                    && prev.label === entry.label
                    && prev.isWin === entry.isWin
                    && prev.duration === entry.duration;
            });
        return unchanged ? {} : { fightRoster: next };
    }),

    getInitialState: () => initialState,
}));

// Attach getInitialState as a static method for test resets
(useStatsStore as any).getInitialState = () => initialState;
