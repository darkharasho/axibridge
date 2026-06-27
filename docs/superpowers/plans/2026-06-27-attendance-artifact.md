# AxiBridge Attendance Artifact Implementation Plan (Retention Radar — producer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a new first-class `reports/attendance.json` artifact (per-raid date + attendee accounts + combat/squad time) alongside the existing rollup, so AxiRoster can build a retention radar with real per-raid time-series.

**Architecture:** Add a pure `attendance.ts` module to the `@axiapps/bridge-metrics` package mirroring the existing `rollup.ts` builder/parser pattern, then wire it into the GitHub publish flow next to the rollup write so it rides the same git tree/commit/push. The data already exists at publish time (`meta.id`, `meta.dateStart`, `stats.attendanceData[].account/combatTimeMs/squadTimeMs`).

**Tech Stack:** TypeScript, tsup (package build), vitest (`--maxWorkers=2`), Electron main (publish handler). Shared design: `../axiroster/docs/superpowers/specs/2026-06-27-retention-radar-design.md`.

## Global Constraints

- The artifact schema is **versioned** (`version: 1`) and matches the contract verbatim:
  `{ version, generatedAt, raids: [{ id, date, attendees: [{ account, combatTimeMs, squadTimeMs }] }] }`. `date` = `meta.dateStart`. Raids most-recent-first.
- Additive only — do NOT change `rollup.json` or `index.json`. Follow the existing `rollup.ts` builder/extractor/parser pattern and naming (`buildX`/`updateX`/`parseX`).
- The publish integration must be **non-blocking**: any failure logs a warning and does not abort the publish (mirror the rollup try/catch at `src/main/handlers/githubHandlers.ts:1868-1907`).
- Pure module must have **no Electron/Node-fs imports** so its vitest tests run. `generatedAt` is passed IN by the caller (do not call `Date.now()` inside the pure module).
- Package: every module is one tsup `entry` and one `exports` subpath (see `packages/bridge-metrics/tsup.config.ts` + `package.json`). The Electron main side imports via a one-line shim in `src/web/<module>.ts` (e.g. `src/web/rollup.ts` is `export * from '@axiapps/bridge-metrics/rollup'`), and `githubHandlers.ts` imports from `'../../web/<module>'`.
- Package tests run from `packages/bridge-metrics` with `npm test` (vitest `--maxWorkers=2`). Root `npm run validate` = typecheck + lint (eslint `--max-warnings 0`).

---

### Task 1: `attendance.ts` pure module + tests

**Files:**
- Create: `packages/bridge-metrics/src/attendance.ts`
- Test: `packages/bridge-metrics/src/__tests__/attendance.test.ts`

**Interfaces:**
- Consumes: `RollupReportPayload` type from `./rollup` (already exported).
- Produces:
  - `interface AttendanceAttendee { account: string; combatTimeMs: number; squadTimeMs: number }`
  - `interface AttendanceRaid { id: string; date: string; attendees: AttendanceAttendee[] }`
  - `interface AttendanceFile { version: number; generatedAt: string; raids: AttendanceRaid[] }`
  - `const ATTENDANCE_VERSION = 1`
  - `buildAttendanceRaid(payload: RollupReportPayload): AttendanceRaid | null` — null when no id or no attendees; de-dupes attendees by account.
  - `updateAttendanceForPublish({ existingRaids, currentReport, validIds, generatedAt }): AttendanceFile` — merge current raid by id, prune to `validIds`, sort by `date` desc.
  - `parseAttendanceFile(data: unknown): AttendanceFile | null` — version/shape guard.

- [ ] **Step 1: Write the failing test**

```ts
// packages/bridge-metrics/src/__tests__/attendance.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildAttendanceRaid, updateAttendanceForPublish, parseAttendanceFile, ATTENDANCE_VERSION
} from '../attendance';

const report = (id: string, accounts: string[]) => ({
  meta: { id, dateStart: `2026-02-0${id}T01:00:00Z`, dateEnd: `2026-02-0${id}T04:00:00Z` },
  stats: {
    attendanceData: accounts.map((a, i) => ({
      account: a, characterNames: [a], combatTimeMs: 1000 * (i + 1), squadTimeMs: 5000 * (i + 1)
    }))
  }
});

describe('buildAttendanceRaid', () => {
  it('projects id + dateStart + de-duped attendees with engagement times', () => {
    const raid = buildAttendanceRaid(report('1', ['A.1', 'B.2', 'A.1']));
    expect(raid).toEqual({
      id: '1', date: '2026-02-01T01:00:00Z',
      attendees: [
        { account: 'A.1', combatTimeMs: 1000, squadTimeMs: 5000 },
        { account: 'B.2', combatTimeMs: 2000, squadTimeMs: 10000 }
      ]
    });
  });
  it('returns null when there is no id or no attendees', () => {
    expect(buildAttendanceRaid({ meta: {}, stats: { attendanceData: [] } })).toBeNull();
    expect(buildAttendanceRaid({ meta: { id: 'x' }, stats: {} })).toBeNull();
  });
});

describe('updateAttendanceForPublish', () => {
  it('merges current by id, prunes to validIds, sorts date desc', () => {
    const existing = [
      buildAttendanceRaid(report('1', ['A.1']))!,
      buildAttendanceRaid(report('2', ['B.2']))!
    ];
    const file = updateAttendanceForPublish({
      existingRaids: existing,
      currentReport: report('3', ['C.3']),
      validIds: ['2', '3'], // '1' deleted
      generatedAt: '2026-02-09T00:00:00Z'
    });
    expect(file.version).toBe(ATTENDANCE_VERSION);
    expect(file.generatedAt).toBe('2026-02-09T00:00:00Z');
    expect(file.raids.map((r) => r.id)).toEqual(['3', '2']); // desc by date, '1' pruned
  });
  it('replaces an existing raid with the same id', () => {
    const existing = [buildAttendanceRaid(report('1', ['A.1']))!];
    const file = updateAttendanceForPublish({
      existingRaids: existing,
      currentReport: report('1', ['A.1', 'B.2']),
      validIds: ['1'],
      generatedAt: 'now'
    });
    expect(file.raids).toHaveLength(1);
    expect(file.raids[0].attendees).toHaveLength(2);
  });
});

describe('parseAttendanceFile', () => {
  it('accepts a valid file and rejects bad shape/version', () => {
    const good = { version: 1, generatedAt: 'x', raids: [] };
    expect(parseAttendanceFile(good)).toBe(good);
    expect(parseAttendanceFile({ version: 2, generatedAt: 'x', raids: [] })).toBeNull();
    expect(parseAttendanceFile({ version: 1, raids: 'nope' })).toBeNull();
    expect(parseAttendanceFile(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/bridge-metrics && npx vitest run src/__tests__/attendance.test.ts`
Expected: FAIL — cannot find module `../attendance`.

- [ ] **Step 3: Write the module**

```ts
// packages/bridge-metrics/src/attendance.ts
//
// First-class per-raid attendance artifact (reports/attendance.json), published
// alongside the rollup. Mirrors rollup.ts's builder/parser pattern. Pure — no
// Electron/fs — so it stays unit-testable; the caller supplies generatedAt.
import type { RollupReportPayload } from './rollup';

export interface AttendanceAttendee {
    account: string;
    combatTimeMs: number;
    squadTimeMs: number;
}
export interface AttendanceRaid {
    id: string;
    /** Raid start (meta.dateStart). */
    date: string;
    attendees: AttendanceAttendee[];
}
export interface AttendanceFile {
    version: number;
    generatedAt: string;
    raids: AttendanceRaid[];
}

export const ATTENDANCE_VERSION = 1;

/** Project one report payload to a single raid's attendance, or null when it
 *  has no id or no attendees. */
export const buildAttendanceRaid = (payload: RollupReportPayload): AttendanceRaid | null => {
    const id = String(payload?.meta?.id || '').trim();
    if (!id) return null;
    const date = String(payload?.meta?.dateStart || '').trim();
    const rows = Array.isArray(payload?.stats?.attendanceData) ? payload.stats!.attendanceData! : [];
    const attendees: AttendanceAttendee[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
        const account = String(r?.account || '').trim();
        if (!account || seen.has(account)) continue;
        seen.add(account);
        attendees.push({
            account,
            combatTimeMs: Number(r?.combatTimeMs || 0),
            squadTimeMs: Number(r?.squadTimeMs || 0)
        });
    }
    if (attendees.length === 0) return null;
    return { id, date, attendees };
};

/** Merge the just-published raid into the existing history, prune to valid
 *  (non-deleted) ids, and sort most-recent-first. */
export const updateAttendanceForPublish = (options: {
    existingRaids: AttendanceRaid[];
    currentReport: RollupReportPayload;
    validIds: string[];
    generatedAt: string;
}): AttendanceFile => {
    const { existingRaids, currentReport, validIds, generatedAt } = options;
    const byId = new Map<string, AttendanceRaid>();
    for (const raid of existingRaids) {
        const id = String(raid?.id || '').trim();
        if (id) byId.set(id, raid);
    }
    const current = buildAttendanceRaid(currentReport);
    if (current) byId.set(current.id, current);
    const validIdSet = new Set(validIds.map((id) => String(id || '').trim()).filter(Boolean));
    const raids = Array.from(byId.entries())
        .filter(([id]) => validIdSet.has(id))
        .map(([, raid]) => raid)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return { version: ATTENDANCE_VERSION, generatedAt, raids };
};

/** Parse a fetched/stored attendance.json defensively. */
export const parseAttendanceFile = (data: unknown): AttendanceFile | null => {
    const c = data as AttendanceFile | null;
    if (!c || typeof c !== 'object') return null;
    if (c.version !== ATTENDANCE_VERSION) return null;
    if (!Array.isArray(c.raids)) return null;
    return c;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/bridge-metrics && npx vitest run src/__tests__/attendance.test.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add packages/bridge-metrics/src/attendance.ts packages/bridge-metrics/src/__tests__/attendance.test.ts
git commit -m "feat(bridge-metrics): attendance artifact builder/parser"
```

---

### Task 2: Make the module consumable + wire into the publish flow

**Files:**
- Modify: `packages/bridge-metrics/package.json` (add `./attendance` export)
- Modify: `packages/bridge-metrics/tsup.config.ts` (add `attendance` entry)
- Create: `src/web/attendance.ts` (shim, mirrors `src/web/rollup.ts`)
- Modify: `src/main/handlers/githubHandlers.ts` (import + publish block + delete-prune parity)

**Interfaces:**
- Consumes: `updateAttendanceForPublish`, `parseAttendanceFile`, `AttendanceRaid` (Task 1).

- [ ] **Step 1: Add the package export + tsup entry, rebuild**

In `packages/bridge-metrics/package.json` `exports`, add after the `./rollup` entry:
```json
        "./attendance": { "types": "./dist/attendance.d.ts", "import": "./dist/attendance.js", "require": "./dist/attendance.cjs" },
```
In `packages/bridge-metrics/tsup.config.ts` `entry`, add after `rollup: 'src/rollup.ts',`:
```ts
        attendance: 'src/attendance.ts',
```
Build the package so the subpath resolves:
Run: `cd packages/bridge-metrics && npm run build`
Expected: tsup emits `dist/attendance.{js,cjs,d.ts}`; no errors.

- [ ] **Step 2: Create the web shim**

```ts
// src/web/attendance.ts
export * from '@axiapps/bridge-metrics/attendance';
```

- [ ] **Step 3: Import the attendance fns in githubHandlers**

In `src/main/handlers/githubHandlers.ts`, the rollup helpers are imported from `'../../web/rollup'` (top-of-file import block, lines 8-13). Add a sibling import directly below it:
```ts
import { parseAttendanceFile, updateAttendanceForPublish, type AttendanceRaid } from '../../web/attendance';
```

- [ ] **Step 4: Add the attendance publish block (mirror rollup)**

In the main publish handler, immediately AFTER the rollup `try { … } catch` block that ends at `src/main/handlers/githubHandlers.ts:1907` (the one that ends `log.warn('[Main] Failed to build precomputed rollup (non-blocking):', err);`), insert:

```ts
            // Maintain the first-class attendance history (reports/attendance.json)
            // so the roster's retention radar gets real per-raid time-series.
            // Non-blocking: a failure here must not abort the publish.
            try {
                const attendanceRepoPath = withPagesPath(pagesPath, 'reports/attendance.json');
                let existingRaids: AttendanceRaid[] = [];
                const existingAttendanceSha = treeMap.get(attendanceRepoPath);
                if (existingAttendanceSha) {
                    try {
                        const blob = await getGithubBlob(owner, repo, existingAttendanceSha, token);
                        if (blob?.content) {
                            const parsed = parseAttendanceFile(
                                JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'))
                            );
                            if (parsed) existingRaids = parsed.raids;
                        }
                    } catch (err) {
                        log.warn('[Main] Could not read existing attendance.json, rebuilding:', err);
                    }
                }
                const attendanceFile = updateAttendanceForPublish({
                    existingRaids,
                    currentReport: builtReport.payload as RollupReportPayload,
                    validIds: mergedEntries.map((entry: any) => String(entry?.id || '')),
                    generatedAt: new Date().toISOString()
                });
                queueFile(attendanceRepoPath, Buffer.from(JSON.stringify(attendanceFile), 'utf8'));
            } catch (err) {
                log.warn('[Main] Failed to build attendance history (non-blocking):', err);
            }
```

Note: `withPagesPath`, `treeMap`, `getGithubBlob`, `token`, `owner`, `repo`, `queueFile`, `builtReport`, `mergedEntries`, and the `RollupReportPayload` type are all already in scope at the rollup block — this mirrors it exactly.

- [ ] **Step 5: Delete-handler prune parity (so deleted raids drop from attendance.json)**

In the delete-reports handler, the rollup is pruned around `src/main/handlers/githubHandlers.ts:1233-1251` (reads `reports/rollup.json`, calls `removeRollupSources`, re-queues). Immediately after that rollup-prune block, add the analogous attendance prune so a delete removes those raids on the next tree update:
```ts
                const attendanceRepoPath = withPagesPath(pagesPath, 'reports/attendance.json');
                const attendanceEntry = (treeEntries as any[]).find(
                    (entry: any) => entry?.path === attendanceRepoPath && entry?.type === 'blob' && entry?.sha
                );
                if (attendanceEntry) {
                    const blob = await getGithubBlob(owner, repo, attendanceEntry.sha, token);
                    const parsed = blob?.content
                        ? parseAttendanceFile(JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8')))
                        : null;
                    if (parsed) {
                        const deletedSet = new Set(reportIds.map((id: any) => String(id || '').trim()));
                        const keptRaids = parsed.raids.filter((r) => !deletedSet.has(String(r.id).trim()));
                        const attendanceBlob = await createGithubBlob(
                            owner, repo, token,
                            JSON.stringify({ ...parsed, raids: keptRaids }),
                            attendanceRepoPath
                        );
                        commitEntries.push({ path: attendanceRepoPath, sha: attendanceBlob.sha });
                    }
                }
```
Verify the exact local variable names at that delete site (`treeEntries`/`reportIds`/`commitEntries`/`createGithubBlob`) match what the rollup-prune block above it uses, and reuse those — do not invent new names. If a name differs, mirror the rollup-prune block's names verbatim.

- [ ] **Step 6: Typecheck + lint + package test**

Run: `npm run typecheck`
Expected: clean (both tsc invocations).

Run: `npm run lint`
Expected: 0 warnings/errors.

Run: `cd packages/bridge-metrics && npm test`
Expected: all package tests pass (incl. attendance).

- [ ] **Step 7: Commit**

```bash
git add packages/bridge-metrics/package.json packages/bridge-metrics/tsup.config.ts src/web/attendance.ts src/main/handlers/githubHandlers.ts
git commit -m "feat(reports): publish reports/attendance.json alongside rollup"
```

---

### Task 3: Verification sweep + fixture export for the consumer

**Files:**
- Create: `docs/superpowers/attendance-fixture.json` (a small sample the AxiRoster consumer plan tests against)

- [ ] **Step 1: Generate a fixture from the test shape**

Create `docs/superpowers/attendance-fixture.json` — a minimal valid artifact the AxiRoster side can vendor as a test fixture:
```json
{
  "version": 1,
  "generatedAt": "2026-02-09T00:00:00Z",
  "raids": [
    { "id": "r3", "date": "2026-02-08T01:00:00Z", "attendees": [
      { "account": "Eternal.1842", "combatTimeMs": 0, "squadTimeMs": 7200000 },
      { "account": "Aldous.7781", "combatTimeMs": 5400000, "squadTimeMs": 7200000 } ] },
    { "id": "r2", "date": "2026-02-05T01:00:00Z", "attendees": [
      { "account": "Aldous.7781", "combatTimeMs": 5000000, "squadTimeMs": 7000000 } ] },
    { "id": "r1", "date": "2026-02-01T01:00:00Z", "attendees": [
      { "account": "Eternal.1842", "combatTimeMs": 4000000, "squadTimeMs": 6000000 },
      { "account": "Aldous.7781", "combatTimeMs": 5000000, "squadTimeMs": 6000000 } ] }
  ]
}
```

- [ ] **Step 2: Full sweep**

Run: `cd packages/bridge-metrics && npm test`  → all pass.
Run (repo root): `npm run validate`  → typecheck + lint clean.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/attendance-fixture.json
git commit -m "test(reports): sample attendance.json fixture for consumers"
```

---

## Self-Review Notes

- **Spec coverage:** new versioned `attendance.json` with the exact contract (Task 1 types) ✓; follows rollup builder/extractor/parser pattern + naming (Task 1) ✓; per-raid date + attendees with combat/squad time, de-duped (Task 1 `buildAttendanceRaid`) ✓; publish integration non-blocking next to rollup (Task 2 Step 4) ✓; deletion prune parity (Task 2 Step 5) ✓; package export + tsup entry + shim so main can import (Task 2 Steps 1-3) ✓; fixture for the consumer (Task 3) ✓; tests (Task 1 + Task 3 sweep) ✓.
- **Placeholders:** none — all code is concrete; the two "verify the local variable names at the delete site" notes are explicit mirror-this instructions, not deferred work.
- **Type consistency:** `AttendanceRaid`/`AttendanceFile`/`buildAttendanceRaid`/`updateAttendanceForPublish`/`parseAttendanceFile`/`ATTENDANCE_VERSION` used identically across Tasks 1-2.
- **Risk:** the delete-handler site (Task 2 Step 5) depends on local names that the implementer must confirm against the rollup-prune block; flagged explicitly. The main publish site (Step 4) reuses the rollup block's in-scope variables verbatim.
