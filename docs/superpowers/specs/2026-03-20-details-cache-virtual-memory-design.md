# Details Cache: Virtual Memory for EI JSON Data

**Date:** 2026-03-20
**Status:** Draft
**Problem:** 16 WvW logs' EI JSON details held simultaneously in React state cause OOM in the Electron renderer (~1.4 GB in V8 heap, ~3.4 GB peak during stats computation with Web Worker structured clone).

## Context

### Current Architecture

EI JSON details (10–60 MB each, raw) flow through:

1. **Main process** fetches from dps.report → prunes via denylist → caches to disk (`dps-report-cache/`) → sends to renderer via IPC
2. **Renderer** stores in `ILogData.details` in React state (persists for lifetime of session)
3. **Stats computation** reads all logs' details from state, prunes again via renderer-side denylist, streams to Web Worker one at a time
4. **UI components** (ExpandableLogCard, StatsView spike/incoming) read `log.details` directly from state

### Why This OOMs

- All details live in React state simultaneously — no eviction
- V8 object overhead is ~3–5x the JSON serialized size
- Stats worker structured clone temporarily doubles the in-memory footprint
- The dual pruner system (main-side + renderer-side denylists) is fragile — the recent denylist conversion accidentally let ~3.8–15 MB/log of unused fields through

### Analogy

This is the equivalent of a 3D game rendering every object in the world simultaneously. The fix is the same: only load what's in the viewport.

## Design

### Core Primitive: DetailsCache

A two-tier cache that manages EI JSON details lifecycle:

```
Component requests details(logId)
         ↓
┌─ Memory LRU (capacity: 5) ──── hit → return instantly (0ms)
│        miss ↓
├─ IndexedDB (idb-keyval) ─────── hit → promote to LRU, return (~1-5ms)
│        miss ↓
└─ IPC to main process ────────── fetch from disk cache / dps.report (~50-100ms)
         ↓
   Store in IndexedDB + LRU, return
```

**Memory tier:** A `Map<string, { details, lastAccessed }>` with LRU eviction. Capacity of ~5 entries bounds renderer memory to ~5 logs' worth of details regardless of session size. At 20 MB/log after light pruning, that is ~100 MB in the LRU — well within budget.

**IndexedDB tier:** Uses `idb-keyval` (~600 bytes, zero config) for persistent renderer-side storage. Keyed by log ID. No TTL needed — the main process disk cache handles staleness. Survives app restarts, so previously viewed logs' details are instantly available.

**IPC fallback:** Existing `electronAPI.getLogDetails()` path. The main process serves from its disk cache (`dps-report-cache/`, 24h TTL) or re-fetches from dps.report as a last resort.

### React Hook: useLogDetails(logId)

```typescript
function useLogDetails(logId: string | undefined): {
  details: EIDetails | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
}
```

- Returns cached details synchronously if available in LRU
- Triggers async fetch (IndexedDB → IPC) on cache miss, returns `status: 'loading'`
- Re-renders only when this specific logId's status changes (not on every state update)
- Components show existing lightweight data (dashboardSummary, log metadata) while details load

### DetailsCache Class API

```typescript
class DetailsCache {
  constructor(options: { lruCapacity: number });  // default: 5

  // Synchronous — checks memory LRU only
  peek(logId: string): EIDetails | undefined;

  // Async — checks LRU → IndexedDB → IPC fallback
  get(logId: string): Promise<EIDetails | null>;

  // Write-through — stores in both LRU and IndexedDB
  put(logId: string, details: EIDetails): Promise<void>;

  // Evict from memory LRU only (IndexedDB retained)
  evict(logId: string): void;

  // Evict from both memory and IndexedDB
  purge(logId: string): Promise<void>;

  // Current memory LRU size
  readonly memorySize: number;
}
```

Singleton instance created once at app startup, accessible via React context.

## Implementation Phases

### Phase 1: Foundation

**Goal:** Create DetailsCache, idb-keyval integration, and useLogDetails hook. No consumers migrated yet — this phase is pure addition.

**Files created:**
- `src/renderer/cache/DetailsCache.ts` — the cache class
- `src/renderer/cache/useLogDetails.ts` — the React hook
- `src/renderer/cache/DetailsCacheContext.tsx` — React context provider
- `src/renderer/cache/__tests__/DetailsCache.test.ts` — unit tests

**Dependencies added:**
- `idb-keyval` (~600 bytes gzipped)

**Integration point:** DetailsCache wired into `AppLayout.tsx` via context provider. Main process push (on upload completion) writes to IndexedDB via a new IPC listener in the renderer.

**What this fixes:** Nothing yet — this is the foundation. But the cache is testable and usable.

### Phase 2: Incremental Consumer Migration

Key constraint: `ILogData.details` stays in the type definition as a **write-through mirror** during 2a–2c. This allows migrating one consumer at a time without breaking others.

#### Phase 2a: ExpandableLogCard

**Goal:** Proof-of-concept — migrate simplest single-log consumer.

- Replace direct `log.details` access with `useLogDetails(log.id)`
- Show skeleton/spinner during cache miss (brief — IndexedDB hits are ~1-5ms)
- Validates hook works end-to-end

**Risk:** Low. Single component, single-log access pattern.

#### Phase 2b: StatsView Inline Consumers

**Goal:** Migrate spike damage and incoming strike damage computations.

- `StatsView.tsx` spike damage iteration → pull details from cache per-log
- `computeIncomingStrikeDamageData.ts` → same pattern
- These already loop one log at a time, so the async pattern maps naturally

**Risk:** Medium. These iterate all logs but only read specific time-series fields.

#### Phase 2c: Stats Worker Streaming

**Goal:** Migrate the biggest memory consumer — the Web Worker streaming loop.

- `useStatsAggregationWorker` streaming loop calls `detailsCache.get(logId)` instead of reading `log.details` from state
- Each log's details fetched from cache → posted to worker → LRU evicts naturally as next log loads
- The 260ms artificial backoff in `useDetailsHydration` becomes unnecessary — cache hits are instant
- Peak renderer memory during stats: ~1 log's details in LRU + the worker's internal state (worker memory is separate from renderer heap)

**Risk:** Medium-high. This is the core stats path. Needs careful testing with large sessions.

#### Phase 2d: Remove details from React State

**Goal:** Full memory win — `ILogData.details` removed from the interface.

- `details` field removed from `ILogData`
- `useDetailsHydration` hook retired entirely — cache handles all fetching
- Main process push on upload writes to IndexedDB via IPC event (not into React state)
- React state only holds metadata + `dashboardSummary` per log

**Breaking change:** All remaining `log.details` references must be migrated. By this point, 2a–2c have already handled the main consumers. Remaining references (if any) are migrated here.

**Memory budget after 2d:**
- React state: ~1 KB/log × N logs (metadata only)
- Memory LRU: ~100 MB (5 logs × ~20 MB each)
- IndexedDB: unbounded but off-heap (browser-managed)
- Web Worker: separate heap, processes one log at a time
- **Total renderer heap: ~150–200 MB** regardless of session size (vs ~1.4 GB+ before)

### Phase 3: Stats Dashboard Speedup

**Goal:** Near-instant stats view loading via pre-warming.

**Current load sequence:**
```
Enter stats view → useDetailsHydration → 16 serial IPC fetches (1 concurrent, ~50-100ms each from disk cache)
→ ~800-1600ms fetching → stats computation → render
```
Note: `useDetailsHydration` fetches one log at a time (`maxConcurrent = 1`). The 260ms delay only applies to retry-on-failure scheduling, not between successful fetches. The bottleneck is serial IPC round-trips, not artificial backoff.

**New sequence:**
```
Enter stats view → worker streaming → cache.get() per log
→ IndexedDB hit: ~1-5ms each → all 16 in <100ms
→ stats computation starts immediately → render
```

**Pre-warming on upload:** When a log finishes uploading, the main process sends the pruned details to the renderer via IPC event. The renderer writes directly to IndexedDB (not React state). By the time the user switches to stats view, all details are already cached.

**Re-visit speedup:** If the user leaves stats view and returns, details are still in IndexedDB. No re-fetching at all.

### Phase 4: Simplify Pruning

**Goal:** Collapse the dual pruner system into a single light pass.

With bounded memory via the LRU (max ~5 logs in memory), aggressive pruning is no longer load-bearing for OOM prevention. Pruning becomes a storage/bandwidth optimization only.

**Collapse to single ingest pruner:**
- One pruner in the main process, applied when details are first fetched from dps.report
- Strip only genuinely unused fields: `mechanics`, `consumables`, `weaponSets`, `weapons`, `guildID`, `targetConditionDamage1S`, `damageModifiersTarget`, `incomingDamageModifiersTarget`, `deathRecap`, `conditionDamage1S` (player), `conditionDamageTaken1S`
- Keep everything else — no more allowlist/denylist complexity

**Retire renderer-side pruner:**
- `pruneStatsLog.ts` deleted — the cache serves pre-pruned data
- `pruneDetailsForStats` in `detailsProcessing.ts` simplified to the light pass above
- `isStatsPrunedLog` / `__statsPruned` flag retired

**Fields confirmed safe to remove** (not consumed by any code path):
| Field | Size (50-player log) | Consumer |
|-------|---------------------|----------|
| mechanics | ~10 KB | None |
| targetConditionDamage1S | ~2.4 MB | None |
| damageModifiersTarget | ~1.2 MB | None |
| incomingDamageModifiersTarget | ~1.0 MB | None |
| deathRecap | ~0.4 MB | None |
| conditionDamage1S (player) | ~0.02 MB | None |
| conditionDamageTaken1S | ~0.02 MB | None |
| consumables | trivial | None |
| weaponSets, weapons | trivial | None |
| guildID | trivial | None |

**Fields that MUST be kept** (actively consumed):
| Field | Consumer |
|-------|----------|
| damageTaken1S | StatsView.tsx — incoming damage timeline |
| powerDamage1S | computeIncomingStrikeDamageData.ts — strike damage timeline |
| rotation | computeSkillUsageData.ts — APM calculation |
| minions | pruneStatsLog.ts — minion damage taken |

## Scope

**In scope:** Electron renderer (`src/renderer/`) and main process IPC/cache integration.

**Out of scope:** The web report viewer (`src/web/reportApp.tsx`) is unaffected — it loads data from a static `report.json` file, not from IPC or IndexedDB. No changes needed there.

## IndexedDB Versioning

Each IndexedDB entry includes a `schemaVersion` number alongside the details payload:

```typescript
{ schemaVersion: 1, details: { ... }, storedAt: number }
```

On read, if `schemaVersion` does not match the current version, the entry is treated as a cache miss (IPC fallback fetches fresh data, which overwrites the stale entry). This handles Phase 4's pruning changes gracefully — bumping the schema version invalidates all old entries without requiring an explicit migration.

## Implementation Notes

- **`put` writes to IndexedDB are fire-and-forget** in the hot path (stats streaming, pre-warming). The write is initiated but not awaited, so 20 MB structured clones don't block the rendering thread. Errors are caught and logged silently — the memory LRU is the primary tier; IndexedDB is a persistence optimization.
- **LRU evictions do NOT trigger IndexedDB writes.** The `evict(logId)` method only removes from the in-memory Map. Data is already in IndexedDB from the initial `put` (write-through on first load). This avoids redundant serialization during stats streaming when the LRU churns through 16 logs.
- **Worker streaming chunking.** The spec describes one-log-at-a-time for simplicity, but the actual streaming loop uses `requestIdleCallback` with adaptive chunk sizes (1–4 logs per idle callback based on available time budget). The cache integration preserves this behavior — `cache.get()` calls are batched per chunk.

## Testing Strategy

### Unit Tests
- `DetailsCache`: LRU eviction order, IndexedDB read/write, IPC fallback, concurrent requests for same logId
- `useLogDetails`: loading states, cache hit vs miss, re-render behavior
- Memory LRU capacity enforcement

### Integration Tests
- Full flow: upload → IndexedDB populated → stats view → cache hits → computation
- Cache miss recovery: clear IndexedDB → IPC fallback works
- Eviction under pressure: load 10 logs, verify only 5 in memory

### Regression Tests
- Stats output identical before/after migration (compare against existing test fixtures)
- Existing audit scripts pass: `npm run audit:metrics`, `npm run audit:boons`

## Dependencies

| Package | Size | Purpose |
|---------|------|---------|
| `idb-keyval` | ~600 bytes gzipped | IndexedDB key-value wrapper |

No other new dependencies. `@tanstack/react-query` considered but rejected — the bespoke DetailsCache is simpler for this specific use case (single data type, known access patterns, no background refetching needed).

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| IndexedDB quota limits | Browser grants generous quota (typically 50%+ of disk). EI JSONs at ~20 MB × 100 logs = 2 GB — well within limits. Add a `purgeOldest()` if needed. |
| IndexedDB blocked/unavailable | Fall back to IPC-only mode (same as today, minus the memory benefit of IndexedDB persistence) |
| Brief loading flash on card expansion | IndexedDB reads are ~1-5ms — unlikely to be perceptible. If LRU hit, instant. |
| Stats computation slower with async detail fetching | Pre-warming on upload means cache is hot before stats view opens. Even cold IndexedDB reads (16 × 5ms = 80ms) are faster than current serial IPC (16 × 50-100ms = 800-1600ms). |
| Worker streaming depends on async cache | The streaming loop already uses `requestIdleCallback` with chunking. Awaiting cache.get() adds negligible overhead vs the current sync read. |

## Migration Checklist

All consumers of `log.details` that need migration (ordered by phase):

**Phase 2a:**
- [ ] `ExpandableLogCard.tsx` — single-log expansion

**Phase 2b:**
- [ ] `StatsView.tsx` — spike damage fallback accessing `log.details` (~line 1136, `spikeDamageData` useMemo)
- [ ] `StatsView.tsx` — incoming damage timeline `squadIncomingDamageBucketsByFightId` (~line 2721, reads `damageTaken1S`)
- [ ] `StatsView.tsx` — incoming strike skill drilldown (~line 1941, reads `selectedLog?.details`)

**Phase 2c:**
- [ ] `useStatsAggregationWorker.ts` — worker streaming loop (getPrunedLogForWorker)

**Phase 2d:**
- [ ] `useDetailsHydration.ts` — retire entirely
- [ ] `App.tsx` — remove details from logsForStats / scheduleDetailsHydration
- [ ] `useDevDatasets.ts` — details serialization/deserialization for dataset save/load
- [ ] `useDashboardStats.ts` — any `log.details` references
- [ ] `useStatsUploads.ts` — any `log.details` references
- [ ] `ILogData` interface — remove `details` field
- [ ] Any remaining `log.details` references

**Phase 4:**
- [ ] `detailsProcessing.ts` — simplify to light ingest pruner
- [ ] `pruneStatsLog.ts` — delete
- [ ] Remove `__statsPruned` / `isStatsPrunedLog` usage
