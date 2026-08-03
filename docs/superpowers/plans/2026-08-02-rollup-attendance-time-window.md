# Rollup Attendance Time-Window Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side time-window filter (All time / Last 30 days / Last 90 days / month picker) to the web rollup page so guilds can see post-purge attendance without deleting fight reports.

**Architecture:** The rollup viewer already recomputes all aggregates in the browser via `buildRollupData(sources)`. We keep the loaded per-report `sources` in state instead of aggregating immediately, filter them by a window value (pure helper module) before aggregation, and add a filter-strip UI. Everything downstream (KPI cards, commander table, players table) updates automatically because the filter runs before aggregation. No storage, publish-flow, or contract changes.

**Tech Stack:** React 18 + TypeScript (web viewer bundle, `src/web/`), vitest for unit tests (config already caps `maxWorkers`/`maxForks` at 2 — do not override upward).

**Spec:** `docs/superpowers/specs/2026-08-02-rollup-attendance-time-window-design.md`

## Global Constraints

- Window values are strings doubling as URL param and select values: `'all' | '30d' | '90d' | 'YYYY-MM'`. Default `'all'`.
- URL param name is `window` (`?view=rollup&window=2026-07`); `'all'` removes the param. Updates use `history.replaceState` (page-load routing in this app reads search params once).
- Month bucketing uses the **viewer's local time** of the parsed timestamp; day presets are relative to the viewer's now. Month labels are `en-US` short form (`Jul 2026`).
- Sources with no parseable date appear only in All time.
- Keep the derived aggregate's variable name `rollupData` so the ~30 existing downstream usages in `reportApp.tsx` are untouched.
- All new UI copy/styling follows the existing rollup glass style (`glassCard` + `glassCardStyle`, `text-[11px] uppercase tracking-widest` labels, accent via `var(--accent-border)` / `var(--accent-bg)` / `var(--brand-primary)`).
- Run tests as `npx vitest run <file>` (repo `vitest.config.ts` already limits parallelism; never raise it).

## File Structure

- `src/web/rollupTimeWindow.ts` — **new**, pure helpers: window param parsing, source timestamps, filtering, month listing, labels. No React, no DOM (except none — `URLSearchParams`/`history` stay in `reportApp.tsx`).
- `src/web/__tests__/rollupTimeWindow.test.ts` — **new**, unit tests for the helpers (mirrors `rollup.test.ts` style).
- `src/web/reportApp.tsx` — **modify**: sources-in-state rewiring, `timeWindow` state + URL sync, failed-report accounting fix, filter strip UI, header pill hint, empty-state copy.
- `docs/superpowers/specs/2026-08-02-rollup-attendance-time-window-design.md` — **modify**: one-line placement correction (strip sits between header and KPI cards, per approved mockup).

---

### Task 1: Pure time-window helper module

**Files:**
- Create: `src/web/rollupTimeWindow.ts`
- Test: `src/web/__tests__/rollupTimeWindow.test.ts`

**Interfaces:**
- Consumes: `RollupReportPayload` type from `../rollup` (re-export of `@axiapps/bridge-metrics/rollup`).
- Produces (Task 2/3 rely on these exact names):
  - `ALL_TIME_WINDOW = 'all'`
  - `DAY_WINDOW_PRESETS: ReadonlyArray<{ value: '30d' | '90d'; label: string; days: number }>`
  - `parseWindowParam(raw: string | null | undefined): string`
  - `isMonthWindow(value: string): boolean`
  - `sourceTimestamp(source: RollupReportPayload): number | null`
  - `filterSourcesByWindow(sources: RollupReportPayload[], window: string, nowMs: number): RollupReportPayload[]`
  - `listSourceMonths(sources: RollupReportPayload[]): Array<{ value: string; label: string; reportCount: number }>`
  - `describeWindow(window: string): string | null` (null for `'all'`)

- [ ] **Step 1: Write the failing tests**

Create `src/web/__tests__/rollupTimeWindow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
    ALL_TIME_WINDOW,
    DAY_WINDOW_PRESETS,
    describeWindow,
    filterSourcesByWindow,
    isMonthWindow,
    listSourceMonths,
    parseWindowParam,
    sourceTimestamp
} from '../rollupTimeWindow';

// Build ISO strings from viewer-local components so month expectations hold in any TZ.
const localIso = (year: number, monthIndex: number, day: number, hour = 20) =>
    new Date(year, monthIndex, day, hour).toISOString();

const source = (id: string, dateStart?: string, dateEnd?: string, generatedAt?: string) => ({
    meta: { id, dateStart, dateEnd, generatedAt },
    stats: {}
});

describe('parseWindowParam', () => {
    it('defaults to all time for missing or invalid values', () => {
        expect(parseWindowParam(null)).toBe(ALL_TIME_WINDOW);
        expect(parseWindowParam(undefined)).toBe(ALL_TIME_WINDOW);
        expect(parseWindowParam('')).toBe(ALL_TIME_WINDOW);
        expect(parseWindowParam('garbage')).toBe(ALL_TIME_WINDOW);
        expect(parseWindowParam('2026-13')).toBe(ALL_TIME_WINDOW);
        expect(parseWindowParam('2026-7')).toBe(ALL_TIME_WINDOW);
    });
    it('accepts presets and valid months', () => {
        expect(parseWindowParam('30d')).toBe('30d');
        expect(parseWindowParam('90d')).toBe('90d');
        expect(parseWindowParam('2026-07')).toBe('2026-07');
        expect(parseWindowParam(' 2026-07 ')).toBe('2026-07');
    });
});

describe('isMonthWindow', () => {
    it('recognizes YYYY-MM values only', () => {
        expect(isMonthWindow('2026-07')).toBe(true);
        expect(isMonthWindow('30d')).toBe(false);
        expect(isMonthWindow('all')).toBe(false);
    });
});

describe('sourceTimestamp', () => {
    it('prefers dateStart, then dateEnd, then generatedAt', () => {
        const start = '2026-07-01T01:00:00Z';
        const end = '2026-07-01T04:00:00Z';
        const gen = '2026-07-01T05:00:00Z';
        expect(sourceTimestamp(source('a', start, end, gen))).toBe(Date.parse(start));
        expect(sourceTimestamp(source('b', undefined, end, gen))).toBe(Date.parse(end));
        expect(sourceTimestamp(source('c', undefined, undefined, gen))).toBe(Date.parse(gen));
    });
    it('returns null when nothing parses', () => {
        expect(sourceTimestamp(source('d'))).toBeNull();
        expect(sourceTimestamp(source('e', 'not a date'))).toBeNull();
    });
});

describe('filterSourcesByWindow', () => {
    it('passes everything through for all time, including dateless sources', () => {
        const sources = [source('a', localIso(2026, 6, 10)), source('b')];
        expect(filterSourcesByWindow(sources, ALL_TIME_WINDOW, Date.parse('2026-08-02T00:00:00Z'))).toEqual(sources);
    });
    it('keeps sources on or after the day-window cutoff and drops dateless ones', () => {
        const now = Date.parse('2026-08-02T00:00:00Z');
        const day = 24 * 60 * 60 * 1000;
        const atCutoff = source('edge', new Date(now - 30 * day).toISOString());
        const inside = source('in', new Date(now - 5 * day).toISOString());
        const outside = source('out', new Date(now - 31 * day).toISOString());
        const dateless = source('none');
        const result = filterSourcesByWindow([atCutoff, inside, outside, dateless], '30d', now);
        expect(result.map((s) => s.meta?.id)).toEqual(['edge', 'in']);
    });
    it('matches month windows by viewer-local year and month', () => {
        const july = source('jul', localIso(2026, 6, 15));
        const june = source('jun', localIso(2026, 5, 15));
        const nextJuly = source('jul25', localIso(2025, 6, 15));
        const dateless = source('none');
        const now = Date.parse('2026-08-02T00:00:00Z');
        const monthValue = `2026-${String(7).padStart(2, '0')}`;
        const result = filterSourcesByWindow([july, june, nextJuly, dateless], monthValue, now);
        expect(result.map((s) => s.meta?.id)).toEqual(['jul']);
    });
});

describe('listSourceMonths', () => {
    it('lists distinct local months newest first with report counts', () => {
        const months = listSourceMonths([
            source('a', localIso(2026, 6, 4)),
            source('b', localIso(2026, 6, 18)),
            source('c', localIso(2026, 4, 2)),
            source('d')
        ]);
        expect(months.map((m) => m.value)).toEqual(['2026-07', '2026-05']);
        expect(months[0].reportCount).toBe(2);
        expect(months[1].reportCount).toBe(1);
        expect(months[0].label).toBe('Jul 2026');
        expect(months[1].label).toBe('May 2026');
    });
});

describe('describeWindow', () => {
    it('labels presets and months, and returns null for all time', () => {
        expect(describeWindow(ALL_TIME_WINDOW)).toBeNull();
        expect(describeWindow('30d')).toBe('Last 30 days');
        expect(describeWindow('90d')).toBe('Last 90 days');
        expect(describeWindow('2026-07')).toBe('Jul 2026');
    });
    it('exposes matching preset metadata', () => {
        expect(DAY_WINDOW_PRESETS.map((p) => p.value)).toEqual(['30d', '90d']);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /var/home/mstephens/Documents/GitHub/axibridge && npx vitest run src/web/__tests__/rollupTimeWindow.test.ts`
Expected: FAIL — cannot resolve `../rollupTimeWindow`.

- [ ] **Step 3: Implement the helper module**

Create `src/web/rollupTimeWindow.ts`:

```ts
// Pure helpers for the rollup page's time-window filter. Window values are
// strings that double as URL params and <select> values:
//   'all' | '30d' | '90d' | 'YYYY-MM'
// Month semantics are viewer-local (raid nights are local-evening events);
// sources with no parseable date can only appear in the all-time window.
import type { RollupReportPayload } from './rollup';

export const ALL_TIME_WINDOW = 'all';

export const DAY_WINDOW_PRESETS: ReadonlyArray<{ value: '30d' | '90d'; label: string; days: number }> = [
    { value: '30d', label: 'Last 30 days', days: 30 },
    { value: '90d', label: 'Last 90 days', days: 90 }
];

const MONTH_WINDOW_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const isMonthWindow = (value: string): boolean => MONTH_WINDOW_PATTERN.test(value);

export const parseWindowParam = (raw: string | null | undefined): string => {
    const value = String(raw || '').trim();
    if (DAY_WINDOW_PRESETS.some((preset) => preset.value === value)) return value;
    if (isMonthWindow(value)) return value;
    return ALL_TIME_WINDOW;
};

export const sourceTimestamp = (source: RollupReportPayload): number | null => {
    const meta = source?.meta || {};
    for (const raw of [meta.dateStart, meta.dateEnd, meta.generatedAt]) {
        const value = String(raw || '').trim();
        if (!value) continue;
        const ts = Date.parse(value);
        if (Number.isFinite(ts)) return ts;
    }
    return null;
};

const monthValueOf = (ts: number): string => {
    const date = new Date(ts);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabelOf = (value: string): string => {
    const match = MONTH_WINDOW_PATTERN.exec(value);
    if (!match) return value;
    const [, year, month] = match;
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric'
    });
};

// Param named windowValue (not window) to avoid shadowing the browser global,
// which the repo's zero-warning lint config would reject.
export const filterSourcesByWindow = (
    sources: RollupReportPayload[],
    windowValue: string,
    nowMs: number
): RollupReportPayload[] => {
    if (windowValue === ALL_TIME_WINDOW) return sources;
    const preset = DAY_WINDOW_PRESETS.find((p) => p.value === windowValue);
    if (preset) {
        const cutoff = nowMs - preset.days * DAY_MS;
        return sources.filter((source) => {
            const ts = sourceTimestamp(source);
            return ts !== null && ts >= cutoff;
        });
    }
    if (isMonthWindow(windowValue)) {
        return sources.filter((source) => {
            const ts = sourceTimestamp(source);
            return ts !== null && monthValueOf(ts) === windowValue;
        });
    }
    return sources;
};

export const listSourceMonths = (
    sources: RollupReportPayload[]
): Array<{ value: string; label: string; reportCount: number }> => {
    const counts = new Map<string, number>();
    for (const source of sources) {
        const ts = sourceTimestamp(source);
        if (ts === null) continue;
        const value = monthValueOf(ts);
        counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([value, reportCount]) => ({ value, label: monthLabelOf(value), reportCount }));
};

export const describeWindow = (windowValue: string): string | null => {
    if (windowValue === ALL_TIME_WINDOW) return null;
    const preset = DAY_WINDOW_PRESETS.find((p) => p.value === windowValue);
    if (preset) return preset.label;
    if (isMonthWindow(windowValue)) return monthLabelOf(windowValue);
    return null;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /var/home/mstephens/Documents/GitHub/axibridge && npx vitest run src/web/__tests__/rollupTimeWindow.test.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axibridge
git add src/web/rollupTimeWindow.ts src/web/__tests__/rollupTimeWindow.test.ts
git commit -m "feat(web): pure time-window helpers for rollup attendance filter"
```

---

### Task 2: Keep sources in state and derive the windowed rollup

**Files:**
- Modify: `src/web/reportApp.tsx:327` (state), `:999` and `:1088-1172` (loader effect), `:1233-1236` (failed count)

**Interfaces:**
- Consumes: `ALL_TIME_WINDOW`, `parseWindowParam`, `filterSourcesByWindow`, `listSourceMonths` from `./rollupTimeWindow`; `buildRollupData`, `RollupReportPayload` from `./rollup`.
- Produces (Task 3 relies on these exact names in `ReportApp` scope): `timeWindow: string`, `updateTimeWindow(next: string): void`, `rollupData` (unchanged name, now derived), `sourceMonths`, `allTimeRaidCount: number`.

- [ ] **Step 1: Replace rollup state with sources + window state**

In `src/web/reportApp.tsx`, add `RollupReportPayload` to the existing import from `./rollup`, add a new import from `./rollupTimeWindow`, then replace line 327:

```tsx
// was: const [rollupData, setRollupData] = useState<RollupData | null>(null);
const [rollupSources, setRollupSources] = useState<RollupReportPayload[] | null>(null);
const [timeWindow, setTimeWindow] = useState<string>(() => parseWindowParam(initialSearchParams.get('window')));
```

Immediately after the `isRollupView` memo (line 356), add the derived values and the URL-syncing setter:

```tsx
const rollupData = useMemo(
    () => (rollupSources ? buildRollupData(filterSourcesByWindow(rollupSources, timeWindow, Date.now())) : null),
    [rollupSources, timeWindow]
);
const sourceMonths = useMemo(() => listSourceMonths(rollupSources || []), [rollupSources]);
const allTimeRaidCount = useMemo(
    () => (rollupSources ? buildRollupData(rollupSources).uniqueRaids : 0),
    [rollupSources]
);
const updateTimeWindow = (next: string) => {
    setTimeWindow(next);
    const url = new URL(window.location.href);
    if (next === ALL_TIME_WINDOW) url.searchParams.delete('window');
    else url.searchParams.set('window', next);
    window.history.replaceState(null, '', url);
};
```

- [ ] **Step 2: Point the loader effect at setRollupSources**

Five call sites, same effect (`:999`, `:1088-1172`):

| Location | Was | Becomes |
| --- | --- | --- |
| `:999` (view change reset) | `setRollupData(null)` | `setRollupSources(null)` |
| `:1092` (not rollup view) | `setRollupData(null)` | `setRollupSources(null)` |
| `:1099` (empty index) | `setRollupData(buildRollupData([]))` | `setRollupSources([])` |
| `:1141` (precomputed sources) | `setRollupData(buildRollupData(parsed.sources))` | `setRollupSources(parsed.sources)` |
| `:1149` (sources + legacy backfill) | `setRollupData(buildRollupData([...parsed.sources, ...legacyReports]))` | `setRollupSources([...parsed.sources, ...legacyReports])` |
| `:1160-1161` (legacy fetch-everything) | `const nextRollup = buildRollupData(loadedReports); setRollupData(nextRollup);` | `setRollupSources(loadedReports);` |

The legacy path's `if (loadedReports.length === 0)` error check already reads the array, not the rollup — keep it as is.

- [ ] **Step 3: Fix failed-report accounting to use unfiltered sources**

Replace `:1233-1236`:

```tsx
const failedRollupReports = useMemo(() => {
    // Compare against the unfiltered sources: a narrowed time window must not
    // read as load failures.
    const loaded = rollupSources?.length || 0;
    return Math.max(0, rollupRequestedCount - loaded);
}, [rollupSources, rollupRequestedCount]);
```

- [ ] **Step 4: Typecheck and run the full test suite**

Run: `cd /var/home/mstephens/Documents/GitHub/axibridge && npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests pass (default window `'all'` is a passthrough, so behavior is unchanged).

- [ ] **Step 5: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axibridge
git add src/web/reportApp.tsx
git commit -m "refactor(web): derive rollup aggregate from windowed sources kept in state"
```

---

### Task 3: Time-window strip UI, header hint, empty-state copy

**Files:**
- Modify: `src/web/reportApp.tsx` — filter strip after the header row (insert before the KPI grid at `:2059`, inside the `!error && index` fragment at `:2057`), header raids pill (`:2032-2035`), players empty state (`:2216-2217`)
- Modify: `docs/superpowers/specs/2026-08-02-rollup-attendance-time-window-design.md` — placement sentence

**Interfaces:**
- Consumes from Task 2: `timeWindow`, `updateTimeWindow`, `sourceMonths`, `allTimeRaidCount`, derived `rollupData`. From Task 1: `ALL_TIME_WINDOW`, `DAY_WINDOW_PRESETS`, `describeWindow`, `isMonthWindow`.
- Produces: final user-facing feature; no downstream consumers.

- [ ] **Step 1: Add the time-window strip between header and KPI cards**

Inside `{!error && index && (<>` (line 2057), immediately before the KPI grid `<div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">`, insert:

```tsx
<div className={`${glassCard} px-4 py-3 mb-6 flex flex-wrap items-center gap-2`} style={glassCardStyle}>
    <span className="text-[11px] uppercase tracking-widest text-gray-400 mr-1">Time Window</span>
    {[{ value: ALL_TIME_WINDOW, label: 'All time' }, ...DAY_WINDOW_PRESETS].map((option) => (
        <button
            key={option.value}
            type="button"
            aria-pressed={timeWindow === option.value}
            onClick={() => updateTimeWindow(option.value)}
            className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                timeWindow === option.value
                    ? 'border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] text-white'
                    : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/25'
            }`}
        >
            {option.label}
        </button>
    ))}
    {sourceMonths.length > 0 && (
        <select
            aria-label="Filter by month"
            value={isMonthWindow(timeWindow) ? timeWindow : ''}
            onChange={(event) => {
                if (event.target.value) updateTimeWindow(event.target.value);
            }}
            className={`rounded-xl border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-border)] ${
                isMonthWindow(timeWindow)
                    ? 'border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] text-white'
                    : 'border-white/10 bg-white/5 text-gray-300'
            }`}
        >
            <option value="" disabled className="bg-slate-900 text-white">
                Pick a month...
            </option>
            {sourceMonths.map((month) => (
                <option key={month.value} value={month.value} className="bg-slate-900 text-white">
                    {month.label} · {month.reportCount} raid{month.reportCount === 1 ? '' : 's'}
                </option>
            ))}
        </select>
    )}
    {timeWindow !== ALL_TIME_WINDOW && rollupData && (
        <span className="text-xs text-gray-400 sm:ml-auto">
            Showing <span className="text-[color:var(--brand-primary)]">{describeWindow(timeWindow)}</span>
            {' '}· {rollupData.uniqueRaids} of {allTimeRaidCount} raids
        </span>
    )}
</div>
```

Note: the month `<option>` counts are source-report counts; the strip and KPI cards show exact deduplicated `uniqueRaids`. Duplicate uploads of the same raid are rare and collapsed at aggregation, so the dropdown counts are a listed, accepted approximation.

- [ ] **Step 2: Add the all-time hint to the header raids pill**

In the header pill (`:2032-2035`), after `{rollupData?.uniqueRaids || 0} Raids`, append:

```tsx
{timeWindow !== ALL_TIME_WINDOW && (
    <span className="normal-case tracking-normal text-gray-400">· of {allTimeRaidCount} all time</span>
)}
```

- [ ] **Step 3: Window-aware empty state for the players card**

Replace `:2216-2217`'s empty-state line:

```tsx
{rollupData.playerRows.length === 0 ? (
    <div className="text-sm text-gray-400">
        {timeWindow !== ALL_TIME_WINDOW
            ? `No raids in ${describeWindow(timeWindow)}. Pick a different window or switch back to All time.`
            : 'No attendance data found yet.'}
    </div>
) : ...
```

- [ ] **Step 4: Correct the spec's placement sentence**

In `docs/superpowers/specs/2026-08-02-rollup-attendance-time-window-design.md`, change

> A "Time Window" strip between the KPI cards and the tables, in the existing glass style:

to

> A "Time Window" strip between the page header and the KPI cards (per the approved mockup), in the existing glass style:

- [ ] **Step 5: Validate, spot-check, commit**

Run: `cd /var/home/mstephens/Documents/GitHub/axibridge && npm run validate && npx vitest run`
Expected: typecheck + lint clean, tests pass.

Optional manual spot-check: `npm run dev:web` (serves the viewer at 127.0.0.1:4173) against any locally staged report data; confirm pills toggle, month select filters, URL gains `window=`, header shows "of N all time".

```bash
cd /var/home/mstephens/Documents/GitHub/axibridge
git add src/web/reportApp.tsx docs/superpowers/specs/2026-08-02-rollup-attendance-time-window-design.md
git commit -m "feat(web): time-window filter strip on rollup page (presets + month picker)"
```

---

### Task 4: Full validation and web build smoke test

**Files:**
- No new files; fixes only if validation surfaces issues.

**Interfaces:**
- Consumes: everything above.
- Produces: green build; feature ready for the next release (web viewer ships with published reports; no separate deploy step in this repo's flow).

- [ ] **Step 1: Full suite + production web build**

Run: `cd /var/home/mstephens/Documents/GitHub/axibridge && npx vitest run && npm run validate && npm run build:web`
Expected: all pass; `build:web` emits the viewer bundle without errors.

- [ ] **Step 2: Commit any fallout fixes**

Only if Step 1 required changes:

```bash
cd /var/home/mstephens/Documents/GitHub/axibridge
git add -A src/web
git commit -m "fix(web): address validation fallout for rollup time-window filter"
```
