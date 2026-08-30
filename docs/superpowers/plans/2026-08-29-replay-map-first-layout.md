# Replay Map-First Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the AxiBridge replay view into a full-bleed map with a floating HUD, so the map is the subject and every panel collapses, explains itself, and stays legible.

**Architecture:** `ReplayView.tsx` (625 lines today) becomes a layout host: it owns the viewport, the playhead, hit-testing and a set of absolutely-positioned HUD children. Two pure-render SVG layers (`MemberLayer`, `ObjectiveLayer`) are extracted out of it. The docked `LayersPanel` / `ReplaySquadPanel` columns become floating cards, the timeline splits into an always-visible scrubber plus a collapsed-by-default lanes band, and `FightPickerBar` is replaced by a centred identity pill.

**Tech Stack:** React 18 + TypeScript, Zustand (`useStatsStore`), inline-style SVG rendering, Vitest + @testing-library/react (jsdom), Vite (three targets: `dist-react/`, `dist-web/`, `dist-electron/`).

**Spec:** `docs/superpowers/specs/2026-08-29-replay-map-first-layout-design.md`

## Global Constraints

- **Vitest parallelism is capped.** Always run tests as `npx vitest run <path> --maxWorkers=2`. Never run the full suite unbounded — this machine runs heavy apps alongside dev work.
- **Nothing in the replay store is persisted.** All new state is session-scoped in `useStatsStore`. Do not add persistence middleware.
- **The "not recorded" dashed-baseline treatment is load-bearing.** Testids `cc-lane-not-recorded`, `cc-in-lane-not-recorded`, `strip-lane-not-recorded`, `strip-in-lane-not-recorded` must survive the timeline split unchanged. They are the only thing distinguishing "series never captured" from "series genuinely all zero".
- **Player markers keep their counter-scaled group.** The `<g transform={...scale(1 / s)}>` wrapper and the `iconR = Math.max(7, 10 - Math.log2(Math.max(1, s)) * 0.5)` formula must not change. This is what keeps icons a constant screen size at any zoom.
- **Class icon SVGs are not square.** Any `<img>` rendering a profession icon needs `style={{ width: N, height: N, objectFit: 'contain' }}` — the HTML `width`/`height` attributes alone let a portrait icon overflow its slot.
- **`src/web/ReplayViewWeb.tsx` re-exports `ReplayView` unchanged.** Every layout change must survive the web report's narrower containers.
- **Condition set is fixed at eight ids** (approved): `738 Vulnerability, 722 Chilled, 727 Immobile, 720 Blind, 742 Weakness, 791 Fear, 721 Crippled, 26766 Slow`.
- **Commit messages end with:**
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
- **Do not push.** Commit locally only; the user pushes.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/renderer/stats/map/layers/MemberLayer.tsx` | All squad/enemy markers: trails, follow ring, profession/commander icon, squad marker, downed cross, hover targets. |
| `src/renderer/stats/map/layers/ObjectiveLayer.tsx` | Landmark dots + labels, owner-tinted, size-tiered. |
| `src/renderer/stats/map/ScaleBar.tsx` | World-units ruler from `pixelsPerInch` + `viewport.scale`. |
| `src/renderer/stats/map/MapLegend.tsx` | "On the map now" card; rows derive from active layers. |
| `src/renderer/stats/map/FightIdentityPill.tsx` | Map name, clock, `N of M`, prev/next, chevron opening the `FightPicker` overlay. |
| `src/renderer/stats/map/TransportBar.tsx` | Play/pause, speed, single clock, scrubber host, lanes toggle. |
| `src/renderer/stats/map/TimelineLanes.tsx` | The four mirrored CC/strip lanes, rendered only when expanded. |
| `src/renderer/stats/map/objectiveTiers.ts` | Pure helper classifying a landmark name as `major` or `minor`. |

**Modified**

| File | Change |
|---|---|
| `src/renderer/stats/statsStore.ts` | `replayLanesExpanded`, `replayCollapsedParties`, `replayLayers.scaleBar` + setters. |
| `src/shared/replayBuffs.ts` | `TRACKED_REPLAY_CONDI_IDS` + `TRACKED_REPLAY_STATE_IDS` union. |
| `src/renderer/stats/incrementalAggregation.ts` | Call site uses the union. |
| `src/renderer/stats/map/ReplayView.tsx` | Layout host, ~250 lines. |
| `src/renderer/stats/map/SyncedTimeline.tsx` | Scrubber only; phase chips become clickable segments. |
| `src/renderer/stats/map/LayersPopover.tsx` | Checkbox rows → wrapping colour-coded chips; inline legends removed. |
| `src/renderer/stats/map/ReplaySquadPanel.tsx` | Per-party collapse, crosshair spotlight, health strip in header, thin scrollbar. |
| `src/renderer/stats/map/PartyMemberCard.tsx` | Denser; condition cluster; skill name dropped. |
| `src/renderer/stats/map/SectorOutlineLayer.tsx` | Lighter stroke. |
| `src/renderer/index.css` | `.replay-scroll` thin-scrollbar class. |
| `src/renderer/test/setup.ts` | `ResizeObserver` stub, if not already present (Task 14 needs it). |

**Deleted**

`src/renderer/stats/map/FightPickerBar.tsx` and `src/renderer/stats/map/__tests__/FightPickerBar.test.tsx` (the test is rewritten as `FightIdentityPill.test.tsx`).

---

### Task 1: Store state for lanes, party collapse, and the scale bar

**Files:**
- Modify: `src/renderer/stats/statsStore.ts`
- Test: `src/renderer/stats/map/__tests__/statsStoreLayers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `replayLanesExpanded: boolean` (default `false`)
  - `setReplayLanesExpanded: (expanded: boolean) => void`
  - `replayCollapsedParties: Set<number>` (default empty — empty means all parties expanded)
  - `toggleReplayPartyCollapsed: (group: number) => void`
  - `replayLayers.scaleBar: boolean` (default `true`)

- [ ] **Step 1: Write the failing tests**

Append to `src/renderer/stats/map/__tests__/statsStoreLayers.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/stats/map/__tests__/statsStoreLayers.test.ts --maxWorkers=2`
Expected: FAIL — `replayLanesExpanded` is `undefined`, `setReplayLanesExpanded` is not a function.

- [ ] **Step 3: Add the state to the store interface**

In `src/renderer/stats/statsStore.ts`, inside the `replayLayers` type literal, add after `ccTakenMarks: boolean;`:

```ts
        /** World-units ruler in the map's bottom-left corner. */
        scaleBar: boolean;
```

Then, immediately after the `replaySpotlightParty: number | null;` field declaration, add:

```ts
    /** Whether the CC/strip lanes band under the scrubber is expanded.
     *  Separate from the ccLane/stripLane layer toggles, which say which
     *  lanes exist at all. Collapsed by default: the band is a detail view. */
    replayLanesExpanded: boolean;
    /** Party groups the user has collapsed in the squad panel. Empty means
     *  every party is expanded, which is the default. */
    replayCollapsedParties: Set<number>;
```

And in the setter declarations block, after `setReplaySpotlightParty: ...;`, add:

```ts
    setReplayLanesExpanded: (expanded: boolean) => void;
    toggleReplayPartyCollapsed: (group: number) => void;
```

- [ ] **Step 4: Add the initial values**

In `initialState`, add `scaleBar: true,` to the `replayLayers` literal (put it directly after `ccTakenMarks: true,`), and after `replaySpotlightParty: null,` add:

```ts
    replayLanesExpanded: false,
    replayCollapsedParties: new Set<number>(),
```

- [ ] **Step 5: Add the setters and update resetReplayLayers**

In the `create<StatsStoreState>()` body, after `setReplaySpotlightParty`, add:

```ts
    setReplayLanesExpanded: (expanded) => set({ replayLanesExpanded: expanded }),
    toggleReplayPartyCollapsed: (group) => set((state) => {
        // Replace rather than mutate: zustand compares by identity, and a
        // mutated Set would not re-render the squad panel.
        const next = new Set(state.replayCollapsedParties);
        if (next.has(group)) next.delete(group); else next.add(group);
        return { replayCollapsedParties: next };
    }),
```

In `resetReplayLayers`, add `scaleBar: true,` to the returned `replayLayers` literal (after `ccTakenMarks: true,`).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/statsStoreLayers.test.ts src/renderer/stats/map/__tests__/statsStoreReplay.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/statsStore.ts src/renderer/stats/map/__tests__/statsStoreLayers.test.ts
git commit -m "feat(replay): add lanes-expanded, party-collapse and scale-bar state

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Track conditions in the replay payload

**Files:**
- Modify: `src/shared/replayBuffs.ts`
- Modify: `src/renderer/stats/incrementalAggregation.ts:60` (import) and `:171` (call site)
- Test: `src/shared/__tests__/replayBuffs.test.ts` (create)

**Interfaces:**
- Consumes: `TRACKED_REPLAY_BUFF_IDS` (existing).
- Produces:
  - `TRACKED_REPLAY_CONDI_IDS: Set<number>` — the eight ids.
  - `TRACKED_REPLAY_STATE_IDS: Set<number>` — the union, consumed by `buildReplayFightPayload`.
  - `isReplayCondition(id: number): boolean` — used by `PartyMemberCard` in Task 12 to split the buff row.

`buildMovementData` filters both `member.boonStates` and `movementData.boonIcons` through the same `trackedBuffIds` set, so passing the union is the whole plumbing change — condition icons resolve from the same `catalogs.buffs` catalog with no extra work.

- [ ] **Step 1: Write the failing test**

Create `src/shared/__tests__/replayBuffs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
    TRACKED_REPLAY_BUFF_IDS,
    TRACKED_REPLAY_CONDI_IDS,
    TRACKED_REPLAY_STATE_IDS,
    isReplayCondition,
} from '../replayBuffs';

describe('replay tracked buff sets', () => {
    it('tracks exactly the eight approved conditions', () => {
        expect([...TRACKED_REPLAY_CONDI_IDS].sort((a, b) => a - b))
            .toEqual([720, 721, 722, 727, 738, 742, 791, 26766]);
    });

    it('excludes damage conditions by design', () => {
        // Bleeding 736, Burning 737, Poison 723, Torment 19426, Confusion 861.
        for (const id of [736, 737, 723, 19426, 861]) {
            expect(TRACKED_REPLAY_CONDI_IDS.has(id)).toBe(false);
        }
    });

    it('keeps boons and conditions disjoint', () => {
        for (const id of TRACKED_REPLAY_CONDI_IDS) {
            expect(TRACKED_REPLAY_BUFF_IDS.has(id)).toBe(false);
        }
    });

    it('the union is every boon plus every condition', () => {
        expect(TRACKED_REPLAY_STATE_IDS.size)
            .toBe(TRACKED_REPLAY_BUFF_IDS.size + TRACKED_REPLAY_CONDI_IDS.size);
        for (const id of TRACKED_REPLAY_BUFF_IDS) expect(TRACKED_REPLAY_STATE_IDS.has(id)).toBe(true);
        for (const id of TRACKED_REPLAY_CONDI_IDS) expect(TRACKED_REPLAY_STATE_IDS.has(id)).toBe(true);
    });

    it('isReplayCondition separates the two clusters', () => {
        expect(isReplayCondition(738)).toBe(true);   // Vulnerability
        expect(isReplayCondition(740)).toBe(false);  // Might
        expect(isReplayCondition(99999)).toBe(false);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shared/__tests__/replayBuffs.test.ts --maxWorkers=2`
Expected: FAIL — `TRACKED_REPLAY_CONDI_IDS` is not exported.

- [ ] **Step 3: Extend `src/shared/replayBuffs.ts`**

Append to the file (leave `TRACKED_REPLAY_BUFF_IDS` exactly as it is):

```ts
/**
 * Conditions worth rendering on a replay member card. Curated, not
 * exhaustive: every tracked id adds a per-member state series to
 * `movementData`, and `replayFights` is already ~66% of `report.json`.
 *
 * These eight are the ones that change what a player can *do* in a WvW
 * fight. Damage conditions (Bleeding, Burning, Poison, Torment, Confusion)
 * are deliberately excluded — five more series per member to say something
 * the health bar already says.
 */
export const TRACKED_REPLAY_CONDI_IDS: Set<number> = new Set([
    738,   // Vulnerability
    722,   // Chilled
    727,   // Immobile
    720,   // Blind
    742,   // Weakness
    791,   // Fear
    721,   // Crippled
    26766, // Slow
]);

/**
 * What `buildMovementData` actually filters on. Boons and conditions share
 * one `buffUptimes` stream and one icon catalog, so they are tracked with a
 * single set and split again at render time by {@link isReplayCondition}.
 */
export const TRACKED_REPLAY_STATE_IDS: Set<number> = new Set([
    ...TRACKED_REPLAY_BUFF_IDS,
    ...TRACKED_REPLAY_CONDI_IDS,
]);

/** True when `id` is one of the tracked conditions rather than a boon. */
export function isReplayCondition(id: number): boolean {
    return TRACKED_REPLAY_CONDI_IDS.has(id);
}
```

- [ ] **Step 4: Point the aggregation call site at the union**

In `src/renderer/stats/incrementalAggregation.ts`, change line 60 from:

```ts
import { TRACKED_REPLAY_BUFF_IDS } from '../../shared/replayBuffs';
```

to:

```ts
import { TRACKED_REPLAY_STATE_IDS } from '../../shared/replayBuffs';
```

and line 171 from:

```ts
        trackedBuffIds: TRACKED_REPLAY_BUFF_IDS,
```

to:

```ts
        trackedBuffIds: TRACKED_REPLAY_STATE_IDS,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/shared/__tests__/replayBuffs.test.ts src/shared/__tests__/movementData.test.ts src/renderer/stats/map/__tests__/replayPayload.test.ts --maxWorkers=2`
Expected: PASS. If `replayPayload.test.ts` fails on a boon-count assertion, the fixture now legitimately carries more ids — update the expected count, do not narrow the set.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean. (`TRACKED_REPLAY_BUFF_IDS` is still exported and still used by tests, so nothing else breaks.)

- [ ] **Step 7: Commit**

```bash
git add src/shared/replayBuffs.ts src/shared/__tests__/replayBuffs.test.ts src/renderer/stats/incrementalAggregation.ts
git commit -m "feat(replay): track eight control conditions in the movement payload

Damage conditions stay out: five more per-member series for what the
health bar already shows, against a payload that is already ~66%
replayFights.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Extract `MemberLayer` from `ReplayView`

This is a **verbatim** extraction. Do not restyle anything. The point is a diff a reviewer can read.

**Files:**
- Create: `src/renderer/stats/map/layers/MemberLayer.tsx`
- Modify: `src/renderer/stats/map/ReplayView.tsx` (removes the member-rendering block, `sampleAt`, `inAnyRange`, the commander-tag URI cache and the `enemy-tint` filter def)
- Test: `src/renderer/stats/map/__tests__/MemberLayer.test.tsx` (create)

**Interfaces:**
- Consumes: `SquadMemberMovement` from `src/shared/movementData`, `orderMembersForRender` from `./replaySelectors`, `memberSpec` from `./partyMemberHelpers`, `getProfessionIconPath` from `src/renderer/classIconUtils`.
- Produces:
  ```ts
  export interface MemberHoverInfo {
      name: string;
      account: string;
      status: 'down' | 'dead' | null;
      clientX: number;
      clientY: number;
  }
  export interface MemberLayerProps {
      members: SquadMemberMovement[];
      pollFrac: number;
      pollIndex: number;
      timeMs: number;
      scale: number;
      spotlightParty: number | null;
      followKey: string | null;
      onHover: (info: MemberHoverInfo) => void;
      onLeave: () => void;
  }
  export const MemberLayer: React.FC<MemberLayerProps>;
  export function sampleAt(member: SquadMemberMovement, pollFrac: number): [number, number] | null;
  ```
  `MemberLayer` also renders the `<defs>` holding `filter#enemy-tint`, so the filter travels with its only consumer.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/MemberLayer.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemberLayer, sampleAt } from '../layers/MemberLayer';
import type { SquadMemberMovement } from '../../../../shared/movementData';

let nextId = 1;
const mkMember = (o: Partial<SquadMemberMovement> = {}): SquadMemberMovement => ({
    id: nextId++,
    name: 'Player', account: 'P.1', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [[10, 10], [20, 20]], downRanges: [], deadRanges: [], ...o,
});

const renderLayer = (members: SquadMemberMovement[], props: Partial<React.ComponentProps<typeof MemberLayer>> = {}) =>
    render(
        <svg>
            <MemberLayer
                members={members}
                pollFrac={0}
                pollIndex={0}
                timeMs={0}
                scale={3}
                spotlightParty={null}
                followKey={null}
                onHover={() => {}}
                onLeave={() => {}}
                {...props}
            />
        </svg>,
    );

describe('sampleAt', () => {
    it('returns null for a member with no positions', () => {
        expect(sampleAt(mkMember({ positions: [] }), 0)).toBeNull();
    });

    it('lerps between bracketing samples', () => {
        expect(sampleAt(mkMember({ positions: [[0, 0], [10, 20]] }), 0.5)).toEqual([5, 10]);
    });

    it('clamps past the last sample', () => {
        expect(sampleAt(mkMember({ positions: [[0, 0], [10, 20]] }), 9)).toEqual([10, 20]);
    });
});

describe('MemberLayer', () => {
    it('renders one group per member', () => {
        const { container } = renderLayer([mkMember({ name: 'A' }), mkMember({ name: 'B' })]);
        expect(container.querySelectorAll('[data-member-id]').length).toBe(2);
    });

    it('skips members with no position sample', () => {
        const { container } = renderLayer([mkMember({ positions: [] })]);
        expect(container.querySelectorAll('[data-member-id]').length).toBe(0);
    });

    it('counter-scales the icon group so icons stay a constant screen size', () => {
        const { container } = renderLayer([mkMember()], { scale: 4 });
        const g = container.querySelector('[data-member-icon]');
        expect(g?.getAttribute('transform')).toContain('scale(0.25)');
    });

    it('dims members outside the spotlight party', () => {
        const { container } = renderLayer(
            [mkMember({ group: 1 }), mkMember({ group: 2 })],
            { spotlightParty: 1 },
        );
        const opacities = [...container.querySelectorAll('[data-member-id]')]
            .map(el => el.getAttribute('opacity'));
        expect(opacities).toContain('1');
        expect(opacities).toContain('0.2');
    });

    it('emits the enemy-tint filter definition', () => {
        const { container } = renderLayer([mkMember({ isEnemy: true, inSquad: false })]);
        expect(container.querySelector('filter#enemy-tint')).not.toBeNull();
    });

    it('calls onHover with the member identity and status', () => {
        const onHover = vi.fn();
        const { container } = renderLayer(
            [mkMember({ name: 'Alice', account: 'Alice.1', downRanges: [[0, 5000]] })],
            { onHover, timeMs: 1000 },
        );
        const g = container.querySelector('[data-member-id]') as SVGGElement;
        g.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 42, clientY: 7 }));
        expect(onHover).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Alice', account: 'Alice.1', status: 'down',
        }));
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/MemberLayer.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `../layers/MemberLayer`.

- [ ] **Step 3: Create the layer**

Create `src/renderer/stats/map/layers/MemberLayer.tsx`. Move these blocks out of `ReplayView.tsx` **without editing their bodies**: the `svgDataUri` helper, `COMMANDER_TAG_URI`, `tagUriCache`, `commanderTagUri`, `inAnyRange`, `sampleAt`, the `<defs><filter id="enemy-tint">` block, and the whole `orderMembersForRender(...).map(member => {...})` expression.

```tsx
import React from 'react';
import { getProfessionIconPath } from '../../../classIconUtils';
import { memberSpec } from '../partyMemberHelpers';
import { orderMembersForRender } from '../replaySelectors';
import { recolorCommanderTag } from '../../../../shared/squadMarkers';
import commanderTagRaw from '../../../../../public/svg/commander_tag.svg?raw';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const svgDataUri = (svg: string) =>
    `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
const COMMANDER_TAG_URI = svgDataUri(commanderTagRaw);

/**
 * One data URI per tag colour, built once. Recolouring inside the render loop
 * would re-base64 the whole SVG for every commander on every frame.
 */
const tagUriCache = new Map<string, string>();
const commanderTagUri = (color?: string) => {
    if (!color) return COMMANDER_TAG_URI;
    let uri = tagUriCache.get(color);
    if (!uri) {
        uri = svgDataUri(recolorCommanderTag(commanderTagRaw, color));
        tagUriCache.set(color, uri);
    }
    return uri;
};

/** Return true if timeMs falls within any of the given [startMs, endMs] ranges. */
function inAnyRange(ranges: [number, number][], timeMs: number): boolean {
    return ranges.some(([start, end]) => timeMs >= start && timeMs < end);
}

/** Linearly interpolate between the two bracketing position samples for smooth movement. */
export function sampleAt(member: SquadMemberMovement, pollFrac: number): [number, number] | null {
    const { positions } = member;
    if (!positions.length) return null;
    const lo = Math.max(0, Math.min(Math.floor(pollFrac), positions.length - 1));
    const t = pollFrac - Math.floor(pollFrac);
    if (t === 0 || lo >= positions.length - 1) return positions[lo];
    const a = positions[lo];
    const b = positions[lo + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export interface MemberHoverInfo {
    name: string;
    account: string;
    status: 'down' | 'dead' | null;
    clientX: number;
    clientY: number;
}

export interface MemberLayerProps {
    members: SquadMemberMovement[];
    pollFrac: number;
    pollIndex: number;
    timeMs: number;
    scale: number;
    spotlightParty: number | null;
    /** `account || name` of the followed member, or null. */
    followKey: string | null;
    onHover: (info: MemberHoverInfo) => void;
    onLeave: () => void;
}

export const MemberLayer: React.FC<MemberLayerProps> = ({
    members, pollFrac, pollIndex, timeMs, scale, spotlightParty, followKey, onHover, onLeave,
}) => (
    <>
        <defs>
            {/* Tints the icon toward red by boosting the red channel and suppressing green/blue */}
            <filter id="enemy-tint" colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values="
                    1.2  0.1  0.1  0  0.15
                    0    0.1  0    0  0
                    0    0    0.1  0  0
                    0    0    0    1  0
                " />
            </filter>
        </defs>
        {orderMembersForRender(members.filter(m => m.inSquad || m.isEnemy)).map(member => {
            const pos = sampleAt(member, pollFrac);
            if (!pos) return null;
            const isDead = inAnyRange(member.deadRanges, timeMs);
            const isDown = !isDead && inAnyRange(member.downRanges, timeMs);
            const dim = spotlightParty !== null && !member.isEnemy && member.group !== spotlightParty;
            const trail = isDead ? [] : member.positions.slice(Math.max(0, pollIndex - 20), pollIndex + 1);
            const recent = isDead ? [] : member.positions.slice(Math.max(0, pollIndex - 5), pollIndex + 1);
            const trailStr = trail.map(p => `${p[0]},${p[1]}`).join(' ');
            const recentStr = recent.map(p => `${p[0]},${p[1]}`).join(' ');
            const color = member.isEnemy ? '#ef4444' : member.isCommander ? '#fbbf24' : '#60a5fa';
            const isFollow = !!followKey && (member.account || member.name) === followKey;
            // All sizes are divided by `scale` so they stay a constant pixel
            // size on screen regardless of zoom level.
            const s = scale;
            const sw = 1 / s;
            const sw15 = 1.5 / s;
            // iconR is in screen-pixel units (the scale(1/s) counter-transform
            // on the icon group makes it render at exactly iconR*2 px).
            // We shrink it slightly as zoom increases so icons don't crowd
            // the map when zoomed in — from 20px at s=1 to ~14px at s=50.
            const iconR = Math.max(7, 10 - Math.log2(Math.max(1, s)) * 0.5);
            const ringR = 16 / s;
            const baseOpacity = isDead ? 0.12 : isDown ? 0.45 : dim ? 0.2 : member.isEnemy ? 0.75 : 1;

            return (
                <g
                    key={member.id}
                    data-member-id={member.id}
                    opacity={baseOpacity}
                    onMouseEnter={(e) => onHover({
                        name: member.name,
                        account: member.account,
                        status: isDead ? 'dead' : isDown ? 'down' : null,
                        clientX: e.clientX,
                        clientY: e.clientY,
                    })}
                    onMouseLeave={onLeave}
                >
                    {trail.length > 1 && <polyline points={trailStr} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={sw} strokeDasharray={`${2 / s} ${2 / s}`} />}
                    {recent.length > 1 && <polyline points={recentStr} fill="none" stroke={color} strokeOpacity={0.6} strokeWidth={sw15} />}
                    {isFollow && <circle cx={pos[0]} cy={pos[1]} r={ringR} fill="none" stroke="#fbbf24" strokeWidth={sw15} strokeOpacity={0.8} />}
                    {/* Counter-scaled group so the <image> always has fixed
                        20x20 local dimensions. Without this, sub-pixel
                        dimensions at high zoom cause browsers to silently
                        skip rendering the image. */}
                    <g data-member-icon transform={`translate(${pos[0]} ${pos[1]}) scale(${1 / s})`}>
                        {member.isCommander ? (
                            <image
                                href={commanderTagUri(member.tagColor)}
                                x={-iconR} y={-iconR}
                                width={iconR * 2} height={iconR * 2}
                            />
                        ) : member.isEnemy ? (
                            (() => {
                                const iconSrc = getProfessionIconPath(memberSpec(member));
                                const er = iconR * 0.75; // enemies 25% smaller than allies
                                return iconSrc
                                    ? <image href={iconSrc} x={-er} y={-er} width={er * 2} height={er * 2} filter="url(#enemy-tint)" />
                                    : <circle cx={0} cy={0} r={er} fill="#ef4444" opacity={0.8} />;
                            })()
                        ) : (
                            (() => {
                                const iconSrc = getProfessionIconPath(memberSpec(member));
                                return iconSrc
                                    ? <image href={iconSrc} x={-iconR} y={-iconR} width={iconR * 2} height={iconR * 2} />
                                    : <circle cx={0} cy={0} r={iconR} fill="#60a5fa" opacity={0.9} />;
                            })()
                        )}
                        {/* Overhead squad marker, above the icon so it reads as
                            an overhead marker does in game and never covers the
                            profession art or the downed cross. Drawn for
                            commanders too: a tag says who leads, a marker is a
                            separate assignment they can also carry. */}
                        {member.squadMarker && (
                            <image
                                href={member.squadMarker.icon}
                                x={-iconR * 0.6}
                                y={-iconR * 2.2}
                                width={iconR * 1.2}
                                height={iconR * 1.2}
                            >
                                <title>{member.squadMarker.label}</title>
                            </image>
                        )}
                        {isDown && !member.isEnemy && (
                            <>
                                <line x1={-iconR * 0.55} y1={0} x2={iconR * 0.55} y2={0} stroke="#f97316" strokeWidth={sw15 * 1.5 * s} strokeLinecap="round" />
                                <line x1={0} y1={-iconR * 0.55} x2={0} y2={iconR * 0.55} stroke="#f97316" strokeWidth={sw15 * 1.5 * s} strokeLinecap="round" />
                            </>
                        )}
                    </g>
                </g>
            );
        })}
    </>
);

export default MemberLayer;
```

- [ ] **Step 4: Rewire `ReplayView` to use it**

In `src/renderer/stats/map/ReplayView.tsx`:
- Delete `svgDataUri`, `COMMANDER_TAG_URI`, `tagUriCache`, `commanderTagUri`, `inAnyRange`, `sampleAt`, and the two now-unused imports (`commanderTagRaw`, `recolorCommanderTag`).
- Import `sampleAt` and `MemberLayer` from `./layers/MemberLayer` — `ReplayView` still calls `sampleAt` in the fight-switch centring effect and the follow-centring effect.
- Delete the `<defs>` block and the whole `orderMembersForRender(...)` expression from the SVG; replace with:

```tsx
                                    <MemberLayer
                                        members={selectedFight.movementData.members}
                                        pollFrac={pollFrac}
                                        pollIndex={pollIndex}
                                        timeMs={playhead.timeMs}
                                        scale={viewport.scale}
                                        spotlightParty={spotlightParty}
                                        followKey={followMember ? (followMember.account || followMember.name) : null}
                                        onHover={(info) => {
                                            const rect = mapContainerRef.current?.getBoundingClientRect();
                                            if (!rect) return;
                                            setTooltip({
                                                name: info.name, account: info.account, status: info.status,
                                                x: info.clientX - rect.left, y: info.clientY - rect.top,
                                            });
                                        }}
                                        onLeave={() => setTooltip(null)}
                                    />
```

Keep `MemberLayer` in the same position in the child order it occupied before — after `GroundMarkerLayer` and the landmark block, before `SquadOverlay`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/MemberLayer.test.tsx src/renderer/stats/map/__tests__/replaySelectors.test.ts src/renderer/stats/map/__tests__/replaySelectors.orderMembers.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/map/layers/MemberLayer.tsx src/renderer/stats/map/ReplayView.tsx src/renderer/stats/map/__tests__/MemberLayer.test.tsx
git commit -m "refactor(replay): extract MemberLayer from ReplayView

Verbatim move: no marker geometry, opacity or scaling changed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Extract and restyle `ObjectiveLayer`; lighten sector outlines

**Files:**
- Create: `src/renderer/stats/map/objectiveTiers.ts`
- Create: `src/renderer/stats/map/layers/ObjectiveLayer.tsx`
- Modify: `src/renderer/stats/map/ReplayView.tsx` (removes the landmark block and `landmarkOwners` memo)
- Modify: `src/renderer/stats/map/SectorOutlineLayer.tsx:43,64`
- Test: `src/renderer/stats/map/__tests__/ObjectiveLayer.test.tsx` (create)

**Interfaces:**
- Consumes: `WVW_LANDMARKS`, `sectorIdAt`, `OWNER_COLORS`, `WvwOwner`, `WvwMap`.
- Produces:
  ```ts
  export type ObjectiveTier = 'major' | 'minor';
  export function objectiveTier(name: string): ObjectiveTier;   // objectiveTiers.ts
  export interface ObjectiveLayerProps {
      mapKey: WvwMap | null;
      sectorOwners?: Record<number, WvwOwner> | null;
  }
  export const ObjectiveLayer: React.FC<ObjectiveLayerProps>;
  ```

Objectives shrink from a 6px dot with a black-stroked 9px white label to a 5px/3.5px dot with a letter-spaced muted label. The label may now be occluded by the squad, which is correct at fight zoom — a name is context, the squad is the subject.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/ObjectiveLayer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ObjectiveLayer } from '../layers/ObjectiveLayer';
import { objectiveTier } from '../objectiveTiers';

describe('objectiveTier', () => {
    it('classifies keeps, towers and the castle as major', () => {
        expect(objectiveTier('Overlook Keep')).toBe('major');
        expect(objectiveTier('Cliffside Tower')).toBe('major');
        expect(objectiveTier('Stonemist Castle')).toBe('major');
    });

    it('classifies camps and ruins as minor', () => {
        expect(objectiveTier('Golanta Clearing')).toBe('minor');
        expect(objectiveTier('Temple of Lost Prayers')).toBe('minor');
    });
});

describe('ObjectiveLayer', () => {
    it('renders nothing without a map key', () => {
        const { container } = render(<svg><ObjectiveLayer mapKey={null} /></svg>);
        expect(container.querySelectorAll('[data-objective]').length).toBe(0);
    });

    it('sizes major objectives larger than minor ones', () => {
        const { container } = render(<svg><ObjectiveLayer mapKey="EternalBattlegrounds" /></svg>);
        const dots = [...container.querySelectorAll('[data-objective]')];
        expect(dots.length).toBeGreaterThan(0);
        const radii = new Set(dots.map(d => d.querySelector('circle')?.getAttribute('r')));
        expect(radii).toContain('5');
        expect(radii).toContain('3.5');
    });

    it('does not paint labels with a heavy black stroke', () => {
        const { container } = render(<svg><ObjectiveLayer mapKey="EternalBattlegrounds" /></svg>);
        const label = container.querySelector('[data-objective] text');
        expect(label?.getAttribute('stroke')).toBeNull();
    });
});
```

If `EternalBattlegrounds` is not the exact `WvwMap` key in this repo, read `src/shared/wvwLandmarks.ts` and substitute the real key — do not change the assertions.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/ObjectiveLayer.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `../objectiveTiers`.

- [ ] **Step 3: Write the tier helper**

Create `src/renderer/stats/map/objectiveTiers.ts`:

```ts
export type ObjectiveTier = 'major' | 'minor';

/**
 * Keeps, towers and the castle are structures a squad fights *over*; camps
 * and ruins are waypoints it passes through. Only the first group earns a
 * label loud enough to compete with the squad at fight zoom.
 */
export function objectiveTier(name: string): ObjectiveTier {
    return /\b(keep|tower|castle|garrison)\b/i.test(name) ? 'major' : 'minor';
}
```

- [ ] **Step 4: Write the layer**

Create `src/renderer/stats/map/layers/ObjectiveLayer.tsx`:

```tsx
import React, { useMemo } from 'react';
import { WVW_LANDMARKS, type WvwMap } from '../../../../shared/wvwLandmarks';
import { sectorIdAt } from '../../../../shared/sectorLookup';
import { OWNER_COLORS } from '../SectorOutlineLayer';
import { objectiveTier } from '../objectiveTiers';
import type { WvwOwner } from '../../../../shared/wvwSectors';

export interface ObjectiveLayerProps {
    mapKey: WvwMap | null;
    sectorOwners?: Record<number, WvwOwner> | null;
}

export const ObjectiveLayer: React.FC<ObjectiveLayerProps> = ({ mapKey, sectorOwners }) => {
    // Owner of each landmark's containing sector — tints the marker and label
    // like the in-game map. Empty when ownership is unknown.
    const owners = useMemo(() => {
        const out: Record<string, Exclude<WvwOwner, 'Neutral'>> = {};
        if (!mapKey || !sectorOwners) return out;
        for (const lm of WVW_LANDMARKS[mapKey] ?? []) {
            const sectorId = sectorIdAt(mapKey, lm.x, lm.y);
            const owner = sectorId !== undefined ? sectorOwners[sectorId] : undefined;
            if (owner && owner !== 'Neutral') out[lm.name] = owner;
        }
        return out;
    }, [mapKey, sectorOwners]);

    if (!mapKey) return null;

    return (
        <>
            {(WVW_LANDMARKS[mapKey] ?? []).map(lm => {
                const owner = owners[lm.name];
                const ownerColor = owner ? OWNER_COLORS[owner] : null;
                const tier = objectiveTier(lm.name);
                const r = tier === 'major' ? 5 : 3.5;
                return (
                    <g key={lm.name} data-objective data-tier={tier} opacity={ownerColor ? 0.85 : 0.55}>
                        <circle cx={lm.x} cy={lm.y} r={r}
                                fill={ownerColor ?? 'rgba(15,23,42,0.7)'}
                                stroke="rgba(255,255,255,0.55)" strokeWidth={0.8} />
                        {/* No paint-order stroke: a black-outlined white label
                            was the loudest element on the map. Occlusion by the
                            squad at fight zoom is the correct trade. */}
                        <text x={lm.x + r + 3} y={lm.y + 3}
                              fontSize={9} letterSpacing="0.06em"
                              fill={ownerColor ?? 'rgba(203,213,225,0.75)'}
                              opacity={tier === 'major' ? 0.9 : 0.6}>
                            {lm.name}
                        </text>
                    </g>
                );
            })}
        </>
    );
};

export default ObjectiveLayer;
```

- [ ] **Step 5: Rewire `ReplayView` and lighten the sector outlines**

In `ReplayView.tsx`: delete the `landmarkOwners` `useMemo` and the `{selectedFight.mapKey && (WVW_LANDMARKS[...]).map(...)}` block; delete the now-unused `WVW_LANDMARKS`, `sectorIdAt`, `OWNER_COLORS` and `WvwOwner` imports. Replace the deleted block with:

```tsx
                                    <ObjectiveLayer
                                        mapKey={selectedFight.mapKey}
                                        sectorOwners={selectedFight.sectorOwners}
                                    />
```

In `SectorOutlineLayer.tsx`, change line 43 and the `strokeOpacity` on line 64 so ownership reads as a tint rather than a set of hard borders across the fight:

```tsx
    // 1.6 screen px inner-aligned (2x the target, clipped to the interior).
    const strokeWidth = 3.2 / scale;
```
```tsx
                        strokeOpacity={0.45}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/ObjectiveLayer.test.tsx src/renderer/stats/map/__tests__/SectorOutlineLayer.test.tsx --maxWorkers=2`
Expected: PASS. If `SectorOutlineLayer.test.tsx` asserts the old `4 / scale` width or `0.9` opacity, update those expectations to `3.2 / scale` and `0.45`.

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/renderer/stats/map/objectiveTiers.ts src/renderer/stats/map/layers/ObjectiveLayer.tsx src/renderer/stats/map/ReplayView.tsx src/renderer/stats/map/SectorOutlineLayer.tsx src/renderer/stats/map/__tests__/ObjectiveLayer.test.tsx src/renderer/stats/map/__tests__/SectorOutlineLayer.test.tsx
git commit -m "refactor(replay): extract ObjectiveLayer and quiet the map furniture

Objective labels lose their black paint-order stroke and split into
major/minor tiers; sector outlines drop to a tint.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `ScaleBar`

**Files:**
- Create: `src/renderer/stats/map/ScaleBar.tsx`
- Test: `src/renderer/stats/map/__tests__/ScaleBar.test.tsx` (create)

**Interfaces:**
- Consumes: `movementData.pixelsPerInch` (shape `{ x: number; y: number }`) and `viewport.scale`.
- Produces:
  ```ts
  export interface ScaleBarProps {
      pixelsPerInch: { x: number; y: number };
      scale: number;
      style?: React.CSSProperties;
  }
  export const ScaleBar: React.FC<ScaleBarProps>;
  export function pickScaleUnits(inchesPerScreenPx: number, targetPx?: number): { units: number; widthPx: number };
  ```

`pickScaleUnits` snaps to a 1/2/5 × 10^n ladder so the ruler always reads as a round number of game units, then reports the exact pixel width that many units occupies. `targetPx` defaults to 90.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/ScaleBar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScaleBar, pickScaleUnits } from '../ScaleBar';

describe('pickScaleUnits', () => {
    it('snaps to a 1/2/5 ladder', () => {
        // 90 target px at 1 inch per screen px would be 90 units -> snaps to 50.
        expect(pickScaleUnits(1).units).toBe(50);
        // 4 inches per px -> 360 units -> snaps to 200.
        expect(pickScaleUnits(4).units).toBe(200);
        // 0.02 inches per px -> 1.8 units -> snaps to 1.
        expect(pickScaleUnits(0.02).units).toBe(1);
    });

    it('reports the pixel width the chosen unit count occupies', () => {
        const { units, widthPx } = pickScaleUnits(1);
        expect(widthPx).toBeCloseTo(units / 1, 5);
    });

    it('never returns a zero or negative width', () => {
        expect(pickScaleUnits(0).widthPx).toBeGreaterThan(0);
        expect(pickScaleUnits(-3).widthPx).toBeGreaterThan(0);
    });
});

describe('ScaleBar', () => {
    it('labels the ruler in game units', () => {
        render(<ScaleBar pixelsPerInch={{ x: 1, y: 1 }} scale={1} />);
        expect(screen.getByText(/units$/)).toBeTruthy();
    });

    it('shows fewer units as the map zooms in', () => {
        const { unmount } = render(<ScaleBar pixelsPerInch={{ x: 1, y: 1 }} scale={1} />);
        const wide = screen.getByTestId('scale-bar').getAttribute('data-units');
        unmount();
        render(<ScaleBar pixelsPerInch={{ x: 1, y: 1 }} scale={16} />);
        const close = screen.getByTestId('scale-bar').getAttribute('data-units');
        expect(Number(close)).toBeLessThan(Number(wide));
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/ScaleBar.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `../ScaleBar`.

- [ ] **Step 3: Write the component**

Create `src/renderer/stats/map/ScaleBar.tsx`:

```tsx
import React from 'react';

const TARGET_PX = 90;

/**
 * Snap a ruler to a round number of game units.
 *
 * `inchesPerScreenPx` is how many world inches one screen pixel currently
 * covers. Multiplying by a target width gives an ugly number (e.g. 3714
 * units), so we round it down the 1/2/5 x 10^n ladder and then report the
 * exact pixel width that rounded count occupies — the bar moves, the label
 * stays readable.
 */
export function pickScaleUnits(inchesPerScreenPx: number, targetPx = TARGET_PX): { units: number; widthPx: number } {
    if (!Number.isFinite(inchesPerScreenPx) || inchesPerScreenPx <= 0) {
        return { units: 1, widthPx: targetPx };
    }
    const raw = inchesPerScreenPx * targetPx;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / magnitude;
    const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
    const units = step * magnitude;
    return { units, widthPx: units / inchesPerScreenPx };
}

export interface ScaleBarProps {
    pixelsPerInch: { x: number; y: number };
    scale: number;
    style?: React.CSSProperties;
}

export const ScaleBar: React.FC<ScaleBarProps> = ({ pixelsPerInch, scale, style }) => {
    // pixelsPerInch is map-space px per world inch; multiplying by the
    // viewport scale converts to screen px per world inch.
    const screenPxPerInch = (pixelsPerInch?.x ?? 1) * scale;
    const { units, widthPx } = pickScaleUnits(screenPxPerInch > 0 ? 1 / screenPxPerInch : 0);

    return (
        <div
            data-testid="scale-bar"
            data-units={units}
            style={{
                display: 'flex', flexDirection: 'column', gap: 2,
                pointerEvents: 'none', userSelect: 'none', ...style,
            }}
        >
            <div style={{
                width: Math.round(widthPx), height: 5,
                borderLeft: '1px solid rgba(226,232,240,0.75)',
                borderRight: '1px solid rgba(226,232,240,0.75)',
                borderBottom: '1px solid rgba(226,232,240,0.75)',
            }} />
            <span style={{ fontSize: 9, letterSpacing: '.06em', color: 'rgba(203,213,225,0.75)' }}>
                {units.toLocaleString()} units
            </span>
        </div>
    );
};

export default ScaleBar;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/ScaleBar.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/ScaleBar.tsx src/renderer/stats/map/__tests__/ScaleBar.test.tsx
git commit -m "feat(replay): add a world-units scale bar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `MapLegend`

**Files:**
- Create: `src/renderer/stats/map/MapLegend.tsx`
- Test: `src/renderer/stats/map/__tests__/MapLegend.test.tsx` (create)

**Interfaces:**
- Consumes: `useStatsStore(state => state.replayLayers)`.
- Produces: `export const MapLegend: React.FC<{ style?: React.CSSProperties }>`.

Rows split two ways. **Toggle-backed** rows — CC taken (`ccTakenMarks`), rallied (`rallyRings`), death heat (`heatmap !== 'off'`) — appear only when that layer is on. **Always-drawn** rows — downed, killed, commander, enemy — are always present. The card therefore shrinks as layers are turned off but never empties. Ownership colours are deliberately absent: sector tints are self-evident, these marks are not.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/MapLegend.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapLegend } from '../MapLegend';
import { useStatsStore } from '../../statsStore';

describe('MapLegend', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('always shows the marks that are always drawn', () => {
        render(<MapLegend />);
        expect(screen.getByText(/downed/i)).toBeTruthy();
        expect(screen.getByText(/killed/i)).toBeTruthy();
        expect(screen.getByText(/commander/i)).toBeTruthy();
        expect(screen.getByText(/enemy/i)).toBeTruthy();
    });

    it('shows the CC row only while ccTakenMarks is on', () => {
        render(<MapLegend />);   // ccTakenMarks defaults true
        expect(screen.getByText(/cc taken/i)).toBeTruthy();
    });

    it('drops the CC row when ccTakenMarks is off', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', false);
        render(<MapLegend />);
        expect(screen.queryByText(/cc taken/i)).toBeNull();
    });

    it('drops the rallied row when rallyRings is off', () => {
        render(<MapLegend />);   // rallyRings defaults false
        expect(screen.queryByText(/rallied/i)).toBeNull();
    });

    it('adds the rallied row when rallyRings is on', () => {
        useStatsStore.getState().setReplayLayer('rallyRings', true);
        render(<MapLegend />);
        expect(screen.getByText(/rallied/i)).toBeTruthy();
    });

    it('adds the death-heat row only when a heatmap mode is selected', () => {
        const { unmount } = render(<MapLegend />);
        expect(screen.queryByText(/death heat/i)).toBeNull();
        unmount();
        useStatsStore.getState().setReplayHeatmapMode('deaths');
        render(<MapLegend />);
        expect(screen.getByText(/death heat/i)).toBeTruthy();
    });

    it('never empties even with every optional layer off', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', false);
        useStatsStore.getState().setReplayLayer('rallyRings', false);
        useStatsStore.getState().setReplayHeatmapMode('off');
        const { container } = render(<MapLegend />);
        expect(container.querySelectorAll('[data-legend-row]').length).toBe(4);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/MapLegend.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `../MapLegend`.

- [ ] **Step 3: Write the component**

Create `src/renderer/stats/map/MapLegend.tsx`:

```tsx
import React from 'react';
import { useStatsStore } from '../statsStore';

type Glyph = 'ring' | 'cross' | 'ring-dot' | 'blur' | 'tag' | 'marker';

interface LegendRow {
    key: string;
    label: string;
    color: string;
    glyph: Glyph;
}

/** Marks that are drawn unconditionally, so their rows are unconditional too. */
const ALWAYS: LegendRow[] = [
    { key: 'downed',    label: 'Downed',    color: '#f97316', glyph: 'cross' },
    { key: 'killed',    label: 'Killed',    color: '#a78bfa', glyph: 'ring-dot' },
    { key: 'commander', label: 'Commander', color: '#fbbf24', glyph: 'tag' },
    { key: 'enemy',     label: 'Enemy',     color: '#ef4444', glyph: 'marker' },
];

const Swatch: React.FC<{ glyph: Glyph; color: string }> = ({ glyph, color }) => (
    <svg width={13} height={13} viewBox="0 0 13 13" style={{ flexShrink: 0 }} aria-hidden="true">
        {glyph === 'ring' && <circle cx={6.5} cy={6.5} r={4.5} fill="none" stroke={color} strokeWidth={1.6} />}
        {glyph === 'cross' && (
            <>
                <line x1={2.5} y1={6.5} x2={10.5} y2={6.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
                <line x1={6.5} y1={2.5} x2={6.5} y2={10.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
            </>
        )}
        {glyph === 'ring-dot' && (
            <>
                <circle cx={6.5} cy={6.5} r={5} fill="none" stroke={color} strokeWidth={1.2} />
                <circle cx={6.5} cy={6.5} r={2} fill={color} />
            </>
        )}
        {glyph === 'blur' && <circle cx={6.5} cy={6.5} r={5} fill={color} opacity={0.4} />}
        {glyph === 'tag' && <polygon points="6.5,1.5 11.5,11.5 1.5,11.5" fill={color} />}
        {glyph === 'marker' && <circle cx={6.5} cy={6.5} r={4} fill={color} opacity={0.8} />}
    </svg>
);

/**
 * What the marks on the map mean, sitting next to the map rather than 400px
 * away inside the layers panel. Ownership colours are deliberately absent —
 * a sector tint explains itself, a violet ring does not.
 */
export const MapLegend: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
    const layers = useStatsStore(state => state.replayLayers);

    const rows: LegendRow[] = [
        ...(layers.ccTakenMarks
            ? [{ key: 'cc', label: 'CC taken', color: '#f59e0b', glyph: 'ring' as const }]
            : []),
        ...ALWAYS,
        ...(layers.rallyRings
            ? [{ key: 'rallied', label: 'Rallied', color: '#22c55e', glyph: 'ring' as const }]
            : []),
        ...(layers.heatmap !== 'off'
            ? [{ key: 'heat', label: 'Death heat', color: '#ef4444', glyph: 'blur' as const }]
            : []),
    ];

    return (
        <div
            className="app-dropdown"
            style={{
                width: 132, padding: '6px 8px', borderRadius: 8,
                border: '1px solid var(--border-default)',
                display: 'flex', flexDirection: 'column', gap: 3,
                ...style,
            }}
        >
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                On the map
            </div>
            {rows.map(row => (
                <div key={row.key} data-legend-row={row.key}
                     style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Swatch glyph={row.glyph} color={row.color} />
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{row.label}</span>
                </div>
            ))}
        </div>
    );
};

export default MapLegend;
```

The `app-dropdown` class is required: floating surfaces need an opaque glass override, because `backdrop-filter` is dead on Linux and a bare alpha background makes the card see-through over the map.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/MapLegend.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/MapLegend.tsx src/renderer/stats/map/__tests__/MapLegend.test.tsx
git commit -m "feat(replay): add a map legend for event marks

Explains the marks next to the marks. Toggle-backed rows drop out when
their layer is off; always-drawn marks keep their rows, so the card
shrinks but never empties.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `FightIdentityPill` replaces `FightPickerBar`

**Files:**
- Create: `src/renderer/stats/map/FightIdentityPill.tsx`
- Create: `src/renderer/stats/map/__tests__/FightIdentityPill.test.tsx`
- Delete: `src/renderer/stats/map/FightPickerBar.tsx`, `src/renderer/stats/map/__tests__/FightPickerBar.test.tsx`
- Modify: `src/renderer/stats/map/ReplayView.tsx` (swap the bar for the pill)

**Interfaces:**
- Consumes: `useStatsStore` (`selectedReplayFightId`, `setSelectedReplayFight`), `formatDuration`.
- Produces:
  ```ts
  export interface FightIdentityPillProps {
      fights: ReplayFightPayload[];
      onOpenPicker: () => void;
  }
  export const FightIdentityPill: React.FC<FightIdentityPillProps>;
  ```

The prev/next stepping and boundary-disable behaviour carries over from `FightPickerBar` verbatim, including the `title`/`aria-label` strings `"Previous fight"` and `"Next fight"` the old tests keyed on.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/FightIdentityPill.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FightIdentityPill } from '../FightIdentityPill';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (id: string, label: string): ReplayFightPayload => ({
    fightId: id, fightIndex: 0, label, timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 5, deaths: 2,
    movementData: { pollingRate: 300, durationMs: 60_000, pixelsPerInch: { x: 1, y: 1 }, members: [], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [], killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null,
});

const fights = [makeFight('a', 'Fight A'), makeFight('b', 'Fight B'), makeFight('c', 'Fight C')];

describe('FightIdentityPill', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('shows the active fight label', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        expect(screen.getByText('Fight B')).toBeTruthy();
    });

    it('shows the position in the fight list', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        expect(screen.getByText(/2 of 3/)).toBeTruthy();
    });

    it('shows squad size and duration', () => {
        useStatsStore.getState().setSelectedReplayFight('a');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        expect(screen.getByText(/20/)).toBeTruthy();
        expect(screen.getByText(/1:00/)).toBeTruthy();
    });

    it('▶ advances to the next fight', () => {
        useStatsStore.getState().setSelectedReplayFight('a');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        fireEvent.click(screen.getByTitle('Next fight'));
        expect(useStatsStore.getState().selectedReplayFightId).toBe('b');
    });

    it('◀ goes to the previous fight', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        fireEvent.click(screen.getByTitle('Previous fight'));
        expect(useStatsStore.getState().selectedReplayFightId).toBe('a');
    });

    it('disables ◀ on the first fight', () => {
        useStatsStore.getState().setSelectedReplayFight('a');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        expect((screen.getByTitle('Previous fight') as HTMLButtonElement).disabled).toBe(true);
    });

    it('disables ▶ on the last fight', () => {
        useStatsStore.getState().setSelectedReplayFight('c');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        expect((screen.getByTitle('Next fight') as HTMLButtonElement).disabled).toBe(true);
    });

    it('calls onOpenPicker when the label is clicked', () => {
        const onOpenPicker = vi.fn();
        useStatsStore.getState().setSelectedReplayFight('a');
        render(<FightIdentityPill fights={fights} onOpenPicker={onOpenPicker} />);
        fireEvent.click(screen.getByTitle('Show all fights'));
        expect(onOpenPicker).toHaveBeenCalledOnce();
    });

    it('renders nothing with an empty fight list', () => {
        const { container } = render(<FightIdentityPill fights={[]} onOpenPicker={() => {}} />);
        expect(container.firstChild).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/FightIdentityPill.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `../FightIdentityPill`.

- [ ] **Step 3: Write the component**

Create `src/renderer/stats/map/FightIdentityPill.tsx`:

```tsx
import React, { useCallback } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { useStatsStore } from '../statsStore';
import { formatDuration } from '../../../shared/mapUtils';
import type { ReplayFightPayload } from './replayTypes';

export interface FightIdentityPillProps {
    fights: ReplayFightPayload[];
    onOpenPicker: () => void;
}

const stepBtn = (disabled: boolean): React.CSSProperties => ({
    width: 20, height: 20, borderRadius: 4, flexShrink: 0,
    background: 'transparent', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
    cursor: disabled ? 'default' : 'pointer',
});

/**
 * Which fight you are looking at, centred over the map. Replaces the
 * full-width picker bar: the same stepping and the same doorway into the
 * `FightPicker` overlay, in ~28px of floating chrome instead of 34px of
 * docked chrome.
 */
export const FightIdentityPill: React.FC<FightIdentityPillProps> = ({ fights, onOpenPicker }) => {
    const selectedId = useStatsStore(state => state.selectedReplayFightId);
    const setSelectedReplayFight = useStatsStore(state => state.setSelectedReplayFight);

    const currentIdx = fights.findIndex(f => f.fightId === selectedId);
    const current = fights[currentIdx];

    const step = useCallback((dir: -1 | 1) => {
        if (!fights.length) return;
        const idx = currentIdx < 0 ? 0 : currentIdx;
        const nextIdx = Math.max(0, Math.min(fights.length - 1, idx + dir));
        const next = fights[nextIdx];
        if (next && next.fightId !== selectedId) setSelectedReplayFight(next.fightId);
    }, [fights, currentIdx, selectedId, setSelectedReplayFight]);

    if (!fights.length) return null;

    const atFirst = currentIdx <= 0;
    const atLast = currentIdx >= fights.length - 1;

    return (
        <div
            className="app-dropdown"
            style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 6px', borderRadius: 16,
                border: '1px solid var(--border-default)',
                maxWidth: 380,
            }}
        >
            <button type="button" title="Previous fight" aria-label="Previous fight"
                    onClick={() => step(-1)} disabled={atFirst} style={stepBtn(atFirst)}>
                <ChevronLeft size={13} />
            </button>

            <button
                type="button"
                title="Show all fights"
                onClick={onOpenPicker}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
            >
                <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {current?.label ?? '—'}
                </span>
                {current && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        · {formatDuration(current.durationMs)}
                        · <Users size={9} />{current.squadSize}
                    </span>
                )}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                    · {currentIdx >= 0 ? currentIdx + 1 : '—'} of {fights.length}
                </span>
                <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>

            <button type="button" title="Next fight" aria-label="Next fight"
                    onClick={() => step(1)} disabled={atLast} style={stepBtn(atLast)}>
                <ChevronRight size={13} />
            </button>
        </div>
    );
};

export default FightIdentityPill;
```

- [ ] **Step 4: Delete the bar and rewire `ReplayView`**

```bash
git rm src/renderer/stats/map/FightPickerBar.tsx src/renderer/stats/map/__tests__/FightPickerBar.test.tsx
```

In `ReplayView.tsx`: replace the `import { FightPickerBar } from './FightPickerBar';` line with `import { FightIdentityPill } from './FightIdentityPill';`, delete the `<FightPickerBar ... />` element from the top of `body`, and add the pill as an absolutely-positioned child of the map container (Task 14 gives it its final position; for now place it just after the zoom-controls block):

```tsx
                            <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 15 }}>
                                <FightIdentityPill fights={fights} onOpenPicker={() => setPickerCollapsed(false)} />
                            </div>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/FightIdentityPill.test.tsx src/renderer/stats/map/__tests__/FightPicker.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean — no dangling `FightPickerBar` import.

- [ ] **Step 7: Commit**

```bash
git add -A src/renderer/stats/map
git commit -m "feat(replay): replace the fight picker bar with a floating identity pill

Same stepping, same doorway into the full picker, 34px of docked chrome
traded for a centred pill over the map.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Split `TimelineLanes` out of `SyncedTimeline`

**Files:**
- Create: `src/renderer/stats/map/TimelineLanes.tsx`
- Create: `src/renderer/stats/map/__tests__/TimelineLanes.test.tsx`
- Modify: `src/renderer/stats/map/SyncedTimeline.tsx` (lanes removed)
- Modify: `src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx` (lane cases move out)

**Interfaces:**
- Consumes: `ReplayFightPayload` (`ccSamples`, `ccInSamples`, `stripSamples`, `stripInSamples`, `durationMs`), `SERIES_INTERVAL_MS` from `@axiapps/bridge-metrics/nativeSeries`, `useStatsStore(state => state.replayLayers)`.
- Produces: `export const TimelineLanes: React.FC<{ fight: ReplayFightPayload }>`.

The band is its own `<svg viewBox="0 0 1000 52">` rendered at `height: 52`, with a **left gutter of 92px in HTML, outside the SVG**. Today the labels are an opaque plate at `x=0..92` painted *on top of* the bars, which hides the opening seconds of every lane; moving them out of the plotting area is the point of the split.

Lane geometry inside the new 52-unit viewBox — each pair mirrors around a shared zero line, outgoing up, incoming down:

| Lane | `subLane(samples, top, height, invert)` | zero line |
|---|---|---|
| CC out | `(cc, 4, 10, false)` | 14 |
| CC in | `(ccIn, 14, 10, true)` | 14 |
| Strips out | `(strip, 28, 10, false)` | 38 |
| Strips in | `(stripIn, 38, 10, true)` | 38 |

"Not recorded" baselines sit at y = 9, 19, 33, 43 respectively.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/TimelineLanes.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { TimelineLanes } from '../TimelineLanes';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (over: Partial<ReplayFightPayload> = {}): ReplayFightPayload => ({
    fightId: 'x', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 0, deaths: 0,
    movementData: { pollingRate: 300, durationMs: 60_000, pixelsPerInch: { x: 1, y: 1 }, members: [], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [], killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null,
    ...over,
});

describe('TimelineLanes', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('renders a CC lane when samples are present', () => {
        const { container } = render(<TimelineLanes fight={makeFight({ ccSamples: [0, 2, 1, 0] })} />);
        expect(container.querySelector('[data-testid="cc-lane"]')).not.toBeNull();
    });

    it('renders the not-recorded baseline when the CC series is absent', () => {
        const { container } = render(<TimelineLanes fight={makeFight()} />);
        expect(container.querySelector('[data-testid="cc-lane-not-recorded"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="cc-lane"]')).toBeNull();
    });

    it('renders the not-recorded baseline for each of the four lanes', () => {
        const { container } = render(<TimelineLanes fight={makeFight()} />);
        for (const id of ['cc-lane-not-recorded', 'cc-in-lane-not-recorded', 'strip-lane-not-recorded', 'strip-in-lane-not-recorded']) {
            expect(container.querySelector(`[data-testid="${id}"]`)).not.toBeNull();
        }
    });

    it('distinguishes an all-zero series from an absent one', () => {
        const { container } = render(<TimelineLanes fight={makeFight({ ccSamples: [0, 0, 0, 0] })} />);
        expect(container.querySelector('[data-testid="cc-lane"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="cc-lane-not-recorded"]')).toBeNull();
    });

    it('drops a lane entirely when its layer toggle is off', () => {
        useStatsStore.getState().setReplayLayer('ccLane', false);
        const { container } = render(<TimelineLanes fight={makeFight({ ccSamples: [0, 2, 1] })} />);
        expect(container.querySelector('[data-testid="cc-lane"]')).toBeNull();
        expect(container.querySelector('[data-testid="cc-lane-not-recorded"]')).toBeNull();
    });

    it('draws the zero rule for a measure whose lanes are on', () => {
        const { container } = render(<TimelineLanes fight={makeFight()} />);
        expect(container.querySelector('[data-testid="cc-zero-rule"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="strip-zero-rule"]')).not.toBeNull();
    });

    it('puts the lane labels in an HTML gutter, not inside the plotting SVG', () => {
        const { container } = render(<TimelineLanes fight={makeFight()} />);
        const label = container.querySelector('[data-testid="cc-lane-label"]')!;
        expect(label).not.toBeNull();
        expect(label.closest('svg')).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/TimelineLanes.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `../TimelineLanes`.

- [ ] **Step 3: Write the component**

Create `src/renderer/stats/map/TimelineLanes.tsx`:

```tsx
import React, { useCallback, useMemo } from 'react';
import { useStatsStore } from '../statsStore';
import { SERIES_INTERVAL_MS } from '@axiapps/bridge-metrics/nativeSeries';
import type { ReplayFightPayload } from './replayTypes';

const GUTTER_PX = 92;

/**
 * The two mirrored measures, each drawn as an outgoing lane above its zero
 * line and an incoming lane below it. `zeroY` is the shared baseline the
 * `subLane` calls below hang off, so these must stay in step with the y
 * offsets passed there.
 */
const LANE_LABELS = [
    { id: 'cc', label: 'CC', color: '#f59e0b', zeroY: 14, outKey: 'ccLane', inKey: 'ccInLane' },
    { id: 'strip', label: 'Strips', color: '#e879f9', zeroY: 38, outKey: 'stripLane', inKey: 'stripInLane' },
] as const;

export interface TimelineLanesProps {
    fight: ReplayFightPayload;
}

export const TimelineLanes: React.FC<TimelineLanesProps> = ({ fight }) => {
    const layersState = useStatsStore(state => state.replayLayers);

    /**
     * CC and strips get their own normalized sub-lanes rather than sharing the
     * DPS y-axis: squad DPS runs in the hundreds of thousands and CC counts in
     * single digits, so a shared axis flattens the counts onto the baseline.
     */
    const subLane = useCallback((samples: number[] | null, top: number, height: number, invert = false) => {
        if (!samples || samples.length === 0 || fight.durationMs <= 0) return '';
        const max = Math.max(1, ...samples);
        // These are native squad series stamped at SERIES_INTERVAL_MS (1s)
        // per sample; `samples.length * SERIES_INTERVAL_MS` does not always
        // equal `fight.durationMs` exactly. Positioning by
        // `timeMs / fight.durationMs`, like the scrubber does, keeps this
        // lane aligned instead of drifting by `index / samples.length`.
        const stepPx = (SERIES_INTERVAL_MS / fight.durationMs) * 1000;
        // `invert` hangs the bars downward from `top` instead of standing them
        // up from the baseline. The max is per-lane on purpose: incoming CC
        // counts every source and folds no pets, so a shared scale would
        // flatten the outgoing lane against a much taller incoming one.
        const baseline = invert ? top : top + height;
        const reach = (v: number) => (invert ? baseline + (v / max) * height : baseline - (v / max) * height);
        return samples
            .map((v, i) => `M ${(i * stepPx).toFixed(1)},${baseline} V ${reach(v).toFixed(1)}`)
            .join(' ');
    }, [fight.durationMs]);

    const ccPath = useMemo(() => subLane(fight.ccSamples, 4, 10), [subLane, fight.ccSamples]);
    const ccInPath = useMemo(() => subLane(fight.ccInSamples, 14, 10, true), [subLane, fight.ccInSamples]);
    const stripPath = useMemo(() => subLane(fight.stripSamples, 28, 10), [subLane, fight.stripSamples]);
    const stripInPath = useMemo(() => subLane(fight.stripInSamples, 38, 10, true), [subLane, fight.stripInSamples]);

    return (
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
            {/* Gutter, outside the plotting area. The old in-SVG label plate
                sat on top of the bars and hid the fight's opening seconds. */}
            <div style={{ width: GUTTER_PX, flexShrink: 0, position: 'relative' }}>
                {LANE_LABELS.map(lane => (
                    (layersState[lane.outKey] || layersState[lane.inKey]) && (
                        <span
                            key={lane.id}
                            data-testid={`${lane.id}-lane-label`}
                            title="Each lane is scaled to its own peak, so bar heights are not comparable across the zero line."
                            style={{
                                position: 'absolute', left: 2,
                                top: `${(lane.zeroY / 52) * 100}%`, transform: 'translateY(-50%)',
                                fontSize: 9, fontWeight: 600, color: lane.color, whiteSpace: 'nowrap',
                            }}
                        >
                            {`${lane.label} ▲out ▼in`}
                        </span>
                    )
                ))}
            </div>
            <svg
                data-testid="timeline-lanes"
                viewBox="0 0 1000 52"
                preserveAspectRatio="none"
                style={{ flex: 1, height: 52, display: 'block', background: 'rgba(8,12,26,0.6)', borderRadius: 6 }}
            >
                {layersState.ccLane && (
                    fight.ccSamples?.length ? (
                        ccPath && (
                            <g data-testid="cc-lane">
                                <path d={ccPath} stroke="#f59e0b" strokeWidth={2} fill="none" opacity={0.85} />
                            </g>
                        )
                    ) : (
                        // `null` (or a degenerate empty lane) means "never
                        // captured" — log predates axilog 1.8.0, or was parsed
                        // without raw timeline arrays. Pixel-identical to a
                        // genuinely all-zero series otherwise. A dashed
                        // baseline keeps the two states distinct.
                        <g data-testid="cc-lane-not-recorded">
                            <line x1={0} x2={1000} y1={9} y2={9} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.35} />
                            <text x={6} y={7} fontSize={7} fill="#f59e0b" opacity={0.6}>not recorded</text>
                        </g>
                    )
                )}
                {layersState.ccInLane && (
                    fight.ccInSamples?.length ? (
                        ccInPath && (
                            <g data-testid="cc-in-lane">
                                <path d={ccInPath} stroke="#f59e0b" strokeWidth={2} fill="none" opacity={0.45} />
                            </g>
                        )
                    ) : (
                        // Absent here means something narrower than for the
                        // outgoing lane above: axilog has no squad-level
                        // incoming series, so this is folded from `by_entity`,
                        // which needs raw timeline arrays AND axilog 1.9.0. A
                        // log can draw a full CC lane and nothing here, which
                        // is exactly why the two are gated apart.
                        <g data-testid="cc-in-lane-not-recorded">
                            <line x1={0} x2={1000} y1={19} y2={19} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.2} />
                            <text x={6} y={23} fontSize={7} fill="#f59e0b" opacity={0.45}>not recorded</text>
                        </g>
                    )
                )}
                {layersState.stripLane && (
                    fight.stripSamples?.length ? (
                        stripPath && (
                            <g data-testid="strip-lane">
                                <path d={stripPath} stroke="#e879f9" strokeWidth={2} fill="none" opacity={0.85} />
                            </g>
                        )
                    ) : (
                        <g data-testid="strip-lane-not-recorded">
                            <line x1={0} x2={1000} y1={33} y2={33} stroke="#e879f9" strokeWidth={1} strokeDasharray="4 3" opacity={0.35} />
                            <text x={6} y={31} fontSize={7} fill="#e879f9" opacity={0.6}>not recorded</text>
                        </g>
                    )
                )}
                {layersState.stripInLane && (
                    fight.stripInSamples?.length ? (
                        stripInPath && (
                            <g data-testid="strip-in-lane">
                                <path d={stripInPath} stroke="#e879f9" strokeWidth={2} fill="none" opacity={0.45} />
                            </g>
                        )
                    ) : (
                        <g data-testid="strip-in-lane-not-recorded">
                            <line x1={0} x2={1000} y1={43} y2={43} stroke="#e879f9" strokeWidth={1} strokeDasharray="4 3" opacity={0.2} />
                            <text x={6} y={47} fontSize={7} fill="#e879f9" opacity={0.45}>not recorded</text>
                        </g>
                    )
                )}
                {LANE_LABELS.map(lane => (
                    (layersState[lane.outKey] || layersState[lane.inKey]) && (
                        // The zero line the pair mirrors around. Without it the
                        // two half-height bar sets read as two unrelated lanes
                        // rather than one axis.
                        <line key={lane.id}
                              data-testid={`${lane.id}-zero-rule`}
                              x1={0} x2={1000} y1={lane.zeroY} y2={lane.zeroY}
                              stroke={lane.color} strokeWidth={0.5} opacity={0.3} />
                    )
                ))}
            </svg>
        </div>
    );
};

export default TimelineLanes;
```

- [ ] **Step 4: Strip the lanes out of `SyncedTimeline`**

In `SyncedTimeline.tsx`, delete: the `LANE_LABELS` constant, the `subLane` callback, the four `useMemo` path constants, the `SERIES_INTERVAL_MS` import, and all four lane `{layersState.xxLane && (...)}` blocks plus the `LANE_LABELS.map(...)` block. Change the svg `viewBox` from `"0 0 1000 176"` to `"0 0 1000 120"`, `height: 152` to `height: 92`, the ally-kill marks from `y1={156} y2={168}` to `y1={104} y2={116}`, and the playhead `y2={176}` to `y2={120}`. Leave the phase ribbon, DPS path, enemy kill marks, scrub handlers and the phase-chip row exactly as they are — Task 9 reworks those.

- [ ] **Step 5: Move the lane cases out of `SyncedTimeline.test.tsx`**

Delete the entire `describe('SyncedTimeline CC and strip lanes', ...)` block (and any other lane / `not-recorded` / `zero-rule` / `lane-label` cases) from `src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx`. Their coverage now lives in `TimelineLanes.test.tsx`. Keep the two `describe('SyncedTimeline', ...)` cases.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/TimelineLanes.test.tsx src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/map/TimelineLanes.tsx src/renderer/stats/map/SyncedTimeline.tsx src/renderer/stats/map/__tests__/TimelineLanes.test.tsx src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx
git commit -m "refactor(replay): split the CC/strip lanes into TimelineLanes

Lane labels move to an HTML gutter outside the plotting area — the old
in-SVG label plate sat on top of the bars and hid the opening seconds of
every lane. The not-recorded dashed baselines carry over unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Phase chips become clickable scrubber segments

**Files:**
- Modify: `src/renderer/stats/map/SyncedTimeline.tsx`
- Modify: `src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx`

**Interfaces:**
- Consumes: `useSquadDerived(fight).phases` (`{ kind, startMs, endMs }[]`).
- Produces: no new exports. The phase ribbon rects become clickable and carry `data-phase-chip` + `data-start-ms`, so the existing phase-chip assertions keep working against the ribbon instead of a separate wrapping row.

The wrapping chip row below the SVG is what makes the timeline block grow an unpredictable extra line. Folding the click target into the ribbon removes that row without losing the jump-to-phase behaviour or its tooltips.

- [ ] **Step 1: Write the failing test**

Replace the assertions in `src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx` with cases targeting the ribbon, keeping the existing fixture builder at the top of that file:

```tsx
    it('renders one clickable ribbon segment per phase', () => {
        useStatsStore.getState().setReplayLayer('phases', true);
        const { container } = render(<SyncedTimeline fight={fightWithPhases()} />);
        const segs = container.querySelectorAll('[data-phase-chip]');
        expect(segs.length).toBeGreaterThan(0);
        expect(segs[0].tagName.toLowerCase()).toBe('rect');
    });

    it('clicking a ribbon segment scrubs to that phase start', () => {
        useStatsStore.getState().setReplayLayer('phases', true);
        const { container } = render(<SyncedTimeline fight={fightWithPhases()} />);
        const seg = container.querySelectorAll('[data-phase-chip]')[1] as SVGRectElement;
        const start = Number(seg.getAttribute('data-start-ms'));
        fireEvent.click(seg);
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBe(start);
    });

    it('renders no separate chip row below the svg', () => {
        useStatsStore.getState().setReplayLayer('phases', true);
        const { container } = render(<SyncedTimeline fight={fightWithPhases()} />);
        expect(container.querySelectorAll('button[data-phase-chip]').length).toBe(0);
    });

    it('renders no phase segments when the phases layer is off', () => {
        useStatsStore.getState().setReplayLayer('phases', false);
        const { container } = render(<SyncedTimeline fight={fightWithPhases()} />);
        expect(container.querySelectorAll('[data-phase-chip]').length).toBe(0);
    });
```

If the existing file has no `fightWithPhases()` helper, add one built from the same fixture shape `SyncedTimeline.test.tsx` uses, with `dpsSamples` dense enough that `useSquadDerived` produces at least two phases.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx --maxWorkers=2`
Expected: FAIL — the segments are `<rect>` but carry no `data-phase-chip`, and the button chip row still exists.

- [ ] **Step 3: Make the ribbon clickable and delete the chip row**

In `SyncedTimeline.tsx`, replace the phase-ribbon block with:

```tsx
                {layersState.phases && derived.phases.map((p, i) => {
                    const x1 = (p.startMs / fight.durationMs) * 1000;
                    const x2 = (p.endMs / fight.durationMs) * 1000;
                    return (
                        <rect key={`ph-${i}`}
                            data-phase-chip
                            data-start-ms={p.startMs}
                            x={x1} y={0} width={Math.max(0, x2 - x1)} height={10}
                            fill={phaseColor[p.kind]} opacity={0.45}
                            style={{ cursor: 'pointer' }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                // Beat the svg-wide scrub handler: a click on a
                                // phase segment means "jump to this phase",
                                // not "scrub to where I clicked".
                                e.stopPropagation();
                                setReplayPlayhead({ timeMs: p.startMs });
                            }}>
                            <title>{`${p.kind} — ${phaseDesc[p.kind]}`}</title>
                        </rect>
                    );
                })}
```

Then delete the whole `{layersState.phases && derived.phases.length > 0 && (<div ...chips...>)}` block at the bottom of the component.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/SyncedTimeline.tsx src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx
git commit -m "refactor(replay): fold the phase chips into the scrubber ribbon

Removes the wrapping chip row that made the timeline block grow an
unpredictable extra line; jump-to-phase moves onto the ribbon itself.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: `TransportBar`

**Files:**
- Create: `src/renderer/stats/map/TransportBar.tsx`
- Create: `src/renderer/stats/map/__tests__/TransportBar.test.tsx`
- Modify: `src/renderer/stats/map/SyncedTimeline.tsx` (header row removed)
- Modify: `src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx`

**Interfaces:**
- Consumes: `useStatsStore` (`replayPlayhead`, `setReplayPlayhead`, `replayLanesExpanded`, `setReplayLanesExpanded`), `SyncedTimeline`, `TimelineLanes`, `formatDuration`.
- Produces: `export const TransportBar: React.FC<{ fight: ReplayFightPayload; style?: React.CSSProperties }>`.

One row at rest (~66px): play/pause, the five speed buttons, **one** clock, the scrubber, and an amber Lanes toggle. Expanded adds the lanes band (~132px total). The old `SyncedTimeline` header printed the clock a second time and is dropped in this task.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/TransportBar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransportBar } from '../TransportBar';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (): ReplayFightPayload => ({
    fightId: 'x', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 90_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 0, deaths: 0,
    movementData: { pollingRate: 300, durationMs: 90_000, pixelsPerInch: { x: 1, y: 1 }, members: [], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }, { timeMs: 90_000, squadDps: 5000 }],
    killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null,
});

describe('TransportBar', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('starts with the lanes band collapsed', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        expect(container.querySelector('[data-testid="timeline-lanes"]')).toBeNull();
    });

    it('expands the lanes band on click', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByTitle(/show cc and strip lanes/i));
        expect(container.querySelector('[data-testid="timeline-lanes"]')).not.toBeNull();
    });

    it('collapses the band again on a second click', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByTitle(/show cc and strip lanes/i));
        fireEvent.click(screen.getByTitle(/hide cc and strip lanes/i));
        expect(container.querySelector('[data-testid="timeline-lanes"]')).toBeNull();
    });

    it('reflects lane expansion state in the store', () => {
        render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByTitle(/show cc and strip lanes/i));
        expect(useStatsStore.getState().replayLanesExpanded).toBe(true);
    });

    it('prints the clock exactly once', () => {
        render(<TransportBar fight={makeFight()} />);
        expect(screen.getAllByText('0:00 / 1:30').length).toBe(1);
    });

    it('toggles playback', () => {
        render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByLabelText('Play'));
        expect(useStatsStore.getState().replayPlayhead.playing).toBe(true);
    });

    it('sets playback speed', () => {
        render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByText('4×'));
        expect(useStatsStore.getState().replayPlayhead.speed).toBe(4);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/TransportBar.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `../TransportBar`.

- [ ] **Step 3: Write the component**

Create `src/renderer/stats/map/TransportBar.tsx`:

```tsx
import React from 'react';
import { Pause, Play, ChevronUp, ChevronDown } from 'lucide-react';
import { useStatsStore } from '../statsStore';
import { formatDuration } from '../../../shared/mapUtils';
import { SyncedTimeline } from './SyncedTimeline';
import { TimelineLanes } from './TimelineLanes';
import type { ReplayFightPayload } from './replayTypes';

const SPEEDS = [0.5, 1, 1.5, 2, 4] as const;

export interface TransportBarProps {
    fight: ReplayFightPayload;
    style?: React.CSSProperties;
}

/**
 * Everything you press while watching, in one row. Absorbs the old controls
 * bar and the old timeline header — the clock used to be printed in both.
 * The lanes band underneath is a detail view, so it starts collapsed.
 */
export const TransportBar: React.FC<TransportBarProps> = ({ fight, style }) => {
    const playhead = useStatsStore(state => state.replayPlayhead);
    const setReplayPlayhead = useStatsStore(state => state.setReplayPlayhead);
    const lanesExpanded = useStatsStore(state => state.replayLanesExpanded);
    const setReplayLanesExpanded = useStatsStore(state => state.setReplayLanesExpanded);

    return (
        <div
            className="app-dropdown"
            style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: '5px 8px', borderRadius: 10,
                border: '1px solid var(--border-default)',
                ...style,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                    type="button"
                    aria-label={playhead.playing ? 'Pause' : 'Play'}
                    onClick={() => setReplayPlayhead({ playing: !playhead.playing })}
                    style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                        background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                >
                    {playhead.playing ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    {SPEEDS.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setReplayPlayhead({ speed: s })}
                            style={{
                                padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                background: playhead.speed === s ? 'var(--status-info-bg)' : 'var(--bg-input)',
                                border: `1px solid ${playhead.speed === s ? 'var(--status-info-border)' : 'var(--border-subtle)'}`,
                                color: playhead.speed === s ? 'var(--status-info)' : 'var(--text-muted)',
                                cursor: 'pointer',
                            }}
                        >
                            {s}×
                        </button>
                    ))}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {formatDuration(playhead.timeMs)} / {formatDuration(fight.durationMs)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <SyncedTimeline fight={fight} />
                </div>
                <button
                    type="button"
                    title={lanesExpanded ? 'Hide CC and strip lanes' : 'Show CC and strip lanes'}
                    aria-expanded={lanesExpanded}
                    onClick={() => setReplayLanesExpanded(!lanesExpanded)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                        padding: '3px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                        background: lanesExpanded ? 'rgba(245,158,11,0.16)' : 'var(--bg-input)',
                        border: `1px solid ${lanesExpanded ? '#f59e0b' : 'var(--border-subtle)'}`,
                        color: lanesExpanded ? '#f59e0b' : 'var(--text-muted)',
                        cursor: 'pointer',
                    }}
                >
                    {lanesExpanded ? <ChevronDown size={11} /> : <ChevronUp size={11} />} Lanes
                </button>
            </div>
            {lanesExpanded && <TimelineLanes fight={fight} />}
        </div>
    );
};

export default TransportBar;
```

- [ ] **Step 4: Drop the duplicate clock from `SyncedTimeline`**

In `SyncedTimeline.tsx`, delete the header row — the `<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, ... }}>` block printing "Squad DPS (peak …)" and the clock — and change the wrapper `<div className="replay-timeline-wrap" style={{ padding: '0 8px' }}>` to `style={{ padding: 0 }}`. Move the peak-DPS figure into the svg so it is not lost:

```tsx
                <title>{`Squad DPS — peak ${maxDps.toLocaleString()}`}</title>
```

Remove the now-unused `formatDuration` import if nothing else in the file uses it.

- [ ] **Step 5: Fix the now-stale `SyncedTimeline` clock test**

`SyncedTimeline.test.tsx`'s `'renders the duration and current time'` case asserts the header that just moved. Delete it — `TransportBar.test.tsx`'s `'prints the clock exactly once'` covers the clock now.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/TransportBar.test.tsx src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx src/renderer/stats/map/__tests__/TimelineLanes.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/map/TransportBar.tsx src/renderer/stats/map/SyncedTimeline.tsx src/renderer/stats/map/__tests__/TransportBar.test.tsx src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx
git commit -m "feat(replay): add TransportBar with a collapsed-by-default lanes band

One clock instead of two, one row instead of three.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Layers panel becomes colour-coded chips

**Files:**
- Modify: `src/renderer/stats/map/LayersPopover.tsx`
- Modify: `src/renderer/stats/map/__tests__/LayersPopover.test.tsx`

**Interfaces:**
- Consumes: `useStatsStore` (`replayLayers`, `setReplayLayer`, `setReplayHeatmapMode`).
- Produces: `LayersPanel` keeps its exact existing props — `{ open: boolean; onToggle: () => void }`.

Twenty stacked checkbox rows become wrapping toggle chips, colour-coded to the mark they control (amber = CC, fuchsia = strips, default otherwise). Both inline legend blocks come out: mark meanings now live in `MapLegend` (Task 6), and the per-lane-normalisation caveat becomes the lane chips' `title` (Task 8's gutter label carries the same sentence). The `scaleBar` toggle is added to the Map group.

Accessibility contract: each chip stays an `<input type="checkbox">` inside a `<label>` with the checkbox visually hidden, so `getByRole('checkbox', { name: /.../ })` and `getByLabelText` keep working. Do not swap them for `<button aria-pressed>`.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/stats/map/__tests__/LayersPopover.test.tsx`, inside the existing `describe('LayersPanel', ...)`:

```tsx
    it('renders the Scale bar toggle checked by default and toggles the store', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        const checkbox = screen.getByRole('checkbox', { name: /scale bar/i });
        expect((checkbox as HTMLInputElement).checked).toBe(true);
        fireEvent.click(checkbox);
        expect(useStatsStore.getState().replayLayers.scaleBar).toBe(false);
    });

    it('no longer renders the inline phase legend', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        fireEvent.click(screen.getByRole('checkbox', { name: /fight phases/i }));
        expect(screen.queryByText(/first ~10 s, no deaths yet/i)).toBeNull();
    });

    it('no longer renders the inline lane legend', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        expect(screen.queryByText(/scaled to its own peak/i)).toBeNull();
    });

    it('colour-codes the CC lane chip amber and the strip chip fuchsia', () => {
        render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        const cc = screen.getByRole('checkbox', { name: /cc lane/i }).closest('label')!;
        const strip = screen.getByRole('checkbox', { name: /strip lane/i }).closest('label')!;
        expect(cc.getAttribute('data-accent')).toBe('cc');
        expect(strip.getAttribute('data-accent')).toBe('strip');
    });

    it('is 216px wide when open', () => {
        const { container } = render(<Wrapper />);
        fireEvent.click(screen.getByTitle(/show layers/i));
        const panel = container.querySelector('[data-layers-panel]') as HTMLElement;
        expect(panel.style.width).toBe('216px');
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/stats/map/__tests__/LayersPopover.test.tsx --maxWorkers=2`
Expected: FAIL — no `scale bar` checkbox, the legends still render, no `data-accent`.

- [ ] **Step 3: Rewrite the panel body**

In `LayersPopover.tsx`:

Add `scaleBar` to `MAP_TOGGLES`:

```ts
const MAP_TOGGLES: { key: 'zoneBorders' | 'scaleBar'; label: string; title: string }[] = [
    { key: 'zoneBorders', label: 'Zone borders', title: 'Outlines each map sector in its owning team\'s colour (neutral when ownership is unknown)' },
    { key: 'scaleBar', label: 'Scale bar', title: 'A ruler in the map\'s bottom-left corner showing how many game units a given screen width covers at the current zoom' },
];
```

Delete the `PHASE_LEGEND` and `LANE_LEGEND` constants and both inline legend blocks inside the `EVENT_TOGGLES.map(...)` (the `t.key === 'stripInLane' && ...` and `t.key === 'phases' && ...` fragments). Fold the normalisation caveat into the four lane toggles' `title` strings by appending to each:

```
 Each lane is scaled to its own peak, so bar heights are not comparable across the zero line.
```

Add to the module a shared chip renderer:

```tsx
type Accent = 'cc' | 'strip' | undefined;

const ACCENT_COLOR: Record<'cc' | 'strip', string> = { cc: '#f59e0b', strip: '#e879f9' };

/** Chips wrap instead of stacking, so twenty toggles fit a 216px card. */
const Chip: React.FC<{
    checked: boolean;
    label: string;
    title: string;
    accent: Accent;
    onChange: (v: boolean) => void;
}> = ({ checked, label, title, accent, onChange }) => {
    const color = accent ? ACCENT_COLOR[accent] : 'var(--status-info)';
    return (
        <label
            title={title}
            data-accent={accent}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 7px', borderRadius: 12, cursor: 'pointer',
                fontSize: 10, lineHeight: '15px',
                background: checked ? `${color}22` : 'var(--bg-input)',
                border: `1px solid ${checked ? color : 'var(--border-subtle)'}`,
                color: checked ? color : 'var(--text-muted)',
            }}
        >
            {/* Kept as a real checkbox rather than aria-pressed so screen
                readers and getByRole('checkbox') both still work. */}
            <input
                type="checkbox"
                checked={checked}
                onChange={e => onChange(e.currentTarget.checked)}
                style={{
                    position: 'absolute', width: 1, height: 1,
                    opacity: 0, pointerEvents: 'none', margin: 0,
                }}
            />
            <span>{label}</span>
        </label>
    );
};

const chipRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 };
```

Tag the lane entries in `EVENT_TOGGLES` with `accent: 'cc'` (`ccLane`, `ccInLane`, `ccTakenMarks`) and `accent: 'strip'` (`stripLane`, `stripInLane`); widen the entry type to `{ key: ...; label: string; title: string; accent?: Accent }`.

Replace each group's `.map(...)` body with a `<div style={chipRow}>` wrapping `<Chip ... />`, and change the open-panel container to:

```tsx
        <div data-layers-panel className="app-dropdown" style={{
            width: 216, maxHeight: '100%',
            borderRadius: 10, border: '1px solid var(--border-default)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
```

Give the scrolling body `className="replay-scroll"` (Task 13 adds that class). Leave the collapsed rail button and the header row untouched — their `title` strings are what the existing tests key on.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/LayersPopover.test.tsx --maxWorkers=2`
Expected: PASS, including all six pre-existing cases.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/LayersPopover.tsx src/renderer/stats/map/__tests__/LayersPopover.test.tsx
git commit -m "feat(replay): turn the layers panel into colour-coded chips

Twenty stacked rows become wrapping chips in a 216px floating card. The
inline legends move out: mark meanings to MapLegend, the per-lane
normalisation caveat to the lane chips' tooltips.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Denser member card with a condition cluster

**Files:**
- Modify: `src/renderer/stats/map/PartyMemberCard.tsx`
- Modify: `src/renderer/stats/map/__tests__/PartyMemberCard.test.tsx`

**Interfaces:**
- Consumes: `activeBoons` from `./partyMemberHelpers`, `isReplayCondition` from `src/shared/replayBuffs` (Task 2).
- Produces: `PartyMemberCard` keeps its existing props exactly.

Card drops from ~90px to ~62px. The saving is the skill *name* string, which forced its own 20px row — the cast becomes a bare 20px icon on the identity row. The buff row splits into boons, a hairline divider, then conditions; the divider and a border tint distinguish the clusters, so no second icon map is needed (`boonIcons` is keyed by id and already carries the condition entries after Task 2).

- [ ] **Step 1: Write the failing tests**

Add a richer icon fixture and a new describe block to `src/renderer/stats/map/__tests__/PartyMemberCard.test.tsx`:

```tsx
const buffIcons: Record<number, { name: string; icon: string }> = {
    743: { name: 'Aegis', icon: 'aegis.png' },
    725: { name: 'Fury', icon: 'fury.png' },
    738: { name: 'Vulnerability', icon: 'vuln.png' },
    727: { name: 'Immobile', icon: 'immob.png' },
};

describe('PartyMemberCard conditions', () => {
    it('renders condition icons alongside boons', () => {
        const m = mkMember({ boonStates: { 743: [[0, 1]], 738: [[0, 12]] } });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={buffIcons} skillIcons={{}} />);
        expect(document.querySelectorAll('img[alt="Aegis"]').length).toBe(1);
        expect(document.querySelectorAll('img[alt="Vulnerability"]').length).toBe(1);
    });

    it('puts boons before the divider and conditions after it', () => {
        const m = mkMember({ boonStates: { 743: [[0, 1]], 738: [[0, 12]] } });
        const { container } = render(<PartyMemberCard member={m} timeMs={500} boonIcons={buffIcons} skillIcons={{}} />);
        const boonCluster = container.querySelector('[data-cluster="boons"]')!;
        const condiCluster = container.querySelector('[data-cluster="condis"]')!;
        expect(boonCluster.querySelector('img[alt="Aegis"]')).not.toBeNull();
        expect(condiCluster.querySelector('img[alt="Vulnerability"]')).not.toBeNull();
        expect(boonCluster.compareDocumentPosition(condiCluster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows the divider only when both clusters have content', () => {
        const onlyBoons = mkMember({ boonStates: { 743: [[0, 1]] } });
        const { container, unmount } = render(<PartyMemberCard member={onlyBoons} timeMs={500} boonIcons={buffIcons} skillIcons={{}} />);
        expect(container.querySelector('[data-buff-divider]')).toBeNull();
        unmount();
        const both = mkMember({ boonStates: { 743: [[0, 1]], 727: [[0, 1]] } });
        const { container: c2 } = render(<PartyMemberCard member={both} timeMs={500} boonIcons={buffIcons} skillIcons={{}} />);
        expect(c2.querySelector('[data-buff-divider]')).not.toBeNull();
    });

    it('shows stack counts on conditions', () => {
        const m = mkMember({ boonStates: { 738: [[0, 12]] } });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={buffIcons} skillIcons={{}} />);
        expect(screen.getByText('12')).toBeTruthy();
    });

    it('reserves a stable buff row height with no boons and no conditions', () => {
        const { container } = render(<PartyMemberCard member={mkMember()} timeMs={0} boonIcons={buffIcons} skillIcons={{}} />);
        const row = container.querySelector('[data-buff-row]') as HTMLElement;
        expect(row).not.toBeNull();
        expect(row.style.minHeight).toBe('18px');
    });

    it('renders the cast as a bare icon with no name string', () => {
        const m = mkMember({ skillCasts: [{ id: 5536, time: 1000, duration: 500 }] });
        render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
        expect(document.querySelectorAll('img[alt="Heal by Light"]').length).toBe(1);
        expect(screen.queryByText('Heal by Light')).toBeNull();
    });

    it('hides conditions for a dead member', () => {
        const m = mkMember({ deadRanges: [[0, 0]], boonStates: { 738: [[0, 12]] } });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={buffIcons} skillIcons={{}} />);
        expect(document.querySelectorAll('img[alt="Vulnerability"]').length).toBe(0);
    });
});
```

The pre-existing `'renders skill icons for casts in current second'` case asserts only the `<img>`, so it still passes.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/stats/map/__tests__/PartyMemberCard.test.tsx --maxWorkers=2`
Expected: FAIL — no `data-cluster`, no `data-buff-row`, and the skill name still renders.

- [ ] **Step 3: Rewrite the card body**

In `PartyMemberCard.tsx`, add the import and split the active buffs:

```tsx
import { isReplayCondition } from '../../../shared/replayBuffs';
```

```tsx
    const buffs = useMemo(() => activeBoons(member, timeMs), [member, timeMs]);
    const boons = useMemo(() => buffs.filter(b => !isReplayCondition(b.id)), [buffs]);
    const condis = useMemo(() => buffs.filter(b => isReplayCondition(b.id)), [buffs]);
```

Extract the icon-with-badge markup into a local component so both clusters share it:

```tsx
const BuffIcon: React.FC<{
    id: number;
    stacks: number;
    icons: Record<number, { name: string; icon: string }>;
    borderColor: string;
}> = ({ id, stacks, icons, borderColor }) => {
    const icon = icons[id];
    if (!icon?.icon) return null;
    return (
        <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
            <img src={icon.icon} alt={icon.name} title={`${icon.name}${stacks > 1 ? ` ×${stacks}` : ''}`}
                 width={18} height={18}
                 style={{ display: 'block', width: 18, height: 18, objectFit: 'contain', borderRadius: 3, border: `1px solid ${borderColor}` }} />
            {stacks > 1 && (
                <span style={{
                    position: 'absolute', bottom: 0, right: 0,
                    fontSize: 7, fontWeight: 700, lineHeight: '9px',
                    background: 'rgba(0,0,0,0.8)', color: '#fff',
                    padding: '0 2px', borderRadius: '2px 0 3px 0',
                    minWidth: 9, textAlign: 'center', pointerEvents: 'none',
                }}>
                    {stacks}
                </span>
            )}
        </div>
    );
};
```

Move the cast icon onto the identity row, immediately after the HP percentage, dropping the name string:

```tsx
                <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                    {(() => {
                        if (status === 'dead') return null;
                        const icon = skillIcons[skillIds[0]];
                        if (!icon?.icon) return null;
                        return (
                            <img src={icon.icon} alt={icon.name} title={icon.name}
                                 width={20} height={20}
                                 style={{ width: 20, height: 20, objectFit: 'contain', borderRadius: 3, border: '1px solid var(--status-info-border)', background: 'var(--status-info-bg)' }} />
                        );
                    })()}
                </div>
```

Replace the old boons block and the whole skill row with one buff row. The `minHeight` is what keeps card height stable when a player has neither boons nor conditions:

```tsx
            <div data-buff-row style={{ display: 'flex', alignItems: 'center', gap: 3, minHeight: 18, flexWrap: 'wrap' }}>
                {status !== 'dead' && (
                    <>
                        <span data-cluster="boons" style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {boons.map(b => (
                                <BuffIcon key={b.id} id={b.id} stacks={b.stacks} icons={boonIcons} borderColor="var(--border-hover)" />
                            ))}
                        </span>
                        {boons.length > 0 && condis.length > 0 && (
                            <span data-buff-divider style={{ width: 1, height: 14, background: 'var(--border-default)', flexShrink: 0, margin: '0 1px' }} />
                        )}
                        <span data-cluster="condis" style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {condis.map(c => (
                                <BuffIcon key={c.id} id={c.id} stacks={c.stacks} icons={boonIcons} borderColor="rgba(248,113,113,0.55)" />
                            ))}
                        </span>
                    </>
                )}
            </div>
```

Tighten the card chrome: `padding: '4px 7px'`, `margin: '1px 0'` (not `1px 4px` — the side margin is what gives the squad list a horizontal scrollbar), profession icon down to 20px, HP bar `marginBottom: 3`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/PartyMemberCard.test.tsx --maxWorkers=2`
Expected: PASS, including all eleven pre-existing cases.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/PartyMemberCard.tsx src/renderer/stats/map/__tests__/PartyMemberCard.test.tsx
git commit -m "feat(replay): add conditions to the member card and tighten it to ~62px

The skill name string went; it forced its own 20px row for information
the icon already carries.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Squad panel — per-party collapse, crosshair spotlight, hosted health strip

**Files:**
- Modify: `src/renderer/stats/map/ReplaySquadPanel.tsx`
- Modify: `src/renderer/index.css`
- Modify: `src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx`
- Modify: `src/renderer/stats/map/__tests__/SquadHealthStrip.test.tsx`

**Interfaces:**
- Consumes: `replayCollapsedParties` / `toggleReplayPartyCollapsed` (Task 1), `SquadHealthStrip`, `PartyMemberCard`.
- Produces: `ReplaySquadPanel` keeps its existing props `{ fight, collapsed, onToggle }`.

**The one behavioural collision this redesign creates.** The party header `<button>` is currently the *only* way to turn the spotlight on. It now collapses the group instead, and spotlight moves to a small crosshair button at the right of the header, keeping `aria-pressed`. Collapse wins the row because it is the more frequent action.

Parties render expanded by default (an empty `replayCollapsedParties` means all expanded). The health strip moves off the map and into the panel header, still gated by the `squadHealthStrip` layer toggle — which now means "show the strip in the squad panel".

- [ ] **Step 1: Write the failing tests**

Append to `src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx`:

```tsx
describe('ReplaySquadPanel party collapse and spotlight', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('renders every party expanded by default', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 }), mkMember({ name: 'B', group: 2 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(screen.getByText('A')).toBeTruthy();
        expect(screen.getByText('B')).toBeTruthy();
    });

    it('clicking a party header collapses that party only', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 }), mkMember({ name: 'B', group: 2 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Collapse Party 1'));
        expect(screen.queryByText('A')).toBeNull();
        expect(screen.getByText('B')).toBeTruthy();
    });

    it('clicking a collapsed party header expands it again', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Collapse Party 1'));
        fireEvent.click(screen.getByTitle('Expand Party 1'));
        expect(screen.getByText('A')).toBeTruthy();
    });

    it('the party header no longer toggles the spotlight', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Collapse Party 1'));
        expect(useStatsStore.getState().replaySpotlightParty).toBeNull();
    });

    it('the crosshair button sets the spotlight party', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Spotlight Party 1'));
        expect(useStatsStore.getState().replaySpotlightParty).toBe(1);
    });

    it('the crosshair button clears an active spotlight and reports aria-pressed', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Spotlight Party 1'));
        const btn = screen.getByTitle('Clear spotlight on Party 1');
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(btn);
        expect(useStatsStore.getState().replaySpotlightParty).toBeNull();
    });

    it('collapsing a party leaves the spotlight untouched', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Spotlight Party 1'));
        fireEvent.click(screen.getByTitle('Collapse Party 1'));
        expect(useStatsStore.getState().replaySpotlightParty).toBe(1);
    });

    it('hosts the health strip in its header when the layer is on', () => {
        useStatsStore.getState().setReplayLayer('squadHealthStrip', true);
        const fight = mkFight([mkMember({ name: 'A' }), mkMember({ name: 'B' })]);
        const { container } = render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(container.querySelectorAll('[data-hpcell]').length).toBe(2);
    });

    it('omits the health strip when the layer is off', () => {
        const fight = mkFight([mkMember({ name: 'A' })]);
        const { container } = render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(container.querySelectorAll('[data-hpcell]').length).toBe(0);
    });

    it('applies the thin-scrollbar class to the scrolling roster', () => {
        const fight = mkFight([mkMember()]);
        const { container } = render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(container.querySelector('.replay-scroll')).not.toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx --maxWorkers=2`
Expected: FAIL — no `Collapse Party 1` title; the header still owns the spotlight.

- [ ] **Step 3: Add the thin-scrollbar class**

Append to `src/renderer/index.css`:

```css
/* Replay HUD panels only. The app-wide 10px/12px scrollbars stay as they
   are — a floating card over the map cannot afford that much of its width. */
.replay-scroll {
    --scrollbar-size: 6px;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) transparent;
}

.replay-scroll::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

.replay-scroll::-webkit-scrollbar-track {
    background: transparent;
}

.replay-scroll::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb);
    border: none;
    border-radius: 3px;
}

.replay-scroll::-webkit-scrollbar-thumb:hover {
    background-color: var(--scrollbar-thumb-hover);
}
```

- [ ] **Step 4: Rewrite the panel**

In `ReplaySquadPanel.tsx`, add imports:

```tsx
import { Crosshair, ChevronDown, ChevronRight } from 'lucide-react';
import { SquadHealthStrip } from './SquadHealthStrip';
```

and the new store reads:

```tsx
    const collapsedParties = useStatsStore(state => state.replayCollapsedParties);
    const toggleParty = useStatsStore(state => state.toggleReplayPartyCollapsed);
    const showHealthStrip = useStatsStore(state => state.replayLayers.squadHealthStrip);
```

Change the open-panel container to a floating card and put the strip in the header:

```tsx
        <div className="app-dropdown" style={{
            width: 216, maxHeight: '100%',
            borderRadius: 10, border: '1px solid var(--border-default)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Squad · {allies.length}
                    </span>
                    <button
                        type="button"
                        title="Collapse squad panel"
                        onClick={onToggle}
                        style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px', borderRadius: 3, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                        ▶
                    </button>
                </div>
                {/* Was an absolute overlay across the top of the map; it reads
                    better banded above the roster it summarises. */}
                {showHealthStrip && (
                    <div style={{ marginTop: 4 }}>
                        <SquadHealthStrip fight={fight} timeMs={timeMs} />
                    </div>
                )}
            </div>
            <div className="replay-scroll" style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, padding: '3px 5px' }}>
```

Replace the party heading button with a header row carrying two controls:

```tsx
                {byParty.map(([group, members]) => {
                    const isCollapsed = collapsedParties.has(group);
                    const isSpotlit = group === spotlightParty;
                    return (
                        <React.Fragment key={group}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                borderTop: '1px solid var(--border-subtle)', marginTop: 2, paddingTop: 3,
                            }}>
                                {/* Row = collapse, crosshair = spotlight. The row
                                    used to be the only spotlight control; collapse
                                    wins it because it is the more frequent action. */}
                                <button
                                    type="button"
                                    title={isCollapsed ? `Expand Party ${group}` : `Collapse Party ${group}`}
                                    aria-expanded={!isCollapsed}
                                    onClick={() => toggleParty(group)}
                                    style={{
                                        flex: 1, display: 'flex', alignItems: 'center', gap: 3,
                                        textAlign: 'left', padding: '2px 4px',
                                        fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
                                        color: isSpotlit ? 'var(--status-warning)' : 'var(--text-muted)',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                    }}
                                >
                                    {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                                    Party {group}
                                    <span style={{ opacity: 0.6, fontWeight: 500 }}>· {members.length}</span>
                                </button>
                                <button
                                    type="button"
                                    title={isSpotlit ? `Clear spotlight on Party ${group}` : `Spotlight Party ${group}`}
                                    aria-pressed={isSpotlit}
                                    onClick={() => setReplaySpotlightParty(isSpotlit ? null : group)}
                                    style={{
                                        width: 18, height: 18, borderRadius: 3, flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: isSpotlit ? 'var(--status-warning)' : 'var(--text-muted)',
                                    }}
                                >
                                    <Crosshair size={11} />
                                </button>
                            </div>
                            {!isCollapsed && members.map(m => (
                                <PartyMemberCard
                                    key={m.id}
                                    member={m}
                                    timeMs={timeMs}
                                    boonIcons={boonIcons}
                                    skillIcons={skillIcons}
                                    onFollow={setReplayFollowTarget}
                                    isFollowed={(m.account || m.name) === followTarget}
                                />
                            ))}
                        </React.Fragment>
                    );
                })}
```

Also give the collapsed rail button `className="app-dropdown"` and `borderRadius: 8` so it reads as a floating rail rather than a docked edge.

- [ ] **Step 5: Repoint the health-strip test at its new mount**

In `SquadHealthStrip.test.tsx`, keep both existing direct-render cases (the component itself is unchanged) and add one that proves the new mount point:

```tsx
import { ReplaySquadPanel } from '../ReplaySquadPanel';
import { useStatsStore } from '../../statsStore';

it('renders inside the squad panel header when the layer is on', () => {
    useStatsStore.setState((useStatsStore as any).getInitialState());
    useStatsStore.getState().setReplayLayer('squadHealthStrip', true);
    const fight = mkFight([mkMember({ name: 'A', account: 'A.1' })]);
    const { container } = render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
    expect(container.querySelectorAll('[data-hpcell]').length).toBe(1);
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx src/renderer/stats/map/__tests__/SquadHealthStrip.test.tsx --maxWorkers=2`
Expected: PASS. The pre-existing `'renders party headers for each unique group'` case still passes — `Party 1` is still the header text.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/map/ReplaySquadPanel.tsx src/renderer/index.css src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx src/renderer/stats/map/__tests__/SquadHealthStrip.test.tsx
git commit -m "feat(replay): collapsible parties, crosshair spotlight, hosted health strip

Resolves the header collision: the row collapses, a crosshair button
spotlights. Adds a 6px .replay-scroll scrollbar scoped to the HUD panels.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Reassemble `ReplayView` as a full-bleed layout host

**Files:**
- Modify: `src/renderer/stats/map/ReplayView.tsx`
- Modify: `src/renderer/test/setup.ts` (ResizeObserver stub, if absent)
- Test: `src/renderer/stats/map/__tests__/ReplayView.layout.test.tsx` (create)

**Interfaces:**
- Consumes: everything built in Tasks 3–13.
- Produces: `ReplayView` keeps its existing props `{ fights, style }`.

The SVG fills the whole replay area; every panel floats over it. Card geometry: layers top-left, squad right (top to just above the transport), fight identity centred at top, legend bottom-left above the transport, zoom cluster right of centre and left of the squad card, transport spanning between the legend and the zoom cluster.

**Responsive rules** — `src/web/ReplayViewWeb.tsx` re-exports this component into the web report's narrower containers, and floating cards that eat the whole map are worse than docked ones. Driven by the `panelSize` `ResizeObserver` that already exists at `ReplayView.tsx:138-153`:

- container width < 1100px → layers forced collapsed
- container width < 900px → squad forced collapsed too

Auto-collapse must **never overwrite an explicit user choice made at a wider size.** Keep the stored `layersOpen` / `panelCollapsed` state untouched and derive a separate effective value.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/ReplayView.layout.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ReplayView } from '../ReplayView';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

let nextId = 1;
const mkMember = (o: Partial<SquadMemberMovement> = {}): SquadMemberMovement => ({
    id: nextId++,
    name: 'Cmdr', account: 'C.1', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: true, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [[100, 100], [110, 110]], downRanges: [], deadRanges: [], ...o,
});

const mkFight = (): ReplayFightPayload => ({
    fightId: 'f1', fightIndex: 0, label: 'Fight A', timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 1, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 60_000, pixelsPerInch: { x: 1, y: 1 }, members: [mkMember()], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }], killEvents: [], damageSpikeEvents: [],
    rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null,
});

/** jsdom reports 0x0 for everything; stub the observed width the HUD reads. */
function stubContainerWidth(width: number) {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ width, height: 700, left: 0, top: 0, right: width, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }),
    });
}

describe('ReplayView layout', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
        stubContainerWidth(1400);
    });

    it('renders the fight identity pill instead of a picker bar', () => {
        render(<ReplayView fights={[mkFight()]} />);
        expect(screen.getByText('Fight A')).toBeTruthy();
        expect(screen.getByTitle('Show all fights')).toBeTruthy();
    });

    it('renders the map legend and the transport bar', () => {
        render(<ReplayView fights={[mkFight()]} />);
        expect(screen.getByText(/on the map/i)).toBeTruthy();
        expect(screen.getByTitle(/show cc and strip lanes/i)).toBeTruthy();
    });

    it('renders the scale bar while the scaleBar layer is on', () => {
        render(<ReplayView fights={[mkFight()]} />);
        expect(screen.getByTestId('scale-bar')).toBeTruthy();
    });

    it('hides the scale bar when the layer is off', () => {
        useStatsStore.getState().setReplayLayer('scaleBar', false);
        render(<ReplayView fights={[mkFight()]} />);
        expect(screen.queryByTestId('scale-bar')).toBeNull();
    });

    it('shows the squad roster at a wide container size', () => {
        render(<ReplayView fights={[mkFight()]} />);
        fireEvent.click(screen.getByTitle('Expand squad panel'));
        expect(screen.getByText('Cmdr')).toBeTruthy();
    });

    it('forces the layers card collapsed below 1100px', () => {
        stubContainerWidth(1000);
        render(<ReplayView fights={[mkFight()]} />);
        expect(screen.getByTitle('Show layers')).toBeTruthy();
    });

    it('forces the squad card collapsed below 900px', () => {
        stubContainerWidth(800);
        render(<ReplayView fights={[mkFight()]} />);
        expect(screen.getByTitle('Expand squad panel')).toBeTruthy();
        expect(screen.queryByText('Cmdr')).toBeNull();
    });

    it('restores the user choice when the container widens again', () => {
        const { rerender } = render(<ReplayView fights={[mkFight()]} />);
        fireEvent.click(screen.getByTitle('Expand squad panel'));
        expect(screen.getByText('Cmdr')).toBeTruthy();
        act(() => { stubContainerWidth(800); window.dispatchEvent(new Event('resize')); });
        rerender(<ReplayView fights={[mkFight()]} />);
        act(() => { stubContainerWidth(1400); window.dispatchEvent(new Event('resize')); });
        rerender(<ReplayView fights={[mkFight()]} />);
        expect(screen.getByText('Cmdr')).toBeTruthy();
    });
});
```

`ResizeObserver` is not implemented in jsdom. If `src/renderer/test/setup.ts` has no stub, add one there:

```ts
if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
        constructor(private cb: () => void) { window.addEventListener('resize', this.cb); }
        observe() { this.cb(); }
        unobserve() {}
        disconnect() { window.removeEventListener('resize', this.cb); }
    } as any;
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/ReplayView.layout.test.tsx --maxWorkers=2`
Expected: FAIL — no legend, no scale bar, no responsive collapse.

- [ ] **Step 3: Add the derived collapse state**

In `ReplayView.tsx`, after the `panelSize` state, add:

```tsx
    // Auto-collapse below these widths so the floating cards never eat the
    // map in the web report's narrower containers. This is DERIVED — it never
    // writes back to layersOpen / panelCollapsed, so a choice made at a wide
    // size survives a trip through a narrow one.
    const containerWidth = panelSize[0];
    const layersForced = containerWidth > 0 && containerWidth < 1100;
    const squadForced = containerWidth > 0 && containerWidth < 900;
    const layersEffectivelyOpen = layersOpen && !layersForced;
    const squadEffectivelyCollapsed = panelCollapsed || squadForced;
```

Pass `layersEffectivelyOpen` / `squadEffectivelyCollapsed` to the two panels instead of the raw state.

- [ ] **Step 4: Restructure the body**

The map container becomes the whole body. Delete the trailing `<SyncedTimeline />` and the entire controls bar; add a floating `<TransportBar />` instead. Final child order inside `<div ref={mapContainerRef}>`:

```tsx
                    <div ref={mapContainerRef} style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
                        {/* 1. the full-bleed canvas — unchanged, still preserveAspectRatio="xMidYMid slice" */}
                        <svg className="replay-canvas" ... />

                        {/* 2. picker overlay (unchanged, zIndex 30) */}
                        {/* 3. member tooltip (unchanged, zIndex 40) */}

                        {/* 4. fight identity, centred */}
                        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 15 }}>
                            <FightIdentityPill fights={fights} onOpenPicker={() => setPickerCollapsed(false)} />
                        </div>

                        {/* 5. layers, top-left */}
                        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 20, display: 'flex', maxHeight: 'calc(100% - 90px)' }}>
                            <LayersPanel open={layersEffectivelyOpen} onToggle={() => setLayersOpen(v => !v)} />
                        </div>

                        {/* 6. squad, right, stopping above the transport */}
                        <div ref={squadPanelRef} style={{ position: 'absolute', top: 8, right: 8, bottom: 86, zIndex: 20, display: 'flex', alignItems: 'stretch' }}>
                            <ReplaySquadPanel
                                fight={selectedFight}
                                collapsed={squadEffectivelyCollapsed}
                                onToggle={() => setPanelCollapsed(v => !v)}
                            />
                        </div>

                        {/* 7. zoom cluster, right of centre, left of the squad card */}
                        <div style={{ position: 'absolute', top: 8, right: (squadEffectivelyCollapsed ? 28 : 216) + 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4, transition: 'right 0.15s' }}>
                            {/* the four existing zoom / reset / fullscreen buttons, unchanged */}
                        </div>

                        {/* 8. legend + scale bar, bottom-left above the transport */}
                        <div style={{ position: 'absolute', left: 8, bottom: 86, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                            <MapLegend />
                            {layers.scaleBar && (
                                <ScaleBar
                                    pixelsPerInch={selectedFight.movementData.pixelsPerInch}
                                    scale={viewport.scale}
                                />
                            )}
                        </div>

                        {/* 9. status chips (follow / re-center / spotlight) */}
                        {/* 10. CcTakenNotice */}

                        {/* 11. transport, spanning between legend and zoom cluster */}
                        <div style={{ position: 'absolute', left: 150, right: (squadEffectivelyCollapsed ? 28 : 216) + 16, bottom: 8, zIndex: 15 }}>
                            <TransportBar fight={selectedFight} />
                        </div>
                    </div>
```

Delete the old `{layers.squadHealthStrip && <div style={{ position: 'absolute', top: 0, ... }}><SquadHealthStrip /></div>}` block — the strip now lives in the squad panel header (Task 13). Remove the `SquadHealthStrip` import from this file. Add imports for `MapLegend`, `ScaleBar`, `TransportBar`, and drop `SyncedTimeline`, `Pause`, `Play`, `formatDuration` and `normalizeMapNameShort` if they are no longer referenced.

Change the status-chip and follow-chip `left` offsets from `(layersOpen ? 220 : 28) + 10` to `(layersEffectivelyOpen ? 216 : 28) + 16`, and set their `bottom` to `96` so they sit above the transport rather than under it.

- [ ] **Step 5: Verify the file shrank as designed**

Run: `wc -l src/renderer/stats/map/ReplayView.tsx`
Expected: roughly 250 lines (was 625). If it is well over 300, something that belongs in a layer is still inline — check for leftover marker or landmark code.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/ --maxWorkers=2`
Expected: PASS across the whole map test directory.

- [ ] **Step 7: Typecheck and lint**

Run: `npm run validate`
Expected: clean. `lint` runs with `--max-warnings 0`, so unused imports left behind from the restructure fail here — remove them rather than suppressing.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/map/ReplayView.tsx src/renderer/stats/map/__tests__/ReplayView.layout.test.tsx src/renderer/test/setup.ts
git commit -m "feat(replay): full-bleed map with a floating HUD

Every panel now floats over an edge-to-edge canvas. Cards auto-collapse
below 1100px (layers) and 900px (squad) for the web report's narrower
containers, deriving the collapse rather than overwriting the user's
stored choice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Full validation and visual check

**Files:** none modified unless a failure demands it.

**Interfaces:**
- Consumes: everything.
- Produces: a merge-ready branch.

- [ ] **Step 1: Run the whole unit suite**

Run: `npx vitest run --maxWorkers=2`
Expected: PASS. Failures outside `src/renderer/stats/map/` most likely come from Task 2 — a fixture now carrying eight more buff ids. Update the expected counts; do not narrow the condition set.

- [ ] **Step 2: Validate types and lint**

Run: `npm run validate`
Expected: clean.

- [ ] **Step 3: Confirm the web report still builds**

Run: `npm run build:web`
Expected: succeeds. `src/web/ReplayViewWeb.tsx` re-exports `ReplayView`, so a broken import surfaces here.

- [ ] **Step 4: Measure the payload cost of the condition set**

The spec flags this as the one change that is not free: eight condition ids is roughly +67% on the `boonStates` portion of each member, against a `replayFights` block that is already ~66% of `report.json`.

Build a report from a real multi-fight dataset and compare `report.json` size against the pre-change baseline (`git stash` the branch, build, unstash). If the growth is materially worse than the estimate, cut the set to the four the spec names as the fallback — Vulnerability (738), Immobile (727), Chilled (722), Blind (720) — by editing only `TRACKED_REPLAY_CONDI_IDS` in `src/shared/replayBuffs.ts` and updating `replayBuffs.test.ts`. Nothing else needs to change; `isReplayCondition` and every consumer follow the set.

Report the measured before/after sizes to the user either way.

- [ ] **Step 5: Run the Electron E2E suite**

Run: `npm run test:e2e:electron`
Expected: PASS. This suite touches the replay, so a selector keyed on the deleted `FightPickerBar` or the old controls bar fails here rather than in vitest. Fix the selectors to match the new HUD.

- [ ] **Step 6: Look at it**

Run `npm run dev`, open a report with replay data, and confirm against the spec:
- Layers and squad cards float; the map runs edge to edge behind them.
- The lanes band starts collapsed and the Lanes button opens it.
- Lane labels sit in the gutter, not on top of the opening seconds of the bars.
- Every party starts expanded; clicking a party header collapses just that party; the crosshair spotlights it.
- Member cards show boons, a divider, then conditions.
- Player icons stay a constant screen size while objective labels recede as you zoom.
- Both floating cards are opaque, not see-through (blur is dead on Linux — a card that looks translucent is missing its `app-dropdown` override).
- Narrow the window past 1100px then 900px and watch the cards rail themselves; widen it again and confirm your choices come back.

- [ ] **Step 7: Report to the user**

Summarise: what shipped, the measured `report.json` delta from Step 4, and anything Step 6 turned up. Do not push — the user pushes.
