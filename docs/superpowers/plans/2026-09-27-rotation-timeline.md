# Rotation Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every squad player's per-cast rotation timeline for a chosen fight, in the desktop app and in published `bridge.axi.link` reports alike.

**Architecture:** A published report carries precomputed stats, not log details, so rotation is compacted during aggregation into `stats.rotationTimelineDrilldown` following the existing `computeControlTimeline` five-function accumulator contract. The wire shape is columnar and delta-encoded (~12 bytes/cast vs ~70 verbatim); one module owns both the encoder and its inverse, and desktop and web both render through that decoder.

**Tech Stack:** TypeScript, React 18, vitest + jsdom, lucide-react icons, `@axiapps/bridge-metrics` (`canonicalSkillId`).

**Spec:** `docs/superpowers/specs/2026-09-27-rotation-timeline-design.md`

## Global Constraints

- Branch `feat/rotation-timeline` is already checked out. Do not switch branches.
- Vitest MUST run with limited parallelism: `npx vitest run <path> --maxWorkers=2`. Never run the full suite without it.
- `npm run validate` (typecheck + `eslint --max-warnings 0`) must pass before every commit. Zero warnings is enforced.
- Test fixtures are read with `readFileSync` + `JSON.parse`, NEVER a static `import` — a static import of a large fixture OOMs `tsc --noEmit` at 8 GB and breaks `validate`.
- A skill id is NEVER shown to the user as a raw id. Curated names only.
- `src/shared/metrics-spec.md` is the metrics source of truth; after editing it run `npm run sync:metrics-spec`.
- Encoded size budget: **≤ 14 bytes per cast for the per-cast columnar arrays**
  (`skill`, `dt`, `dur`, `interrupted`), asserted by a test. The per-fight palette and
  player metadata are fixed costs that do not scale with cast count and are NOT part of
  this per-cast budget; the whole fight object gets its own absolute cap instead
  (≤ 150 KB for the fixture below, measured ~123 KB). Controller ruling, 2026-09-27 —
  see the SDD ledger.
- `quickness` is dropped and must not be stored anywhere.
- Fixture used throughout: `test-fixtures/ei/20260130-193742.json` (23 MB, 53 players,
  7 of them `notInSquad`. Whole-file total is 5,781 casts; the **squad-only** total this
  feature encodes is **5,758 casts across 46 players** — non-squad players are out of
  scope per the spec. `durationMS` 198522.)

## Review Focus

Input classes the spec implies but that no naturally-written task would exercise. Each has a test pinned to the task that owns the code.

1. **A player whose casts are not already sorted by `castTime`** — EI groups casts by skill, so the raw array is NOT globally time-ordered. Delta encoding silently produces negative deltas and a scrambled timeline if the sort is missed. (Task 2)
2. **A cast beginning before the log starts** (`castTime: -198`, real in the fixture) — must survive the round trip as a negative number and clamp only at render. (Task 2, Task 6)
3. **Two worker frames carrying the same fight id** — merge must not duplicate the fight. (Task 3)
4. **An id absent from `skillMap`, and an id whose name is the `"Skill <id>"` placeholder** — both must yield a curated fallback, never a raw id in the DOM. (Task 2, Task 6)
5. **A `report.json` written before this feature** — `stats.rotationTimelineDrilldown` is `undefined`; the section must hide itself rather than throw or render an empty shell. (Task 6)

---

### Task 1: Module skeleton, types, and the empty accumulator

**Files:**
- Create: `src/renderer/stats/computeRotationTimeline.ts`
- Test: `src/renderer/stats/__tests__/computeRotationTimeline.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RotationSkill`, `RotationPlayerData`, `RotationFightData`, `RotationTimelineAccumulator`, `RotationTimelineFrame`, `createRotationTimelineAccumulator()`.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/__tests__/computeRotationTimeline.test.ts
import { describe, it, expect } from 'vitest';
import { createRotationTimelineAccumulator } from '../computeRotationTimeline';

describe('createRotationTimelineAccumulator', () => {
    it('starts empty and unrecorded', () => {
        const acc = createRotationTimelineAccumulator();
        expect(acc.fights).toEqual([]);
        expect(acc.recorded).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/computeRotationTimeline.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../computeRotationTimeline`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/stats/computeRotationTimeline.ts
/**
 * Per-fight precomputed per-cast rotation for the Rotation section.
 *
 * Like `computeControlTimeline`, this must run during aggregation so the web
 * report — which has no log details at render time — can still draw it.
 *
 * The wire shape is columnar and delta-encoded on purpose. Verbatim EI
 * rotation measures ~70 bytes/cast: one 3m18s / 53-player fight is 405 KB
 * minified, which is ~8 MB for a 20-fight session against a ~38 MB GitHub
 * blob ceiling and a `report.json` that is already ~31 MB. The encoding
 * below is ~12 bytes/cast. `decodeRotation` is its only inverse; nothing
 * outside this module reads the raw arrays.
 */

/**
 * One palette entry. `icon` is spelled exactly that, on an object, because
 * the published-report build indexes icon URLs by walking `stats` for keys
 * literally named `icon` (`githubHandlers.ts`) and `expandIconIndex`
 * reverses it the same way. A parallel `icons: string[]` would silently miss
 * both passes and ship ~84 raw CDN chars per palette entry per fight.
 */
export interface RotationSkill {
    id: number;
    name: string;
    /** A number in a published report, expanded back to a URL on read. */
    icon?: string | number;
}

export interface RotationPlayerData {
    /** `${account}|${profession}`, matching `computeSkillUsageData`. */
    key: string;
    displayName: string;
    profession: string;
    group: number;
    /** `activeTimes[0]`, for cast density. */
    activeMs: number;
    /** Palette indices, one per cast, in cast-time order. */
    skill: number[];
    /** Cast times: `dt[0]` absolute (may be negative), the rest deltas. */
    dt: number[];
    /** Cast durations, ms. */
    dur: number[];
    /** Sparse ascending indices into the arrays above. */
    interrupted: number[];
}

export interface RotationFightData {
    id: string;
    /**
     * Human fight label, built here rather than in the section because the
     * web report has lost the zone and average position it derives from.
     */
    label: string;
    durationMs: number;
    palette: RotationSkill[];
    players: RotationPlayerData[];
    /** Fight start, for chronological ordering. */
    timestampMs?: number;
}

export interface RotationTimelineAccumulator {
    fights: RotationFightData[];
    /**
     * False until one ingested log carried rotation data. Lets the UI tell
     * "this history predates axilog / was parsed with rotation off" apart
     * from "the upload trimmer dropped this", which look identical
     * otherwise.
     */
    recorded: boolean;
}

export type RotationTimelineFrame = RotationTimelineAccumulator;

export function createRotationTimelineAccumulator(): RotationTimelineAccumulator {
    return { fights: [], recorded: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/__tests__/computeRotationTimeline.test.ts --maxWorkers=2`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computeRotationTimeline.ts src/renderer/stats/__tests__/computeRotationTimeline.test.ts
git commit -m "feat(rotation): add rotation timeline types and accumulator"
```

---

### Task 2: Encode one log into a fight (`ingestLogRotationTimeline`) and decode it back

This is the task the whole feature rests on, so it carries the round-trip test, the size guard, the sort, and the naming guard together — they are one behavior, and a reviewer approving the encoder without its inverse would be approving nothing testable.

**Files:**
- Modify: `src/renderer/stats/computeRotationTimeline.ts`
- Test: `src/renderer/stats/__tests__/computeRotationTimeline.test.ts`

**Interfaces:**
- Consumes: Task 1's types.
- Produces:
  - `ingestLogRotationTimeline(log: any, acc: RotationTimelineAccumulator): void`
  - `decodeRotation(fight: RotationFightData, player: RotationPlayerData): DecodedCast[]`
  - `export interface DecodedCast { skillId: number; name: string; icon?: string | number; castTime: number; duration: number; interrupted: boolean }`

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/renderer/stats/__tests__/computeRotationTimeline.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    createRotationTimelineAccumulator, ingestLogRotationTimeline, decodeRotation,
} from '../computeRotationTimeline';

// readFileSync, never a static import: a static import of this 23 MB fixture
// OOMs `tsc --noEmit` at 8 GB and breaks `npm run validate`.
const FIXTURE = resolve(__dirname, '../../../../test-fixtures/ei/20260130-193742.json');
const loadFixture = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

const makeLog = (details: any) => ({ filePath: '/logs/fight-1.zevtc', details });

describe('ingestLogRotationTimeline + decodeRotation', () => {
    it('round-trips every cast in the fixture', () => {
        const details = loadFixture();
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);

        expect(acc.recorded).toBe(true);
        expect(acc.fights).toHaveLength(1);
        const fight = acc.fights[0];

        const squad = details.players.filter((p: any) => !p.notInSquad);
        const expectedPlayers = squad.filter((p: any) =>
            Array.isArray(p.rotation) && p.rotation.some((r: any) => r?.id && r.skills?.length));
        expect(fight.players.length).toBe(expectedPlayers.length);

        let totalCasts = 0;
        for (const player of fight.players) {
            const source = expectedPlayers.find((p: any) => `${p.account}|${p.profession}` === player.key);
            expect(source).toBeDefined();

            // Rebuild what the source says, flattened and time-ordered.
            const want: Array<{ castTime: number; duration: number; interrupted: boolean }> = [];
            for (const rot of source.rotation) {
                if (!rot?.id) continue;
                for (const s of rot.skills || []) {
                    want.push({
                        castTime: s.castTime,
                        duration: s.duration,
                        interrupted: s.timeGained === -s.duration && s.duration > 0,
                    });
                }
            }
            want.sort((a, b) => a.castTime - b.castTime);

            const got = decodeRotation(fight, player);
            expect(got).toHaveLength(want.length);
            for (let i = 0; i < want.length; i++) {
                expect(got[i].castTime).toBe(want[i].castTime);
                expect(got[i].duration).toBe(want[i].duration);
                expect(got[i].interrupted).toBe(want[i].interrupted);
            }
            totalCasts += got.length;
        }
        expect(totalCasts).toBe(5781);
    });

    it('stays within the size budget of 14 bytes per cast', () => {
        const details = loadFixture();
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);
        const fight = acc.fights[0];
        const casts = fight.players.reduce((n, p) => n + p.skill.length, 0);
        // The budget is PER CAST, so it is measured against the per-cast
        // columnar arrays only. The palette and the player metadata are
        // per-fight fixed costs that do not grow with cast count; folding them
        // into a per-cast average makes the number meaningless on a short
        // fight and unreachable on a wide one. Measured here: ~11.6 B/cast.
        const castBytes = fight.players.reduce((n, p) => n
            + JSON.stringify(p.skill).length
            + JSON.stringify(p.dt).length
            + JSON.stringify(p.dur).length
            + JSON.stringify(p.interrupted).length, 0);
        // Verbatim EI rotation is ~70 bytes/cast. Blowing this budget is how
        // the feature turns into a failed report upload months from now.
        expect(castBytes / casts).toBeLessThan(14);

        // What actually threatens the ~38 MB GitHub blob ceiling is the whole
        // fight object, and the palette's share of it does not shrink with a
        // per-cast average. Cap it absolutely. This fixture is the widest one
        // we have (46 squad players, 3m18s) and measures ~123 KB; in a
        // published report the icon-index pass replaces each palette icon URL
        // with an integer, so the shipped figure is smaller still.
        expect(JSON.stringify(fight).length).toBeLessThan(150_000);
    });

    it('preserves a cast that began before the log started', () => {
        const details = loadFixture();
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);
        const fight = acc.fights[0];
        const negatives = fight.players.flatMap((p) => decodeRotation(fight, p))
            .filter((c) => c.castTime < 0);
        expect(negatives.length).toBeGreaterThan(0);
    });

    it('sorts casts into time order even when the source groups them by skill', () => {
        const details = {
            durationMS: 10000, fightName: 'Test', skillMap: { s1: { name: 'Late' }, s2: { name: 'Early' } },
            players: [{
                account: 'a.1234', name: 'A', profession: 'Guardian', group: 1, activeTimes: [9000],
                rotation: [
                    { id: 1, skills: [{ castTime: 5000, duration: 100, timeGained: 0 }] },
                    { id: 2, skills: [{ castTime: 1000, duration: 100, timeGained: 0 }] },
                ],
            }],
        };
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);
        const fight = acc.fights[0];
        const casts = decodeRotation(fight, fight.players[0]);
        expect(casts.map((c) => c.castTime)).toEqual([1000, 5000]);
        expect(casts.map((c) => c.name)).toEqual(['Early', 'Late']);
        expect(fight.players[0].dt.every((d, i) => i === 0 || d >= 0)).toBe(true);
    });

    it('never exposes a raw id for an unmapped or placeholder skill name', () => {
        const details = {
            durationMS: 10000, fightName: 'Test',
            skillMap: { s77: { name: 'Skill 77' } }, // axilog's placeholder
            players: [{
                account: 'a.1234', name: 'A', profession: 'Guardian', group: 1, activeTimes: [9000],
                rotation: [
                    { id: 77, skills: [{ castTime: 100, duration: 50, timeGained: 0 }] },
                    { id: 99, skills: [{ castTime: 200, duration: 50, timeGained: 0 }] }, // absent from skillMap
                    { id: 23275, skills: [{ castTime: 300, duration: 50, timeGained: 0 }] }, // Dodge
                ],
            }],
        };
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);
        const names = acc.fights[0].palette.map((s) => s.name);
        expect(names).toContain('Dodge');
        expect(names).not.toContain('Skill 77');
        expect(names).not.toContain('Skill 99');
        expect(names.every((n) => /^Unknown Skill$/.test(n) || !/^Skill \d+$/.test(n))).toBe(true);
    });

    it('skips rotation entries with no id or no casts', () => {
        const details = {
            durationMS: 10000, fightName: 'Test', skillMap: { s1: { name: 'Real' } },
            players: [{
                account: 'a.1234', name: 'A', profession: 'Guardian', group: 1, activeTimes: [9000],
                rotation: [
                    { id: 0, skills: [{ castTime: 10, duration: 5, timeGained: 0 }] }, // falsy id
                    { id: 5, skills: [] },                                             // no casts
                    { id: 5 },                                                         // no skills array
                    { id: 1, skills: [{ castTime: 100, duration: 50, timeGained: 0 }] },
                ],
            }],
        };
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);
        const fight = acc.fights[0];
        // Only the one real cast survives, and the skipped entries claimed no
        // palette slots.
        expect(decodeRotation(fight, fight.players[0])).toHaveLength(1);
        expect(fight.palette).toHaveLength(1);
        expect(fight.palette[0].name).toBe('Real');
    });

    it('skips non-squad players and fights with no rotation at all', () => {
        const details = {
            durationMS: 10000, fightName: 'Test', skillMap: { s1: { name: 'Cast' } },
            players: [
                { account: 'pug.1', name: 'P', profession: 'Ranger', notInSquad: true, activeTimes: [9000],
                  rotation: [{ id: 1, skills: [{ castTime: 10, duration: 5, timeGained: 0 }] }] },
            ],
        };
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);
        expect(acc.fights).toEqual([]);
        expect(acc.recorded).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/stats/__tests__/computeRotationTimeline.test.ts --maxWorkers=2`
Expected: FAIL — `ingestLogRotationTimeline` / `decodeRotation` are not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/renderer/stats/computeRotationTimeline.ts`:

```ts
import { canonicalSkillId } from '@axiapps/bridge-metrics';
import { isPlaceholderSkillName } from './computeSkillUsageData';
import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';
import { resolveFightTimestamp } from './utils/timestampUtils';

/** Ids axilog cannot name from any source but that we can label ourselves. */
const SPECIAL_SKILL_NAMES: Record<number, string> = {
    23275: 'Dodge',
    [-28]: 'Death',
};

/** Shown when no curated name exists. A raw id is never user-facing. */
const UNKNOWN_SKILL_NAME = 'Unknown Skill';

export interface DecodedCast {
    skillId: number;
    name: string;
    icon?: string | number;
    /** Absolute ms from fight start. Negative means it began before the log did. */
    castTime: number;
    duration: number;
    interrupted: boolean;
}

export function ingestLogRotationTimeline(log: any, acc: RotationTimelineAccumulator): void {
    const details = log?.details;
    if (!details) return;
    const allPlayers = Array.isArray(details.players) ? details.players : [];
    const squadPlayers = allPlayers.filter((p: any) => !p?.notInSquad);
    if (squadPlayers.length === 0) return;
    const fightId = String(log?.filePath || log?.id || '');
    if (!fightId) return;
    const durationMs = Math.max(0, Number(details?.durationMS || 0));
    if (durationMs <= 0) return;

    const skillMap = details.skillMap || {};

    // Palette slots are allocated on first use, so indices are dense and the
    // common skills land on single-digit numbers.
    const palette: RotationSkill[] = [];
    const slotById = new Map<number, number>();
    const slotFor = (rawId: number): number => {
        const skillId = canonicalSkillId(details, rawId);
        const existing = slotById.get(skillId);
        if (existing !== undefined) return existing;
        const entry = skillMap[`s${skillId}`];
        const mapped = entry?.name;
        const name = isPlaceholderSkillName(mapped, skillId)
            ? (SPECIAL_SKILL_NAMES[skillId] || UNKNOWN_SKILL_NAME)
            : String(mapped);
        const skill: RotationSkill = { id: skillId, name };
        if (entry?.icon) skill.icon = entry.icon;
        const slot = palette.length;
        palette.push(skill);
        slotById.set(skillId, slot);
        return slot;
    };

    const players: RotationPlayerData[] = [];

    squadPlayers.forEach((p: any) => {
        const rotation = Array.isArray(p?.rotation) ? p.rotation : [];
        // Flatten EI's group-by-skill nesting into one time-ordered list.
        // The source is NOT globally sorted; delta encoding requires it.
        const flat: Array<{ slot: number; castTime: number; duration: number; interrupted: boolean }> = [];
        rotation.forEach((rot: any) => {
            if (!rot?.id) return;
            const skills = Array.isArray(rot.skills) ? rot.skills : [];
            if (skills.length === 0) return;
            const slot = slotFor(Number(rot.id));
            skills.forEach((s: any) => {
                const castTime = Number(s?.castTime || 0);
                const duration = Number(s?.duration || 0);
                flat.push({
                    slot, castTime, duration,
                    // EI marks an interrupted/cancelled cast by giving back
                    // exactly the time it would have taken.
                    interrupted: Number(s?.timeGained) === -duration && duration > 0,
                });
            });
        });
        if (flat.length === 0) return;
        flat.sort((a, b) => a.castTime - b.castTime);

        const skill: number[] = [];
        const dt: number[] = [];
        const dur: number[] = [];
        const interrupted: number[] = [];
        let prev = 0;
        flat.forEach((cast, i) => {
            skill.push(cast.slot);
            dt.push(i === 0 ? cast.castTime : cast.castTime - prev);
            prev = cast.castTime;
            dur.push(cast.duration);
            if (cast.interrupted) interrupted.push(i);
        });

        const account = String(p?.account || p?.name || 'Unknown');
        const profession = String(p?.profession || 'Unknown');
        players.push({
            key: `${account}|${profession}`,
            displayName: String(p?.name || account),
            profession,
            group: Number(p?.group || 0),
            activeMs: Number(Array.isArray(p?.activeTimes) ? p.activeTimes[0] : 0) || 0,
            skill, dt, dur, interrupted,
        });
    });

    // A fight nobody cast in carries no information; omitting it keeps the
    // picker honest instead of offering an empty husk.
    if (players.length === 0) return;

    acc.recorded = true;
    acc.fights.push({
        id: fightId,
        label: buildFightLabelV2({
            zone: details.fightName || log?.fightName || `Fight ${acc.fights.length + 1}`,
            durationMs,
            avgPosition: computeFightAvgPosition(details),
        }),
        durationMs,
        palette,
        players,
        timestampMs: resolveFightTimestamp(details, log),
    });
}

/**
 * Expands one player's delta arrays back into absolute casts, in time order.
 * The only inverse of the encoding above; nothing outside this module should
 * read `dt`/`skill`/`interrupted` directly.
 */
export function decodeRotation(
    fight: RotationFightData, player: RotationPlayerData,
): DecodedCast[] {
    if (!fight || !player) return [];
    const interrupted = new Set(player.interrupted || []);
    const out: DecodedCast[] = [];
    let t = 0;
    for (let i = 0; i < player.skill.length; i++) {
        t = i === 0 ? player.dt[i] : t + player.dt[i];
        const entry = fight.palette[player.skill[i]];
        out.push({
            skillId: entry?.id ?? 0,
            name: entry?.name || UNKNOWN_SKILL_NAME,
            icon: entry?.icon,
            castTime: t,
            duration: player.dur[i],
            interrupted: interrupted.has(i),
        });
    }
    return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/computeRotationTimeline.test.ts --maxWorkers=2`
Expected: PASS (8 tests). If the size guard fails, do NOT raise the threshold — reduce what is stored.

- [ ] **Step 5: Run validate**

Run: `npm run validate`
Expected: exit 0, no warnings.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/computeRotationTimeline.ts src/renderer/stats/__tests__/computeRotationTimeline.test.ts
git commit -m "feat(rotation): encode per-cast rotation and decode it back"
```

---

### Task 3: Frame extract, merge, and finalize

**Files:**
- Modify: `src/renderer/stats/computeRotationTimeline.ts`
- Test: `src/renderer/stats/__tests__/computeRotationTimeline.test.ts`

**Interfaces:**
- Consumes: Task 1 + 2.
- Produces:
  - `extractRotationTimelineFrame(acc): RotationTimelineFrame`
  - `mergeRotationTimelineFrame(target, frame): void`
  - `finalizeRotationTimeline(acc): { fights: RotationFightData[]; recorded: boolean }`

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/renderer/stats/__tests__/computeRotationTimeline.test.ts
import {
    extractRotationTimelineFrame, mergeRotationTimelineFrame, finalizeRotationTimeline,
} from '../computeRotationTimeline';

const fightStub = (id: string, timestampMs: number): any => ({
    id, label: id, durationMs: 1000, palette: [], players: [], timestampMs,
});

describe('rotation frames', () => {
    it('rejects a frame carrying more than one fight', () => {
        const acc = createRotationTimelineAccumulator();
        acc.fights.push(fightStub('a', 1), fightStub('b', 2));
        expect(() => extractRotationTimelineFrame(acc)).toThrow(/at most one fight/);
    });

    it('merges frames without duplicating a fight id', () => {
        const target = createRotationTimelineAccumulator();
        mergeRotationTimelineFrame(target, { fights: [fightStub('a', 1)], recorded: true });
        mergeRotationTimelineFrame(target, { fights: [fightStub('a', 1)], recorded: true });
        mergeRotationTimelineFrame(target, { fights: [fightStub('b', 2)], recorded: true });
        expect(target.fights.map((f) => f.id)).toEqual(['a', 'b']);
        expect(target.recorded).toBe(true);
    });

    it('ignores a null frame and keeps recorded false', () => {
        const target = createRotationTimelineAccumulator();
        mergeRotationTimelineFrame(target, null as any);
        expect(target.fights).toEqual([]);
        expect(target.recorded).toBe(false);
    });

    it('finalizes in chronological order', () => {
        const acc = createRotationTimelineAccumulator();
        acc.fights.push(fightStub('late', 300), fightStub('early', 100), fightStub('mid', 200));
        acc.recorded = true;
        const out = finalizeRotationTimeline(acc);
        expect(out.fights.map((f) => f.id)).toEqual(['early', 'mid', 'late']);
        expect(out.recorded).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/stats/__tests__/computeRotationTimeline.test.ts --maxWorkers=2`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/renderer/stats/computeRotationTimeline.ts`:

```ts
export function extractRotationTimelineFrame(
    acc: RotationTimelineAccumulator,
): RotationTimelineFrame {
    if (acc.fights.length > 1) {
        throw new Error(`extractRotationTimelineFrame expects at most one fight, got ${acc.fights.length}`);
    }
    return { fights: acc.fights, recorded: acc.recorded };
}

export function mergeRotationTimelineFrame(
    target: RotationTimelineAccumulator,
    frame: RotationTimelineFrame,
): void {
    if (!frame) return;
    // Worker frames can be replayed (a re-flush resends a log), so merge is
    // idempotent per fight id rather than a blind concat.
    const seen = new Set(target.fights.map((f) => f.id));
    for (const fight of frame.fights || []) {
        if (seen.has(fight.id)) continue;
        seen.add(fight.id);
        target.fights.push(fight);
    }
    if (frame.recorded) target.recorded = true;
}

export function finalizeRotationTimeline(
    acc: RotationTimelineAccumulator,
): { fights: RotationFightData[]; recorded: boolean } {
    // Worker frames merge in completion order, not fight order. Stable sort,
    // so fights without a timestamp keep their relative order.
    const fights = [...acc.fights].sort((a, b) => {
        const aTs = Number(a.timestampMs) || 0;
        const bTs = Number(b.timestampMs) || 0;
        if (aTs > 0 && bTs > 0) return aTs - bTs;
        return aTs > 0 ? -1 : bTs > 0 ? 1 : 0;
    });
    return { fights, recorded: acc.recorded };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/computeRotationTimeline.test.ts --maxWorkers=2`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computeRotationTimeline.ts src/renderer/stats/__tests__/computeRotationTimeline.test.ts
git commit -m "feat(rotation): add frame extract, merge, and finalize"
```

---

### Task 4: Wire into IncrementalAggregator

`pruneDetailsForWorker` in `src/renderer/stats/hooks/useStatsAggregationWorker.ts` is a deny-list (`DETAILS_TOP_LEVEL_DENY`, `PLAYER_DENY`) and does not list `rotation`, so rotation already reaches the worker. No change needed there — this was verified, not assumed.

**Files:**
- Modify: `src/renderer/stats/incrementalAggregation.ts` (import near line 46; field near 700; init near 753; ingest near 906; extract near 1036; merge near 1144; finalize near 1184; result object near 1839; relabel near 1990)
- Test: `src/renderer/stats/__tests__/computeRotationTimeline.test.ts`

**Interfaces:**
- Consumes: Task 3's five functions.
- Produces: `stats.rotationTimelineDrilldown` of type `{ fights: RotationFightData[]; recorded: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/renderer/stats/__tests__/computeRotationTimeline.test.ts
import { computeStatsSync } from '../incrementalAggregation';

describe('rotation in the aggregator', () => {
    it('publishes rotationTimelineDrilldown from a real log', () => {
        const details = loadFixture();
        const { stats } = computeStatsSync({ logs: [makeLog(details)] });
        const drilldown = (stats as any).rotationTimelineDrilldown;
        expect(drilldown?.recorded).toBe(true);
        expect(drilldown.fights).toHaveLength(1);
        expect(drilldown.fights[0].players.length).toBeGreaterThan(40);
    });
});
```

`computeStatsSync` takes a single options object — `computeStatsSync({ logs })`, as declared at `src/renderer/stats/incrementalAggregation.ts:2246` and called throughout `src/renderer/stats/__tests__/incrementalAggregation.test.ts`. It returns `{ stats, skillUsageData }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/computeRotationTimeline.test.ts --maxWorkers=2`
Expected: FAIL — `rotationTimelineDrilldown` is undefined.

- [ ] **Step 3: Write the implementation**

Nine edits in `src/renderer/stats/incrementalAggregation.ts`, each mirroring the `controlTimeline` line beside it:

1. Import, beside the `computeControlTimeline` import (~line 46):

```ts
import { createRotationTimelineAccumulator, ingestLogRotationTimeline, extractRotationTimelineFrame, mergeRotationTimelineFrame, finalizeRotationTimeline } from './computeRotationTimeline';
```

2. Field, beside `private controlTimelineAcc;` (~700):

```ts
    private rotationTimelineAcc;
```

3. Init, beside `this.controlTimelineAcc = createControlTimelineAccumulator();` (~753):

```ts
        this.rotationTimelineAcc = createRotationTimelineAccumulator();
```

4. Ingest, directly after `ingestLogControlTimeline(log, this.controlTimelineAcc);` (~906):

```ts
        ingestLogRotationTimeline(log, this.rotationTimelineAcc);
```

5. Frame extract, after the `controlTimeline:` entry (~1036):

```ts
                rotationTimeline: extractRotationTimelineFrame(this.rotationTimelineAcc),
```

6. Frame merge, after the `frame.controlTimeline` line (~1144):

```ts
        if (frame.rotationTimeline) mergeRotationTimelineFrame(this.rotationTimelineAcc, frame.rotationTimeline);
```

7. Finalize, after `const controlTimelineDrilldown = ...` (~1184):

```ts
        const rotationTimelineDrilldown = finalizeRotationTimeline(this.rotationTimelineAcc);
```

8. Result object, in the same property list as `controlTimelineDrilldown` (~1839) — add `rotationTimelineDrilldown` to that list.

9. Relabel pass, directly after the `frame.controlTimeline?.fights` forEach (~1990):

```ts
        (frame.rotationTimeline?.fights || []).forEach((fight: any) => {
            applyLabel(fight, 'label', labels.fullLabel);
        });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/computeRotationTimeline.test.ts --maxWorkers=2`
Expected: PASS (13 tests)

- [ ] **Step 5: Run the neighbouring aggregation suites for regressions**

Run: `npx vitest run src/renderer/stats/__tests__/incrementalAggregation.test.ts src/renderer/stats/__tests__/computeControlTimeline.test.ts --maxWorkers=2`
Expected: PASS, unchanged counts.

- [ ] **Step 6: Run validate**

Run: `npm run validate`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/incrementalAggregation.ts src/renderer/stats/__tests__/computeRotationTimeline.test.ts
git commit -m "feat(rotation): wire rotation timeline into the aggregator"
```

---

### Task 5: Publish-path trim entry and the rotation type fix

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts` (trim list, after the `controlTimelineDrilldown` entry at ~line 1070)
- Modify: `src/main/dpsReportTypes.ts:66`
- Test: none. `trimSteps` has no existing unit test in either `src/main/__tests__/` or `src/main/handlers/__tests__/` (both directories exist and hold sibling tests such as `compactPublishedReports.test.ts` and `blobUploadRetry.test.ts`, but none covers the trim list). Building a harness for one array entry is not worth it; the entry is verified by the manual publish check at the end of this plan. The type fix in this task is covered by `npm run validate`.

**Interfaces:**
- Consumes: `stats.rotationTimelineDrilldown` from Task 4.
- Produces: nothing new.

- [ ] **Step 1: Fix the lying type**

`src/main/dpsReportTypes.ts:66` currently declares:

```ts
    rotation?: Array<{ id: number; skills?: number[] }>;
```

`skills` is not `number[]`. Replace with the real runtime shape:

```ts
    rotation?: Array<{
        id: number;
        skills?: Array<{
            /** ms from fight start. Negative when the cast began before the log did. */
            castTime: number;
            duration: number;
            /** `-duration` exactly when the cast was interrupted or cancelled. */
            timeGained: number;
            /** Not stored in reports — see computeRotationTimeline.ts. */
            quickness?: number;
        }>;
    }>;
```

- [ ] **Step 2: Add the trim entry**

In `src/main/handlers/githubHandlers.ts`, in `trimSteps`, directly after the `controlTimelineDrilldown` entry:

```ts
        // Deliberately here and not near the front: replayFights leads because
        // it is ~66% of report.json, while rotation is ~200 KB gzipped for a
        // session — dropping it early would cost the feature to save almost
        // nothing.
        { label: 'rotationTimelineDrilldown', apply: () => clearArray((stats as any).rotationTimelineDrilldown, 'fights') },
```

- [ ] **Step 3: Run validate**

Run: `npm run validate`
Expected: exit 0. If the `dpsReportTypes` change surfaces type errors in existing readers of `rotation`, fix those readers — the old type was wrong, so any code it satisfied was reading a field that does not exist.

- [ ] **Step 4: Run the stats regression suite**

Run: `npm run test:regression:stats`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/dpsReportTypes.ts src/main/handlers/githubHandlers.ts
git commit -m "feat(rotation): trim rotation last and correct the rotation type"
```

---

### Task 6: The Rotation section

**Files:**
- Create: `src/renderer/stats/sections/RotationSection.tsx`
- Create: `src/renderer/stats/sections/RotationTrack.tsx`
- Modify: `src/renderer/stats/statsTaxonomy.ts` (in the `players` category, after the `skill-usage` entry)
- Modify: `src/renderer/StatsView.tsx` (read the drilldown near the `controlTimelineDrilldown` reads at ~3362; mount in the paged list near the `SkillUsageSection` at ~4946; mount in the section registry near ~5531)
- Test: `src/renderer/stats/__tests__/RotationSection.test.tsx`

**Interfaces:**
- Consumes: `RotationFightData`, `RotationPlayerData`, `decodeRotation` from Task 2; `FightPicker`, `TIMELINE_NOT_RECORDED_MESSAGE` from `./BucketGridTable`; `renderProfessionIcon` from `../ui/StatsViewShared`; `useStatsSharedContext` from `../StatsViewContext`.
- Produces: `RotationSection` (props `{ fights: RotationFightData[]; recorded: boolean; selectedFightId: string | null }`), matching `CcTimelineSection`'s prop shape exactly.

Read `src/renderer/stats/sections/CcTimelineSection.tsx` in full before writing this — it is the template for the expand/collapse wiring, `SECTION_ID`, and the fight picker.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/renderer/stats/__tests__/RotationSection.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RotationSection } from '../sections/RotationSection';
import type { RotationFightData } from '../computeRotationTimeline';

const fight: RotationFightData = {
    id: 'f1', label: 'Eternal: Bay (0:10)', durationMs: 10000,
    palette: [{ id: 1, name: 'Symbol of Blades' }, { id: 99, name: 'Unknown Skill' }],
    players: [{
        key: 'a.1234|Guardian', displayName: 'Tester', profession: 'Guardian', group: 1,
        activeMs: 9000,
        skill: [0, 1, 0], dt: [-198, 1200, 3000], dur: [700, 300, 500], interrupted: [1],
    }],
};

describe('RotationSection', () => {
    it('renders nothing when the drilldown is absent from an older report', () => {
        const { container } = render(
            <RotationSection fights={undefined as any} recorded={undefined as any} selectedFightId={null} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('tells the user to re-parse when no log carried rotation', () => {
        render(<RotationSection fights={[]} recorded={false} selectedFightId={null} />);
        expect(screen.getByText(/re-parse/i)).toBeTruthy();
    });

    it('says the data was dropped when it was recorded but trimmed away', () => {
        render(<RotationSection fights={[]} recorded selectedFightId={null} />);
        expect(screen.getByText(/upload size limit/i)).toBeTruthy();
    });

    it('draws one element per cast, marking the interrupted one', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const casts = container.querySelectorAll('[data-cast]');
        expect(casts).toHaveLength(3);
        expect(container.querySelectorAll('[data-interrupted="true"]')).toHaveLength(1);
    });

    it('marks a cast that began before the log started and clamps it to the left edge', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        const pre = container.querySelector('[data-prelog="true"]') as HTMLElement;
        expect(pre).toBeTruthy();
        expect(pre.style.left).toBe('0%');
    });

    it('never renders a raw skill id', () => {
        const { container } = render(
            <RotationSection fights={[fight]} recorded selectedFightId="f1" />);
        expect(container.innerHTML).not.toMatch(/Skill \d+/);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/stats/__tests__/RotationSection.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `../sections/RotationSection`.

- [ ] **Step 3: Implement `RotationTrack.tsx`**

One wrapped row band per `wrapMs` slice of the fight. Each cast is an absolutely positioned box: `left` = fraction of the row it starts at, `width` = fraction its duration covers, minimum `1.05%` so a zero-duration cast stays hoverable. A cast straddling a row boundary is clipped into both rows (draw the intersection per row), never duplicated whole and never dropped.

Required DOM contract, relied on by the tests:
- every cast box carries `data-cast=""`
- an interrupted cast carries `data-interrupted="true"`
- a cast with `castTime < 0` carries `data-prelog="true"` and `style.left === '0%'`
- the box's `title` is `` `${name} · ${mmssMillis(castTime)} · ${duration}ms` ``

Props:

```tsx
export interface RotationTrackProps {
    fight: RotationFightData;
    player: RotationPlayerData;
    /** Row width in ms: 15000 | 30000 | 60000. */
    wrapMs: number;
}
```

Style with Tailwind classes plus this codebase's CSS variables, as every sibling section does. The ones in use across `src/renderer/stats/sections/` — verified by frequency — are `--text-primary`, `--text-secondary`, `--text-muted`, `--radius-md`, `--border-default`, `--border-subtle`, `--border-hover`, `--bg-hover`, `--bg-elevated`, `--bg-card-inner`, `--bg-input`, `--brand-primary`, `--accent-bg`, `--accent-bg-strong`, `--accent-border`, `--shadow-card`, `--status-error`, `--status-success`, `--status-warning`.

Use `--bg-card-inner` for the track, `--border-default` for a cast box, `--text-primary` for its label, `--status-error` for the interrupted outline and `--brand-primary` for the pre-log outline. Introduce NO colour literals — `npm run lint` is `--max-warnings 0` and the codebase resolves colour through these variables.

- [ ] **Step 4: Implement `RotationSection.tsx`**

```tsx
/** Matches the taxonomy id in `statsTaxonomy.ts`, which the expand state keys on. */
const SECTION_ID = 'rotation';
```

Behaviour, in this order:

1. `if (!Array.isArray(fights)) return null;` — an older `report.json` has no `rotationTimelineDrilldown` at all, and a half-rendered shell is worse than nothing.
2. `fights.length === 0 && !recorded` → the re-parse message. Reuse `TIMELINE_NOT_RECORDED_MESSAGE` if its wording already says "re-parse"; otherwise write a message that contains the words "re-parse".
3. `fights.length === 0 && recorded` → a message containing "upload size limit".
4. Otherwise: header with `FightPicker` and a wrap-interval `<select>` (15s/30s/60s, default 30s); a left player list sorted by `group` then `displayName`, each row showing `renderProfessionIcon(player.profession)`, the display name, and `player.skill.length`; a filter `<input>` over display name; and the selected player's `RotationTrack`.
5. Header chips above the track, all derived — casts (`player.skill.length`), active time (`player.activeMs`), casts/min (`skill.length / (activeMs / 60000)`, shown as `—` when `activeMs === 0`), interrupted (`player.interrupted.length`), distinct skills (`new Set(player.skill).size`).
6. Default selected player: the first in the sorted list. Default selected fight: mirror `CcTimelineSection` — `fights.find(f => f.id === resolvedFightId) || fights[fights.length - 1] || null`.

- [ ] **Step 5: Register in the taxonomy**

In `src/renderer/stats/statsTaxonomy.ts`, in the `players` category, immediately after the `skill-usage` entry:

```ts
            { id: 'rotation', label: 'Rotation', icon: ListOrdered, description: 'Per-cast timeline for one player.', keywords: ['rotation', 'casts', 'timeline', 'skill order', 'what did they press'] },
```

Add `ListOrdered` to the existing `lucide-react` import at the top of that file.

- [ ] **Step 6: Mount in StatsView**

Three edits in `src/renderer/StatsView.tsx`:

1. Import `RotationSection` beside the `SkillUsageSection` import (~line 38).
2. Read the drilldown beside the `controlTimelineDrilldown` reads (~3362):

The section's "older report" branch keys on `fights` not being an array, so do NOT coerce to `EMPTY_ANY_ARRAY` the way `controlTimelineFights` does — that would turn an absent drilldown into a visible empty section. Read it as:

```tsx
    const rotationTimelineDrilldown = (safeStats as any)?.rotationTimelineDrilldown;
    const rotationFights: any = rotationTimelineDrilldown?.fights;
    const rotationRecorded: boolean = Boolean(rotationTimelineDrilldown?.recorded);
```

and pass `rotationFights` straight through at both mount sites.

3. Mount in BOTH places the `SkillUsageSection` appears — the paged render at ~4946 and the section registry entry at ~5531 (`{ id: 'rotation', element: <RotationSection … /> }`). Missing the second one means the search palette can find the section but cannot jump to it.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/RotationSection.test.tsx src/renderer/stats/__tests__/statsTaxonomy.test.ts --maxWorkers=2`
Expected: PASS. `statsTaxonomy.test.ts` may assert a section count — update the expected number if so.

- [ ] **Step 8: Run validate**

Run: `npm run validate`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/stats/sections/RotationSection.tsx src/renderer/stats/sections/RotationTrack.tsx src/renderer/stats/statsTaxonomy.ts src/renderer/StatsView.tsx src/renderer/stats/__tests__/RotationSection.test.tsx
git commit -m "feat(rotation): add the Rotation section"
```

---

### Task 7: Document the metric and run the full suite

**Files:**
- Modify: `src/shared/metrics-spec.md`
- Modify: `docs/metrics-spec.md` (generated — do not hand-edit; produced by `npm run sync:metrics-spec`)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code-facing.

- [ ] **Step 1: Document casts/min**

In `src/shared/metrics-spec.md`, beside the existing skill-usage/APM entries, add:

```markdown
### Rotation: casts/min

Per-player cast rate within one fight, shown in the Rotation section.

`casts / (activeMs / 60000)`, where `casts` is the number of entries in that
player's rotation for the fight and `activeMs` is `activeTimes[0]`.

Active time, not fight duration: a player who joined halfway would otherwise
read as half as busy as they were. Shown as `—` when `activeMs` is 0.

Not comparable to the APM Breakdown section, which measures across the whole
session and splits autos and procs out. This one counts every cast in one
fight.
```

- [ ] **Step 2: Sync the generated copy**

Run: `npm run sync:metrics-spec`
Expected: `docs/metrics-spec.md` updates. Do not edit that file by hand.

- [ ] **Step 3: Run the full unit suite**

Run: `npx vitest run --maxWorkers=2`
Expected: PASS. Investigate any failure — do not proceed with a red suite.

- [ ] **Step 4: Run validate**

Run: `npm run validate`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/metrics-spec.md docs/metrics-spec.md
git commit -m "docs(rotation): document the casts/min metric"
```

---

## Manual verification

After Task 7, before opening a PR:

1. `npm run dev`, load a session with several fights, open **Players → Rotation**.
2. Confirm: the fight picker lists fights; switching players redraws; a long fight wraps; hovering a cast shows name, time, and duration; no box reads `Skill 12345`.
3. Change the wrap interval and confirm the rows re-slice.
4. Publish a report to GitHub Pages and open it in a browser. Confirm the Rotation section renders there with icons — this is the whole point of the precompute, and it is the one thing no unit test covers.
