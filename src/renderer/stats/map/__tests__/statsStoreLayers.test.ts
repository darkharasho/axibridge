import { describe, it, expect, beforeEach } from 'vitest';
import { useStatsStore } from '../../statsStore';

describe('statsStore — replay layers + spotlight', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);  // merge — preserves setters
    });

    it('starts with every toggle off and heatmap off', () => {
        const l = useStatsStore.getState().replayLayers;
        expect(l.centroidSpread).toBe(false);
        expect(l.tagRangeRings).toBe(false);
        expect(l.squadHealthStrip).toBe(false);
        expect(l.partyHulls).toBe(false);
        expect(l.phases).toBe(false);
        expect(l.rallyRings).toBe(false);
        expect(l.targetFocusLines).toBe(false);
        expect(l.damagePulses).toBe(false);
        expect(l.heatmap).toBe('off');
    });

    it('starts with no spotlight party', () => {
        expect(useStatsStore.getState().replaySpotlightParty).toBeNull();
    });

    it('setReplayLayer updates a single boolean toggle', () => {
        useStatsStore.getState().setReplayLayer('centroidSpread', true);
        expect(useStatsStore.getState().replayLayers.centroidSpread).toBe(true);
    });

    it('setReplayHeatmapMode switches heatmap radio', () => {
        useStatsStore.getState().setReplayHeatmapMode('deaths');
        expect(useStatsStore.getState().replayLayers.heatmap).toBe('deaths');
        useStatsStore.getState().setReplayHeatmapMode('off');
        expect(useStatsStore.getState().replayLayers.heatmap).toBe('off');
    });

    it('setReplaySpotlightParty clamps to [1, 5] or null', () => {
        useStatsStore.getState().setReplaySpotlightParty(3);
        expect(useStatsStore.getState().replaySpotlightParty).toBe(3);
        useStatsStore.getState().setReplaySpotlightParty(null);
        expect(useStatsStore.getState().replaySpotlightParty).toBeNull();
        useStatsStore.getState().setReplaySpotlightParty(99);
        expect(useStatsStore.getState().replaySpotlightParty).toBe(5);
        useStatsStore.getState().setReplaySpotlightParty(0);
        expect(useStatsStore.getState().replaySpotlightParty).toBeNull();
    });

    it('resetReplayLayers returns all toggles to default + clears spotlight', () => {
        useStatsStore.getState().setReplayLayer('centroidSpread', true);
        useStatsStore.getState().setReplayLayer('tagRangeRings', true);
        useStatsStore.getState().setReplayHeatmapMode('time');
        useStatsStore.getState().setReplaySpotlightParty(2);
        useStatsStore.getState().resetReplayLayers();
        const l = useStatsStore.getState().replayLayers;
        expect(l.centroidSpread).toBe(false);
        expect(l.tagRangeRings).toBe(false);
        expect(l.heatmap).toBe('off');
        expect(useStatsStore.getState().replaySpotlightParty).toBeNull();
    });

    it('defaults outline detail to standard', () => {
        expect(useStatsStore.getState().replayLayers.outline).toBe('standard');
    });

    it('setReplayOutlineMode updates the outline level', () => {
        useStatsStore.getState().setReplayOutlineMode('high');
        expect(useStatsStore.getState().replayLayers.outline).toBe('high');
        useStatsStore.getState().setReplayOutlineMode('off');
        expect(useStatsStore.getState().replayLayers.outline).toBe('off');
    });

    it('resetReplayLayers restores outline to standard', () => {
        useStatsStore.getState().setReplayOutlineMode('max');
        useStatsStore.getState().resetReplayLayers();
        expect(useStatsStore.getState().replayLayers.outline).toBe('standard');
    });
});
