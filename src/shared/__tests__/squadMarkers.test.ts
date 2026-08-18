import { describe, it, expect } from 'vitest';
import {
    getCommanderTagColors,
    getSquadMarkers,
    recolorCommanderTag,
    tagColorHex,
} from '../squadMarkers';

const details = (markers: any[]) => ({ native: { encounter: { markers } } });

describe('getCommanderTagColors', () => {
    it('maps a resolved tag label to hex', () => {
        const colors = getCommanderTagColors(details([
            { entity_id: 3, marker_kind: 'commander_tag', marker_label: 'Purple', time_ms: 10 },
        ]));
        expect(colors.get(3)).toBe('#8e4ec6');
    });

    it('treats a catmander tag as a tag', () => {
        const colors = getCommanderTagColors(details([
            { entity_id: 4, marker_kind: 'catmander_tag', marker_label: 'Blue', time_ms: 10 },
        ]));
        expect(colors.get(4)).toBe('#3e63dd');
    });

    it('takes the LAST assignment, so a mid-fight colour change ends correct', () => {
        const colors = getCommanderTagColors(details([
            { entity_id: 3, marker_kind: 'commander_tag', marker_label: 'Red', time_ms: 10 },
            { entity_id: 3, marker_kind: 'commander_tag', marker_label: 'Green', time_ms: 99 },
        ]));
        expect(colors.get(3)).toBe('#46a758');
    });

    it('ignores a GUID axilog could not resolve rather than guessing', () => {
        // Real case: the committed fixture carries a GUID GW2EI does not know,
        // so axilog emits the raw `marker` with no kind/label/icon.
        const colors = getCommanderTagColors(details([
            { entity_id: 3, marker: '3cd1c64a5000774488009d4d69455c5c', time_ms: 10 },
        ]));
        expect(colors.size).toBe(0);
    });

    it('ignores a marker on an agent that never became an entity', () => {
        const colors = getCommanderTagColors(details([
            { agent_addr: 999, marker_kind: 'commander_tag', marker_label: 'Red', time_ms: 10 },
        ]));
        expect(colors.size).toBe(0);
    });

    it('does not read a squad marker as a tag', () => {
        const colors = getCommanderTagColors(details([
            { entity_id: 3, marker_kind: 'squad_marker', marker_label: 'Arrow', marker_icon: 'x.png' },
        ]));
        expect(colors.size).toBe(0);
    });

    it('is empty, not throwing, on a log with no native container', () => {
        expect(getCommanderTagColors(undefined).size).toBe(0);
        expect(getCommanderTagColors({}).size).toBe(0);
        expect(getCommanderTagColors({ native: { encounter: {} } }).size).toBe(0);
    });
});

describe('getSquadMarkers', () => {
    it('resolves an overhead marker with its art', () => {
        const markers = getSquadMarkers(details([
            { entity_id: 7, marker_kind: 'squad_marker', marker_label: 'Arrow', marker_icon: 'a.png', time_ms: 5 },
        ]));
        expect(markers.get(7)).toEqual({ label: 'Arrow', icon: 'a.png' });
    });

    it('takes the last assignment, so a marker moved between players lands once', () => {
        const markers = getSquadMarkers(details([
            { entity_id: 7, marker_kind: 'squad_marker', marker_label: 'Star', marker_icon: 's.png', time_ms: 5 },
            { entity_id: 7, marker_kind: 'squad_marker', marker_label: 'X', marker_icon: 'x.png', time_ms: 50 },
        ]));
        expect(markers.get(7)?.label).toBe('X');
    });

    it('does not read a tag as a squad marker', () => {
        const markers = getSquadMarkers(details([
            { entity_id: 3, marker_kind: 'commander_tag', marker_label: 'Purple', marker_icon: 't.png' },
        ]));
        expect(markers.size).toBe(0);
    });

    it('skips an entry with no art, which would render as a broken image', () => {
        const markers = getSquadMarkers(details([
            { entity_id: 7, marker_kind: 'squad_marker', marker_label: 'Arrow', time_ms: 5 },
        ]));
        expect(markers.size).toBe(0);
    });
});

describe('recolorCommanderTag', () => {
    // The SVG's two fill paths are `#fffdff`; the black outline must survive,
    // because it is what keeps the tag legible over a light map.
    const svg = 'a{fill:#000000}b{fill:#fffdff;fill-opacity:1}c{fill:#fffdff}';

    it('swaps every tag fill and leaves the outline alone', () => {
        const out = recolorCommanderTag(svg, '#8e4ec6');
        expect(out).toBe('a{fill:#000000}b{fill:#8e4ec6;fill-opacity:1}c{fill:#8e4ec6}');
    });

    it('returns the source unchanged when the colour is unresolved', () => {
        expect(recolorCommanderTag(svg, undefined)).toBe(svg);
    });
});

describe('tagColorHex', () => {
    it('covers all nine GW2 tag colours', () => {
        const labels = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink', 'White'];
        for (const label of labels) {
            expect(tagColorHex(label), label).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it('returns nothing for a label it does not know', () => {
        expect(tagColorHex('Chartreuse')).toBeUndefined();
        expect(tagColorHex(undefined)).toBeUndefined();
    });
});
