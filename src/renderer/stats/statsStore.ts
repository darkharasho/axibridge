import { create } from 'zustand';
import type { AggregationProgressState, AggregationDiagnosticsState } from './hooks/useStatsAggregationWorker';

// Hash function moved from aggregationCache.ts — used by App.tsx store sync
export function hashAggregationSettings(
    mvpWeights: any,
    statsViewSettings: any,
    disruptionMethod: any,
    excludedFightKeys?: Set<string>
): string {
    // Sorted so the hash depends on which fights are excluded, not on the order
    // the user clicked them.
    const slice = excludedFightKeys && excludedFightKeys.size > 0
        ? [...excludedFightKeys].sort()
        : null;
    const key = JSON.stringify({ mvpWeights, statsViewSettings, disruptionMethod, slice });
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
    /** Character name of the player who led this fight, when someone tagged up.
     *  Drives the slicer's commander filter. Optional on purpose: a sidecar
     *  published before this field existed carries none, and the filter hides
     *  itself rather than guessing. */
    commander?: string;
}

export interface StatsStoreState {
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
        /** Squad CC-applied lane under the DPS area. */
        ccLane: boolean;
        /** Squad boon-strip lane under the DPS area. */
        stripLane: boolean;
        /** Squad CC-taken lane. Folded from the per-entity series, so it goes
         *  absent whenever raw timeline arrays are off, unlike `ccLane`. */
        ccInLane: boolean;
        /** Squad boon-strips-taken lane. Same availability caveat as `ccInLane`. */
        stripInLane: boolean;
        /** Per-member incoming-CC rings on the replay canvas. Off by default:
         *  a squad bomb lands on most of the roster at once, so leaving this
         *  on would keep the map permanently ringed. */
        ccTakenMarks: boolean;
        /** World-units ruler in the map's bottom-left corner. */
        scaleBar: boolean;
        /** Draw players who are currently dead on the map. Off by default:
         *  corpses accumulate for the whole fight and end up outnumbering the
         *  living, and a dead marker sits wherever the body fell rather than
         *  where the player is. The count of what is hidden is shown by the
         *  graveyard tally instead. */
        showDead: boolean;
        heatmap: 'off' | 'deaths' | 'time' | 'damage-taken';
    };
    replaySpotlightParty: number | null;
    /** Whether the CC/strip lanes band under the scrubber is expanded.
     *  Separate from the ccLane/stripLane layer toggles, which say which
     *  lanes exist at all. Collapsed by default: the band is a detail view. */
    replayLanesExpanded: boolean;
    /** Whether the map legend shows its rows or just its header strip.
     *  Expanded by default, unlike the lanes band: the legend is what the
     *  marks on the map mean, which a reader needs before they need anything
     *  else. Collapsing is for someone who already knows. */
    replayLegendExpanded: boolean;
    /** Party groups the user has collapsed in the squad panel. Empty means
     *  every party is expanded, which is the default. */
    replayCollapsedParties: Set<number>;

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
    setReplayLanesExpanded: (expanded: boolean) => void;
    setReplayLegendExpanded: (expanded: boolean) => void;
    toggleReplayPartyCollapsed: (group: number) => void;
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
        ccLane: true,
        stripLane: true,
        ccInLane: true,
        stripInLane: true,
        ccTakenMarks: true,
        scaleBar: true,
        showDead: false,
        heatmap: 'off' as const,
    },
    replaySpotlightParty: null,
    replayLanesExpanded: false,
    replayLegendExpanded: true,
    replayCollapsedParties: new Set<number>(),
    excludedFightKeys: new Set<string>(),
    fightRoster: [] as FightRosterEntry[],
};

/** Shallow-compares two enemyClassCounts maps: same keys, same values. Cheap by
 *  design — mergeFightRoster runs on every aggregation, so this must not deep-clone
 *  or serialize. A fresh object with identical counts still compares equal, which
 *  keeps the no-op path (and its array-identity guarantee) intact. */
function sameEnemyClassCounts(a?: Record<string, number>, b?: Record<string, number>): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => a[key] === b[key]);
}

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
    setReplayLanesExpanded: (expanded) => set({ replayLanesExpanded: expanded }),
    setReplayLegendExpanded: (expanded) => set({ replayLegendExpanded: expanded }),
    toggleReplayPartyCollapsed: (group) => set((state) => {
        // Replace rather than mutate: zustand compares by identity, and a
        // mutated Set would not re-render the squad panel.
        const next = new Set(state.replayCollapsedParties);
        if (next.has(group)) next.delete(group); else next.add(group);
        return { replayCollapsedParties: next };
    }),
    resetReplayLayers: () => set(() => ({
        replayLayers: {
            zoneBorders: true,
            centroidSpread: false, tagRangeRings: false,
            squadHealthStrip: false, partyHulls: false, phases: false,
            rallyRings: false, targetFocusLines: false, damagePulses: false, enemyPulses: false,
            ccLane: true, stripLane: true,
            ccInLane: true, stripInLane: true,
            ccTakenMarks: true,
            scaleBar: true,
            showDead: false,
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
                    && prev.duration === entry.duration
                    && sameEnemyClassCounts(prev.enemyClassCounts, entry.enemyClassCounts);
            });
        return unchanged ? {} : { fightRoster: next };
    }),

    getInitialState: () => initialState,
}));

// Attach getInitialState as a static method for test resets
(useStatsStore as any).getInitialState = () => initialState;
