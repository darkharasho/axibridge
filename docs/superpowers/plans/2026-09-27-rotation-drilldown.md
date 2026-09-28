# Rotation Drill-Down and Small-Screen Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Rotation section legible at real screen sizes and give a single cast a clickable detail sheet instead of a hover tooltip.

**Architecture:** Renderer-only. `RotationSection` gains the decoded-cast memo (lifted out of `RotationTrack`), selection state, and a responsive player rail; `RotationTrack` gains a measured pixel width so it can decide between icon-plus-name and icon-only, and its cast boxes become buttons; a new `RotationCastSheet` renders the selected cast's detail. No aggregation, wire-format, or sidecar change.

**Tech Stack:** React 18 + TypeScript, Tailwind utility classes with CSS custom properties, vitest + @testing-library/react + jsdom, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-09-27-rotation-drilldown-design.md`

## Global Constraints

- Run vitest with limited parallelism: `npx vitest run <path> --maxWorkers=2`. Never run it unbounded.
- `npm run validate` (typecheck + `eslint --max-warnings 0`) must pass before every commit.
- **No data change.** Do not edit `computeRotationTimeline.ts` except where this plan says so, do not change the columnar wire shape, and **do not change `SLICE_SIDECAR_VERSION`** — it stays at `5`.
- **Preserve the DOM contract.** `data-cast`, `data-interrupted="true"`, and `data-prelog="true"` must keep appearing exactly as they do today; eight existing assertions key on them.
- **Never render a raw skill id.** No markup may match `/Skill \d+/`.
- **Only a `string` icon may reach an `<img>`.** `DecodedCast.icon` is `string | number | undefined`; a bare number is an unexpanded `iconIndex` reference and must render no `<img>` at all. Guard with `typeof x === 'string' && x.length > 0` everywhere an icon is rendered — including the new sheet.
- Styling uses the existing CSS custom properties (`--bg-card-inner`, `--bg-hover`, `--border-default`, `--text-primary`, `--text-secondary`, `--text-muted`, `--status-error`, `--brand-primary`, `--radius-md`). Do not introduce new colour literals; `ROTATION_ACCENT = '#8b5cf6'` already exists in `RotationSection.tsx` and stays.
- Responsive behaviour is Tailwind breakpoint classes (`hidden sm:flex`, `sm:hidden`), never a JS media query.

## Review Focus

1. **A zero-duration cast at the widest row setting.** `MIN_WIDTH_PCT` stops being a percentage, so a 0ms cast could collapse to nothing and become unclickable — it must still be a 26px target at every row width. Pinned in Task 1.
2. **`ResizeObserver` never firing, or reporting width 0.** jsdom has no layout engine and the shim's `observe()` deliberately does not invoke the callback, so an unmeasured track is the normal first-paint state — it must fall back to icon-only, never to a clipped name. Pinned in Task 2, in both directions.
3. **A stale selected cast index after the player or fight changes.** Cast index 40 is a different skill for a different player; leaving the sheet open would show one player's timing under another's name. Pinned in Task 4.
4. **A selected cast whose palette entry has a numeric icon.** The `typeof === 'string'` guarantee is currently enforced in one place; the sheet is a second place to render an icon and can regress it silently. Pinned in Task 4.
5. **A negative "gap since previous cast" when two casts overlap.** Real logs contain casts that start before the previous one finished; the value must render as-is rather than clamping to 0 or producing `NaN`. Pinned in Task 4.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/renderer/stats/sections/RotationSection.tsx` | Owns fight/player/wrap/selection state, decodes casts, lays out rail + track + sheet | Modify |
| `src/renderer/stats/sections/RotationTrack.tsx` | Renders wrapped rows of cast buttons; measures its own width | Modify |
| `src/renderer/stats/sections/RotationCastSheet.tsx` | Renders one selected cast's detail | **Create** |
| `src/renderer/stats/__tests__/RotationSection.test.tsx` | All rotation UI assertions | Modify (additions only) |

`RotationCastSheet` is its own file because `RotationSection` is already ~205 lines and the sheet carries its own derived values (previous cast, same-skill casts, the spark strip). The player chip strip stays inline in `RotationSection` — it is ~12 lines of JSX with no logic.

---

### Task 1: Row-width ladder and visual scale

**Files:**
- Modify: `src/renderer/stats/sections/RotationSection.tsx` (the `WRAP_OPTIONS` constant, the `wrapMs` initial state, the rail's width class)
- Modify: `src/renderer/stats/sections/RotationTrack.tsx` (the `MIN_WIDTH_PCT` constant, `buildRows`, the row and box markup, the legend)
- Test: `src/renderer/stats/__tests__/RotationSection.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `MIN_BOX_PX = 26` (module-private to `RotationTrack.tsx`), replacing `MIN_WIDTH_PCT`. `CastBox.widthPct` is now the true clipped width and may be `0`.

- [ ] **Step 1: Write the failing tests**

Append to `src/renderer/stats/__tests__/RotationSection.test.tsx`, inside the existing `describe('RotationSection', ...)` block:

```tsx
    it('offers a 10s row width and defaults to 15s', () => {
        render(<RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const select = screen.getByLabelText('Row width') as HTMLSelectElement;
        expect(select.value).toBe('15000');
        expect(Array.from(select.options).map(o => o.textContent)).toEqual(['10s', '15s', '30s', '60s']);
    });

    it('keeps a zero-duration cast clickable at the widest row setting', () => {
        const zeroDur: RotationFightData = {
            ...fight,
            players: [{ ...fight.players[0], skill: [0], dt: [2000], dur: [0], interrupted: [] }],
        };
        const { container } = render(
            <RotationSection fights={[zeroDur]} recorded selectedFightId="f1" />);
        const box = container.querySelector('[data-cast]') as HTMLElement;
        expect(box).toBeTruthy();
        expect(box.style.minWidth).toBe('26px');
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/stats/__tests__/RotationSection.test.tsx --maxWorkers=2`

Expected: FAIL — the first because `select.value` is `'30000'` and the option list is `['15s','30s','60s']`; the second because `box.style.minWidth` is `''`.

- [ ] **Step 3: Widen the ladder and change the default**

In `src/renderer/stats/sections/RotationSection.tsx`, replace the `WRAP_OPTIONS` constant:

```tsx
const WRAP_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 10000, label: '10s' },
    { value: 15000, label: '15s' },
    { value: 30000, label: '30s' },
    { value: 60000, label: '60s' },
];
```

and change the initial wrap state from `30000` to `15000`:

```tsx
    // 15s, not 30s: at 30s a typical 600-900ms cast is ~25px wide on a desktop
    // track, too narrow for the 20px icon plus any name. 15s gives ~55-70px
    // (icon, no name) and 10s gives ~100px+ (icon and name). 30s and 60s remain
    // for reading a long fight's shape on one screen.
    const [wrapMs, setWrapMs] = useState<number>(15000);
```

- [ ] **Step 4: Replace the percentage floor with a pixel minimum**

In `src/renderer/stats/sections/RotationTrack.tsx`, replace the `MIN_WIDTH_PCT` constant:

```tsx
/**
 * Minimum rendered box width. A percentage floor cannot express "wide enough
 * for the icon": the pixel width a percentage buys depends on the row's width,
 * which the percentage does not know. 26px is the 20px icon plus its 2x2px
 * padding and 2x1px border, so a zero-duration cast stays a real click target
 * at every row width.
 */
const MIN_BOX_PX = 26;
```

In `buildRows`, stop flooring the percentage — the pixel minimum now owns that job:

```tsx
            const widthPct = (widthMs / wrapMs) * 100;
```

and in the box's inline `style`, add the minimum beside the width:

```tsx
                                    left: `${box.leftPct}%`,
                                    width: `${box.widthPct}%`,
                                    minWidth: `${MIN_BOX_PX}px`,
```

- [ ] **Step 5: Scale the track and legend up**

Still in `RotationTrack.tsx`, apply exactly these class changes:

- The row container: `className="relative h-6 w-full overflow-hidden"` becomes `className="relative h-9 w-full overflow-hidden"`.
- The cast box: `className="absolute top-0.5 bottom-0.5 flex items-center gap-0.5 overflow-hidden px-0.5 text-[9px] leading-none"` becomes `className="absolute top-[3px] bottom-[3px] flex items-center gap-1 overflow-hidden px-1 text-[11px] leading-none"`.
- The icon: `className="h-3 w-3 object-contain shrink-0"` becomes `className="h-5 w-5 object-contain shrink-0"`. **Keep `object-contain`** — the class-icon SVGs are non-square and overflow a bare sized `img` without it.
- The legend row: `className="flex flex-wrap items-center gap-3 text-[10px] mb-1.5"` becomes `className="flex flex-wrap items-center gap-3.5 text-[11px] mb-2"`.
- The legend swatch: `className="inline-block w-3 h-2.5 rounded-sm"` becomes `className="inline-block w-3.5 h-3 rounded-sm"`.

In `src/renderer/stats/sections/RotationSection.tsx`, widen the rail: `className="w-48 shrink-0 flex flex-col gap-1"` becomes `className="w-52 shrink-0 flex flex-col gap-1"`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/RotationSection.test.tsx --maxWorkers=2`

Expected: PASS — all ten tests (the eight that existed plus the two new ones).

- [ ] **Step 7: Validate**

Run: `npm run validate`

Expected: no type errors, no lint warnings.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/sections/RotationSection.tsx src/renderer/stats/sections/RotationTrack.tsx src/renderer/stats/__tests__/RotationSection.test.tsx
git commit -m "feat(rotation): add 10s rows, default to 15s, scale the track up

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Measured icon-only fallback

**Files:**
- Modify: `src/renderer/stats/sections/RotationTrack.tsx`
- Test: `src/renderer/stats/__tests__/RotationSection.test.tsx`

**Interfaces:**
- Consumes: `MIN_BOX_PX` from Task 1; `CastBox.widthPct` may be `0`.
- Produces: `NAME_MIN_PX = 78` (module-private). Every row element carries `data-track-row=""`.

**Background the implementer needs:** jsdom has no layout engine. `src/renderer/test/setup.ts` installs a `ResizeObserver` stub whose `observe()` deliberately does **not** invoke the callback (a synchronous callback from a commit-phase effect calls `setState` mid-commit and breaks React across unrelated suites). The stub re-invokes the callback on `window`'s `resize` event, and its comment states the rule: *a component that needs an initial measurement must read it directly from the ref rather than relying on `observe()` firing.* Follow that rule.

- [ ] **Step 1: Write the failing tests**

Change the test file's first import line to add `vi`, and the testing-library import to add `act`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
```

Append inside the existing `describe` block:

```tsx
    /** jsdom reports every width as 0, so a test that wants a measured track
     *  must stub the row's rect and then drive the ResizeObserver stub with a
     *  window resize event — see the comment in src/renderer/test/setup.ts. */
    const measureTrack = (container: HTMLElement, width: number) => {
        const row = container.querySelector('[data-track-row]') as HTMLElement;
        vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ width } as DOMRect);
        act(() => { window.dispatchEvent(new Event('resize')); });
    };

    it('shows the skill name once the track is wide enough for it', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        measureTrack(container, 2000);
        const box = container.querySelectorAll('[data-cast]')[0] as HTMLElement;
        expect(box.textContent).toContain('Symbol of Blades');
    });

    it('falls back to the icon alone when the box is too narrow for a name', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        measureTrack(container, 120);
        const box = container.querySelectorAll('[data-cast]')[0] as HTMLElement;
        expect(box.textContent).not.toContain('Symbol of Blades');
        expect(box.querySelector('img')).toBeTruthy();
    });

    it('renders the icon alone when the track has never been measured', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const box = container.querySelectorAll('[data-cast]')[0] as HTMLElement;
        expect(box.textContent).not.toContain('Symbol of Blades');
        expect(box.querySelector('img')).toBeTruthy();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/stats/__tests__/RotationSection.test.tsx --maxWorkers=2`

Expected: FAIL — `container.querySelector('[data-track-row]')` is `null`, so `measureTrack` throws on the first two; the third fails because the name is currently always rendered.

- [ ] **Step 3: Measure the track**

In `src/renderer/stats/sections/RotationTrack.tsx`, extend the React import and add the constant:

```tsx
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
```

```tsx
/**
 * Below this many pixels a box shows its icon alone, centred. Tuned against
 * the 11px label in the app's font stack — it is a chosen constant, not a
 * derived one, so adjust it by looking at the result rather than by algebra.
 */
const NAME_MIN_PX = 78;
```

Inside the `RotationTrack` component, above the returned JSX:

```tsx
    // Rows are all the same width, so measuring the first one measures them
    // all. `measure()` runs directly here rather than waiting on `observe()`:
    // the test stub's `observe()` is a deliberate no-op, and in the browser a
    // layout-effect read is the earliest correct measurement anyway.
    const rowRef = useRef<HTMLDivElement | null>(null);
    const [trackPx, setTrackPx] = useState(0);
    useLayoutEffect(() => {
        const el = rowRef.current;
        if (!el) return;
        const measure = () => setTrackPx(el.getBoundingClientRect().width);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [wrapMs, rows.length]);
```

- [ ] **Step 4: Use the measurement**

Still in `RotationTrack.tsx`, tag the row element and attach the ref — on the row `div` that currently reads `key={rowIndex} className="relative h-9 w-full overflow-hidden"`:

```tsx
                <div
                    key={rowIndex}
                    ref={rowIndex === 0 ? rowRef : undefined}
                    data-track-row=""
                    className="relative h-9 w-full overflow-hidden"
                    style={{ background: 'var(--bg-card-inner)', borderRadius: 'var(--radius-md)' }}
                >
```

Then, inside the `row.map((box) => {` body, beside the existing `iconSrc` line:

```tsx
                        // An unmeasured track (first paint, and jsdom, which has no
                        // layout engine) reports 0 and takes the icon-only branch.
                        // An icon with no name is always correct; a name clipped to
                        // three characters is not.
                        const showName = trackPx > 0 && (box.widthPct / 100) * trackPx >= NAME_MIN_PX;
```

Change the box's className to centre the icon when it is alone — replace `items-center gap-1` with:

```tsx
                                className={`absolute top-[3px] bottom-[3px] flex items-center gap-1 overflow-hidden px-1 text-[11px] leading-none ${showName ? 'justify-start' : 'justify-center'}`}
```

and gate the name span:

```tsx
                                {showName && <span className="truncate min-w-0">{box.name}</span>}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/RotationSection.test.tsx --maxWorkers=2`

Expected: PASS — thirteen tests.

- [ ] **Step 6: Validate**

Run: `npm run validate`

Expected: no type errors, no lint warnings.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/sections/RotationTrack.tsx src/renderer/stats/__tests__/RotationSection.test.tsx
git commit -m "feat(rotation): render the icon alone when a cast box is too narrow for its name

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Lift the decode, make casts selectable buttons

**Files:**
- Modify: `src/renderer/stats/sections/RotationTrack.tsx`
- Modify: `src/renderer/stats/sections/RotationSection.tsx`
- Test: `src/renderer/stats/__tests__/RotationSection.test.tsx`

**Interfaces:**
- Consumes: `NAME_MIN_PX`, `MIN_BOX_PX`, `data-track-row` from Tasks 1-2.
- Produces:
  - `RotationTrackProps` becomes `{ fight: RotationFightData; wrapMs: number; casts: DecodedCast[]; selectedIndex: number | null; onSelectCast: (index: number) => void }`. **`player` is removed** — once the decode happens in the section, the track has no remaining use for it, and an unused prop is a lie about what the component depends on.
  - `CastBox` gains `castIndex: number` — the index into `casts`, which `key` alone did not preserve as a number.
  - `RotationSection` exposes nothing new; `selectedCastIndex: number | null` is its private state and Task 4 reads it.

**Why the decode moves:** the sheet in Task 4 needs the *previous* cast, and `buildRows` has already thrown that ordering away by the time it produces per-row boxes. Decoding once in the section and passing the array down gives both consumers the same list, and keeps `decodeRotation` running once per `(fight, player)` rather than once per wrap-width change.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe` block:

```tsx
    it('renders each cast as a button that reports its selection state', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const boxes = Array.from(container.querySelectorAll('[data-cast]')) as HTMLElement[];
        expect(boxes.every(b => b.tagName === 'BUTTON')).toBe(true);
        expect(boxes[0].getAttribute('aria-pressed')).toBe('false');
        act(() => { boxes[0].click(); });
        expect((container.querySelectorAll('[data-cast]')[0] as HTMLElement)
            .getAttribute('aria-pressed')).toBe('true');
    });

    it('keeps the cast data attributes after the boxes become buttons', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        expect(container.querySelectorAll('[data-cast]')).toHaveLength(3);
        expect(container.querySelectorAll('[data-interrupted="true"]')).toHaveLength(1);
        expect(container.querySelector('[data-prelog="true"]')).toBeTruthy();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/stats/__tests__/RotationSection.test.tsx --maxWorkers=2`

Expected: FAIL on the first test — `b.tagName` is `'DIV'`. The second passes already and exists to catch a regression in Step 3.

- [ ] **Step 3: Take the casts as a prop**

In `src/renderer/stats/sections/RotationTrack.tsx`, change the import to drop `decodeRotation` and `RotationPlayerData` (the track no longer takes a player) and add the cast type:

```tsx
import type { DecodedCast, RotationFightData } from '../computeRotationTimeline';
```

Extend the props and the box interface:

```tsx
export interface RotationTrackProps {
    fight: RotationFightData;
    /** Row width in ms: 10000 | 15000 | 30000 | 60000. */
    wrapMs: number;
    /** Decoded once by the section so the detail sheet sees the same list. */
    casts: DecodedCast[];
    /** Index into `casts`, or null when nothing is selected. */
    selectedIndex: number | null;
    onSelectCast: (index: number) => void;
}
```

```tsx
interface CastBox {
    key: string;
    /** Index into the section's `casts`, which `key` does not preserve as a number. */
    castIndex: number;
    name: string;
```

Change `buildRows` to take the casts instead of decoding them:

```tsx
const buildRows = (
    fight: RotationFightData, casts: DecodedCast[], wrapMs: number,
): CastBox[][] => {
    const rowCount = Math.max(1, Math.ceil(fight.durationMs / wrapMs));
```

(delete the `const casts = decodeRotation(fight, player);` line and drop the now-unused `player` parameter), and add `castIndex` to the pushed box:

```tsx
            rows[row].push({
                key: `${castIndex}-${row}`,
                castIndex,
                name: cast.name,
```

Update the component signature and memo:

```tsx
export const RotationTrack: React.FC<RotationTrackProps> = ({
    fight, wrapMs, casts, selectedIndex, onSelectCast,
}) => {
    const rows = useMemo(() => buildRows(fight, casts, wrapMs), [fight, casts, wrapMs]);
```

- [ ] **Step 4: Make the box a button**

Still in `RotationTrack.tsx`, replace the box's opening `<div` with a button. The element keeps every attribute it had; `type="button"` stops it submitting anything, and `appearance-none text-left` undoes the default button chrome that would otherwise fight the inline style:

```tsx
                        const selected = selectedIndex === box.castIndex;
                        return (
                            <button
                                key={box.key}
                                type="button"
                                onClick={() => onSelectCast(box.castIndex)}
                                aria-pressed={selected}
                                aria-label={`${box.name}, cast at ${mmssMillis(box.castTime)}, ${box.duration} milliseconds${box.interrupted ? ', interrupted' : ''}`}
                                data-cast=""
                                data-interrupted={box.interrupted ? 'true' : undefined}
                                data-prelog={box.prelog ? 'true' : undefined}
                                className={`absolute top-[3px] bottom-[3px] flex items-center gap-1 overflow-hidden px-1 text-[11px] leading-none appearance-none text-left ${showName ? 'justify-start' : 'justify-center'}`}
                                title={`${box.name} · ${mmssMillis(box.castTime)} · ${box.duration}ms`}
                                style={{
                                    left: `${box.leftPct}%`,
                                    width: `${box.widthPct}%`,
                                    minWidth: `${MIN_BOX_PX}px`,
                                    background: selected ? 'var(--bg-card-inner)' : 'var(--bg-hover)',
                                    border: boxBorder(box),
                                    outline: selected ? '2px solid var(--brand-primary)' : undefined,
                                    outlineOffset: selected ? '-1px' : undefined,
                                    borderRadius: 'var(--radius-md)',
                                    color: 'var(--text-primary)',
                                }}
                            >
```

and close it with `</button>` instead of `</div>`.

- [ ] **Step 5: Decode in the section and own the selection**

In `src/renderer/stats/sections/RotationSection.tsx`, extend the import:

```tsx
import { decodeRotation, type RotationFightData } from '../computeRotationTimeline';
```

Add the state beside the existing `useState` calls:

```tsx
    const [selectedCastIndex, setSelectedCastIndex] = useState<number | null>(null);
```

Add the memo after the existing `selectedPlayer` memo — memoised on `[fight, selectedPlayer]` exactly, so changing the row width does not re-decode the fight:

```tsx
    const casts = useMemo(
        () => (fight && selectedPlayer ? decodeRotation(fight, selectedPlayer) : []),
        [fight, selectedPlayer],
    );
```

Pass them through at the `RotationTrack` call site:

```tsx
                            <RotationTrack
                                fight={fight}
                                wrapMs={wrapMs}
                                casts={casts}
                                selectedIndex={selectedCastIndex}
                                onSelectCast={(index) => setSelectedCastIndex(
                                    (prev) => (prev === index ? null : index))}
                            />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/RotationSection.test.tsx --maxWorkers=2`

Expected: PASS — fifteen tests. If the pre-log or interrupted assertion broke, an attribute was dropped when the `div` became a `button`.

- [ ] **Step 7: Validate**

Run: `npm run validate`

Expected: no type errors, no lint warnings. A `player is declared but never read` error in `RotationTrack` means Step 3's parameter removal was incomplete.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/sections/RotationTrack.tsx src/renderer/stats/sections/RotationSection.tsx src/renderer/stats/__tests__/RotationSection.test.tsx
git commit -m "feat(rotation): lift decodeRotation into the section, make casts selectable buttons

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The cast detail sheet

**Files:**
- Create: `src/renderer/stats/sections/RotationCastSheet.tsx`
- Modify: `src/renderer/stats/sections/RotationSection.tsx`
- Test: `src/renderer/stats/__tests__/RotationSection.test.tsx`

**Interfaces:**
- Consumes: `selectedCastIndex` and `casts` from Task 3.
- Produces: `RotationCastSheet`, props `{ casts: DecodedCast[]; index: number; fightDurationMs: number; onClose: () => void }`.

**Fixture arithmetic the tests depend on** — the shared `fight` has `dt: [-198, 1200, 3000]` and `dur: [700, 300, 500]`, so `decodeRotation` yields cast times `-198`, `1002`, `4002`. The gap before cast 1 is `1002 - (-198 + 700) = 500`. Cast 1 is the interrupted one.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe` block:

```tsx
    const openCast = (container: HTMLElement, index: number) => {
        const box = container.querySelectorAll('[data-cast]')[index] as HTMLElement;
        act(() => { box.click(); });
    };

    it('opens a sheet with the clicked cast timing and gap', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        openCast(container, 1);
        expect(screen.getByTestId('rotation-cast-sheet')).toBeTruthy();
        expect(screen.getByText('0:01.002')).toBeTruthy();
        expect(screen.getByText('300 ms')).toBeTruthy();
        expect(screen.getByText('500 ms')).toBeTruthy();
        expect(screen.getByText('Interrupted')).toBeTruthy();
    });

    it('shows an em dash for the gap before the very first cast', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        openCast(container, 0);
        const gap = screen.getByTestId('rotation-cast-gap');
        expect(gap.textContent).toBe('—');
    });

    it('reports a negative gap as-is when two casts overlap', () => {
        const overlapping: RotationFightData = {
            ...fight,
            players: [{
                ...fight.players[0],
                skill: [0, 0], dt: [0, 200], dur: [1000, 1000], interrupted: [],
            }],
        };
        const { container } = render(
            <RotationSection fights={[overlapping]} recorded selectedFightId="f1" />);
        openCast(container, 1);
        expect(screen.getByTestId('rotation-cast-gap').textContent).toBe('-800 ms');
    });

    it('closes the sheet when the same cast is clicked again, and on Escape', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        openCast(container, 1);
        openCast(container, 1);
        expect(screen.queryByTestId('rotation-cast-sheet')).toBeNull();
        openCast(container, 1);
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
        expect(screen.queryByTestId('rotation-cast-sheet')).toBeNull();
    });

    it('closes the sheet when the selected player changes', () => {
        const twoPlayers: RotationFightData = {
            ...fight,
            players: [
                fight.players[0],
                { ...fight.players[0], key: 'b.5678|Necromancer', displayName: 'Other', profession: 'Necromancer' },
            ],
        };
        const { container } = render(
            <RotationSection fights={[twoPlayers]} recorded selectedFightId="f1" />);
        openCast(container, 1);
        expect(screen.getByTestId('rotation-cast-sheet')).toBeTruthy();
        act(() => { (screen.getAllByText('Other')[0].closest('button') as HTMLElement).click(); });
        expect(screen.queryByTestId('rotation-cast-sheet')).toBeNull();
    });

    it('never emits an <img> in the sheet for a bare numeric icon index', () => {
        const numericIcon: RotationFightData = {
            ...fight,
            palette: [{ id: 1, name: 'Symbol of Blades', icon: 7 as unknown as string }],
            players: [{ ...fight.players[0], skill: [0], dt: [0], dur: [500], interrupted: [] }],
        };
        const { container } = render(
            <RotationSection fights={[numericIcon]} recorded selectedFightId="f1" />);
        openCast(container, 0);
        expect(screen.getByTestId('rotation-cast-sheet').querySelector('img')).toBeNull();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/stats/__tests__/RotationSection.test.tsx --maxWorkers=2`

Expected: FAIL — `Unable to find an element by: [data-testid="rotation-cast-sheet"]` on every one of them.

- [ ] **Step 3: Write the sheet**

Create `src/renderer/stats/sections/RotationCastSheet.tsx`:

```tsx
import React from 'react';
import { X } from 'lucide-react';
import type { DecodedCast } from '../computeRotationTimeline';

/** `m:ss.mmm`, with a leading `-` for a cast that began before the log did.
 *  Duplicated from `RotationTrack` deliberately: hoisting it into a shared
 *  module for two callers in the same folder buys nothing, and the two
 *  formats are free to diverge if the sheet ever wants more precision. */
const mmssMillis = (ms: number): string => {
    const sign = ms < 0 ? '-' : '';
    const abs = Math.abs(ms);
    const totalSeconds = Math.floor(abs / 1000);
    return `${sign}${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}.${String(Math.round(abs % 1000)).padStart(3, '0')}`;
};

export interface RotationCastSheetProps {
    casts: DecodedCast[];
    /** Index into `casts`. The caller guarantees it is in range. */
    index: number;
    fightDurationMs: number;
    onClose: () => void;
}

const Field: React.FC<{ label: string; children: React.ReactNode; testId?: string; color?: string }> = ({
    label, children, testId, color,
}) => (
    <div className="flex flex-col gap-0.5 min-w-[110px] py-1">
        <span className="text-[10px] uppercase tracking-[0.05em]" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <b className="text-[13px] font-semibold" data-testid={testId} style={{ color: color || 'var(--text-primary)' }}>
            {children}
        </b>
    </div>
);

/**
 * Detail for exactly one cast. Rendered under the track rather than over it so
 * the surrounding rows stay visible — a cast only means something next to the
 * casts around it.
 */
export const RotationCastSheet: React.FC<RotationCastSheetProps> = ({
    casts, index, fightDurationMs, onClose,
}) => {
    const cast = casts[index];
    if (!cast) return null;
    const prev = index > 0 ? casts[index - 1] : null;
    // May be negative: real logs contain casts that begin before the previous
    // one has finished. That is information, so it is shown rather than clamped.
    const gapMs = prev ? cast.castTime - (prev.castTime + prev.duration) : null;
    const sameSkill = casts
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c.skillId === cast.skillId);
    // Same guard as the track: a bare number is an unexpanded `iconIndex`
    // reference the report trimmed out from under us, never an image URL.
    const iconSrc = typeof cast.icon === 'string' && cast.icon.length > 0 ? cast.icon : null;
    const span = Math.max(1, fightDurationMs);

    return (
        <div
            data-testid="rotation-cast-sheet"
            className="mt-3 rounded-[var(--radius-md)] p-3"
            style={{
                background: 'var(--bg-card-inner)',
                border: '1px solid var(--border-default)',
                borderTop: '2px solid var(--brand-primary)',
            }}
        >
            <div className="flex items-center gap-2.5">
                {iconSrc && <img src={iconSrc} alt="" className="h-8 w-8 object-contain shrink-0" />}
                <div className="flex-1 min-w-0">
                    <h4 className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{cast.name}</h4>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {sameSkill.length} {sameSkill.length === 1 ? 'cast' : 'casts'} this fight
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close cast detail"
                    className="flex items-center justify-center w-[26px] h-[26px] shrink-0"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                >
                    <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
                </button>
            </div>
            <div className="flex flex-wrap gap-x-6 mt-2.5">
                <Field label="Cast at">{mmssMillis(cast.castTime)}</Field>
                <Field label="Duration">{cast.duration} ms</Field>
                <Field label="Outcome" color={cast.interrupted ? 'var(--status-error)' : undefined}>
                    {cast.interrupted ? 'Interrupted' : 'Completed'}
                </Field>
                <Field label="Gap since prev" testId="rotation-cast-gap">
                    {gapMs === null ? '—' : `${gapMs} ms`}
                </Field>
                <Field label="Previous cast">{prev ? prev.name : '—'}</Field>
            </div>
            <div className="text-[10px] uppercase tracking-[0.05em] mt-2.5" style={{ color: 'var(--text-muted)' }}>
                Every cast of this skill
            </div>
            <div className="relative h-5 mt-1 rounded-[var(--radius-md)]" style={{ background: 'var(--bg-input)' }}>
                {sameSkill.map(({ c, i }) => (
                    <span
                        key={i}
                        data-spark-tick=""
                        className="absolute top-1 bottom-1 rounded-sm"
                        style={{
                            left: `${(Math.max(0, c.castTime) / span) * 100}%`,
                            width: i === index ? '4px' : '3px',
                            background: i === index ? 'var(--text-primary)' : 'var(--brand-primary)',
                        }}
                    />
                ))}
            </div>
        </div>
    );
};
```

- [ ] **Step 4: Wire it into the section**

In `src/renderer/stats/sections/RotationSection.tsx`, add the import:

```tsx
import { RotationCastSheet } from './RotationCastSheet';
```

Add two effects below the `casts` memo. They must sit with the other hooks, above the `if (!Array.isArray(fights)) return null;` early return, so every hook runs on every render:

```tsx
    // A cast index means nothing once the list it indexes into has been
    // replaced — index 40 is a different skill for a different player.
    useEffect(() => { setSelectedCastIndex(null); }, [fight?.id, selectedPlayer?.key]);

    useEffect(() => {
        if (selectedCastIndex === null) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedCastIndex(null);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [selectedCastIndex]);
```

and extend the React import to include `useEffect`:

```tsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
```

Render the sheet immediately after the `<RotationTrack ... />` element, inside the same fragment:

```tsx
                            {selectedCastIndex !== null && (
                                <RotationCastSheet
                                    casts={casts}
                                    index={selectedCastIndex}
                                    fightDurationMs={fight.durationMs}
                                    onClose={() => setSelectedCastIndex(null)}
                                />
                            )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/RotationSection.test.tsx --maxWorkers=2`

Expected: PASS — twenty-one tests.

- [ ] **Step 6: Validate**

Run: `npm run validate`

Expected: no type errors, no lint warnings. React's exhaustive-deps rule may want `selectedPlayer` rather than `selectedPlayer?.key` in the reset effect — keep the `.key` form and, if the rule objects, silence that single line with an eslint-disable comment explaining that the key is the identity that matters and the object is recreated on every filter keystroke.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/sections/RotationCastSheet.tsx src/renderer/stats/sections/RotationSection.tsx src/renderer/stats/__tests__/RotationSection.test.tsx
git commit -m "feat(rotation): add a per-cast detail sheet

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Responsive rail, chip strip, and the full suite

**Files:**
- Modify: `src/renderer/stats/sections/RotationSection.tsx`
- Test: `src/renderer/stats/__tests__/RotationSection.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing later tasks read. This is the last task.

**Note on testing breakpoints:** jsdom does not evaluate Tailwind breakpoints — `sm:flex` is an inert class string there. The tests therefore assert on the class list, which is the honest thing they can check: that the rail is hidden by default and shown at `sm`, and that the chip strip is the inverse.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe` block:

```tsx
    it('hides the player rail below the sm breakpoint and shows a chip strip instead', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const rail = container.querySelector('[data-player-rail]') as HTMLElement;
        const strip = container.querySelector('[data-player-chips]') as HTMLElement;
        expect(rail.className).toContain('hidden');
        expect(rail.className).toContain('sm:flex');
        expect(strip.className).toContain('sm:hidden');
    });

    it('selects a player from the chip strip', () => {
        const twoPlayers: RotationFightData = {
            ...fight,
            players: [
                fight.players[0],
                { ...fight.players[0], key: 'b.5678|Necromancer', displayName: 'Other', profession: 'Necromancer' },
            ],
        };
        const { container } = render(
            <RotationSection fights={[twoPlayers]} recorded selectedFightId="f1" />);
        const strip = container.querySelector('[data-player-chips]') as HTMLElement;
        const chip = Array.from(strip.querySelectorAll('button'))
            .find(b => b.textContent?.includes('Other')) as HTMLElement;
        act(() => { chip.click(); });
        expect(chip.getAttribute('aria-pressed')).toBe('true');
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/stats/__tests__/RotationSection.test.tsx --maxWorkers=2`

Expected: FAIL — `rail` and `strip` are both `null`.

- [ ] **Step 3: Tag and hide the rail**

In `src/renderer/stats/sections/RotationSection.tsx`, change the rail's wrapper from `className="w-52 shrink-0 flex flex-col gap-1"` to:

```tsx
                <div data-player-rail="" className="hidden sm:flex w-52 shrink-0 flex-col gap-1">
```

- [ ] **Step 4: Add the chip strip**

Insert this immediately above the `<div className="flex gap-3">` that wraps the rail and the track:

```tsx
            {/* Below `sm` the 208px rail would leave the track ~350px — about six
                pixels per cast. The chips give the track the full width and stay
                reachable by thumb. Pure CSS, so it cannot desync from the width. */}
            <div data-player-chips="" className="sm:hidden flex gap-1.5 overflow-x-auto pb-1.5 mb-2">
                {sortedPlayers.map(p => (
                    <button
                        key={p.key}
                        type="button"
                        onClick={() => setSelectedPlayerKey(p.key)}
                        aria-pressed={selectedPlayer?.key === p.key}
                        className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 text-[11px] whitespace-nowrap rounded-full"
                        style={{
                            background: selectedPlayer?.key === p.key ? 'var(--bg-hover)' : 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            border: `1px solid ${selectedPlayer?.key === p.key ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                        }}
                    >
                        {renderProfessionIcon(p.profession, undefined, 'w-3.5 h-3.5 shrink-0')}
                        {p.displayName}
                        <span style={{ color: 'var(--text-muted)' }}>{p.skill.length}</span>
                    </button>
                ))}
            </div>
```

The strip uses `sortedPlayers`, not `filteredPlayers` — the filter input lives in the rail, which is hidden at this width, so filtering it would be filtering by a control the user cannot see.

- [ ] **Step 5: Shrink the row-start labels below `sm`**

There are no row-start time labels in `RotationTrack` today. Add them — the rows currently sit flush against the section's left edge, and once the track is the full width of a phone a reader has nothing to anchor a row to. In `src/renderer/stats/sections/RotationTrack.tsx`, wrap the row element in a flex line:

```tsx
                <div key={rowIndex} className="flex items-stretch gap-2">
                    <span
                        className="shrink-0 text-right w-[30px] sm:w-[38px] text-[10px] sm:text-[11px] pt-2.5 tabular-nums"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        {Math.floor((rowIndex * wrapMs) / 1000)}s
                    </span>
                    <div
                        ref={rowIndex === 0 ? rowRef : undefined}
                        data-track-row=""
                        className="relative h-9 flex-1 min-w-0 overflow-hidden"
                        style={{ background: 'var(--bg-card-inner)', borderRadius: 'var(--radius-md)' }}
                    >
```

Note the row div loses `w-full` and gains `flex-1 min-w-0`; the `key` moves to the new outer element. Close the extra `</div>`.

- [ ] **Step 6: Run the rotation tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/RotationSection.test.tsx --maxWorkers=2`

Expected: PASS — twenty-three tests. The measurement tests from Task 2 still pass because `data-track-row` moved with the element it was on.

- [ ] **Step 7: Run the whole suite**

Run: `npx vitest run --maxWorkers=2`

Expected: PASS — every test file. Two things in the output look alarming and are not: `Error: report.json is missing fights[]` is a deliberate throw from `src/web/__tests__/ReportErrorBoundary.test.tsx`, and `Not implemented: HTMLCanvasElement's getContext()` is a benign jsdom notice. Read the final `Test Files`/`Tests` summary lines, not the stack traces.

- [ ] **Step 8: Validate**

Run: `npm run validate`

Expected: no type errors, no lint warnings.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/stats/sections/RotationSection.tsx src/renderer/stats/sections/RotationTrack.tsx src/renderer/stats/__tests__/RotationSection.test.tsx
git commit -m "feat(rotation): collapse the player rail to a chip strip on small screens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Manual Verification

Unit tests cannot cover these — a person has to look.

- [ ] `npm run dev`, open Players → Rotation. Confirm the default row width is 15s and that 10s is in the list.
- [ ] At 10s rows, confirm cast boxes show icon **and** name; at 30s and 60s, confirm they degrade to a centred icon rather than a clipped name.
- [ ] Click a cast. Confirm the sheet opens under the track with a real icon, that `Gap since prev` is plausible, and that the spark strip's highlighted tick lines up with the cast you clicked.
- [ ] Press Escape, then click the same cast twice. Both must close the sheet.
- [ ] Switch player and switch fight with a sheet open. The sheet must close, not re-point at another player's cast.
- [ ] Narrow the window below the `sm` breakpoint (640px). The rail must disappear, the chip strip must appear and scroll horizontally, and the track must take the full width.
- [ ] Tab to a cast box with the keyboard and press Enter. The sheet must open.
- [ ] Publish a report to GitHub Pages and confirm all of the above in a browser, with icons. This is the only check that exercises the published `iconIndex` expansion path.
