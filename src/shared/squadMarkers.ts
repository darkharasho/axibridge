/**
 * Squad markers and commander tag colours, from `encounter.markers[]`.
 *
 * arcdps reports a marker as a raw 32-hex content GUID and nothing else.
 * axilog 0.3.10 resolves it against GW2EI's tables and adds `marker_kind`,
 * `marker_label` and `marker_icon` alongside the raw GUID — all three absent
 * together when GW2EI does not know the id, which is a real case: the
 * committed fixture carries one such GUID.
 *
 * Two products come out of the same array:
 *
 * - the commander's **tag colour**, which recolours the local
 *   `commander_tag.svg` instead of drawing a generic white one;
 * - **overhead squad markers** (Arrow, Circle, …), drawn on the replay map.
 *
 * These are kept apart deliberately. A tag is a persistent property of being
 * the commander, while an overhead marker is a transient assignment the
 * commander hands out — conflating them would paint a squad marker on the
 * commander tag or vice versa.
 */

export type MarkerKind = 'squad_marker' | 'commander_tag' | 'catmander_tag';

export interface NativeMarkerAssignment {
    entity_id?: number;
    agent_addr?: number;
    marker?: string;
    marker_kind?: MarkerKind | string;
    marker_label?: string;
    marker_icon?: string;
    time_ms?: number;
}

export interface ResolvedSquadMarker {
    /** `Arrow`, `Circle`, `Heart`, `Square`, `Star`, `Swirl`, `Triangle`, `X`. */
    label: string;
    icon: string;
}

/**
 * The tag colours GW2 offers, as hex.
 *
 * axilog supplies the colour NAME (`Purple`) and a wiki PNG, not a hex value —
 * and the PNG is the wrong thing to draw here, because the app already has its
 * own `commander_tag.svg` whose shape and outline match the rest of the map.
 * So the name is mapped to hex locally and used to recolour that SVG.
 *
 * `Pink` is GW2EI's spelling of the colour the game and its own asset filename
 * both call magenta.
 */
const TAG_COLORS: Record<string, string> = {
    Red: '#e5484d',
    Orange: '#f76b15',
    Yellow: '#ffe629',
    Green: '#46a758',
    Cyan: '#00c2d7',
    Blue: '#3e63dd',
    Purple: '#8e4ec6',
    Pink: '#d6409f',
    White: '#fffdff',
};

const markersOf = (details: any): NativeMarkerAssignment[] => {
    const list = details?.native?.encounter?.markers;
    return Array.isArray(list) ? list : [];
};

const isTag = (kind?: string): boolean =>
    kind === 'commander_tag' || kind === 'catmander_tag';

/**
 * Tag colour per entity id, as a CSS hex string.
 *
 * An entity can appear several times — arcdps re-reports the tag — and the
 * fixture does exactly that. Later assignments win, so a commander who
 * changes tag colour mid-fight ends on the colour they finished with, which
 * is the one the replay's own end state should show.
 */
export const getCommanderTagColors = (details: any): Map<number, string> => {
    const out = new Map<number, string>();
    const byEntity = new Map<number, { time: number; color: string }>();
    for (const m of markersOf(details)) {
        if (typeof m?.entity_id !== 'number' || !isTag(m.marker_kind)) continue;
        const color = m.marker_label ? TAG_COLORS[m.marker_label] : undefined;
        if (!color) continue;
        const time = Number(m.time_ms ?? 0);
        const seen = byEntity.get(m.entity_id);
        if (!seen || time >= seen.time) byEntity.set(m.entity_id, { time, color });
    }
    for (const [id, { color }] of byEntity) out.set(id, color);
    return out;
};

/**
 * Overhead squad marker per entity id.
 *
 * Same last-one-wins rule as tags, for the same reason: a marker moved from
 * one player to another produces two assignments, and the live one is the
 * later.
 */
export const getSquadMarkers = (details: any): Map<number, ResolvedSquadMarker> => {
    const byEntity = new Map<number, { time: number; marker: ResolvedSquadMarker }>();
    for (const m of markersOf(details)) {
        if (typeof m?.entity_id !== 'number' || m.marker_kind !== 'squad_marker') continue;
        if (!m.marker_icon || !m.marker_label) continue;
        const time = Number(m.time_ms ?? 0);
        const seen = byEntity.get(m.entity_id);
        if (seen && time < seen.time) continue;
        byEntity.set(m.entity_id, { time, marker: { label: m.marker_label, icon: m.marker_icon } });
    }
    const out = new Map<number, ResolvedSquadMarker>();
    for (const [id, { marker }] of byEntity) out.set(id, marker);
    return out;
};

/**
 * `commander_tag.svg` recoloured to `color`.
 *
 * The SVG is a black outline plus two `#fffdff` fill paths, so swapping that
 * one fill is the whole recolour — the outline stays, which is what keeps the
 * tag legible against both the light and dark parts of a WvW map.
 *
 * Returns the source unchanged when `color` is falsy, so the caller can pass
 * an unresolved colour without branching.
 */
export const recolorCommanderTag = (svg: string, color?: string): string =>
    color ? svg.replace(/fill:#fffdff/g, `fill:${color}`) : svg;

/** The hex for a GW2EI tag colour name, for callers that have the label already. */
export const tagColorHex = (label?: string): string | undefined =>
    label ? TAG_COLORS[label] : undefined;
