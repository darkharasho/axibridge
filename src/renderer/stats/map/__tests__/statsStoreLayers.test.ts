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

    it('defaults zoneBorders to true', () => {
        expect(useStatsStore.getState().replayLayers.zoneBorders).toBe(true);
    });

    it('toggles zoneBorders via setReplayLayer and restores true on reset', () => {
        useStatsStore.getState().setReplayLayer('zoneBorders', false);
        expect(useStatsStore.getState().replayLayers.zoneBorders).toBe(false);
        useStatsStore.getState().resetReplayLayers();
        expect(useStatsStore.getState().replayLayers.zoneBorders).toBe(true);
    });
});

describe('statsStore — lanes, party collapse, scale bar', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('lanes start collapsed', () => {
        expect(useStatsStore.getState().replayLanesExpanded).toBe(false);
    });

    it('setReplayLanesExpanded flips the band open and shut', () => {
        useStatsStore.getState().setReplayLanesExpanded(true);
        expect(useStatsStore.getState().replayLanesExpanded).toBe(true);
        useStatsStore.getState().setReplayLanesExpanded(false);
        expect(useStatsStore.getState().replayLanesExpanded).toBe(false);
    });

    it('every party starts expanded (empty collapsed set)', () => {
        expect(useStatsStore.getState().replayCollapsedParties.size).toBe(0);
    });

    it('toggleReplayPartyCollapsed adds then removes a group', () => {
        useStatsStore.getState().toggleReplayPartyCollapsed(2);
        expect(useStatsStore.getState().replayCollapsedParties.has(2)).toBe(true);
        useStatsStore.getState().toggleReplayPartyCollapsed(2);
        expect(useStatsStore.getState().replayCollapsedParties.has(2)).toBe(false);
    });

    it('toggleReplayPartyCollapsed replaces the Set rather than mutating it', () => {
        const before = useStatsStore.getState().replayCollapsedParties;
        useStatsStore.getState().toggleReplayPartyCollapsed(1);
        expect(useStatsStore.getState().replayCollapsedParties).not.toBe(before);
    });

    it('scaleBar layer defaults on', () => {
        expect(useStatsStore.getState().replayLayers.scaleBar).toBe(true);
    });

    it('resetReplayLayers restores scaleBar to on', () => {
        useStatsStore.getState().setReplayLayer('scaleBar', false);
        useStatsStore.getState().resetReplayLayers();
        expect(useStatsStore.getState().replayLayers.scaleBar).toBe(true);
    });
});
