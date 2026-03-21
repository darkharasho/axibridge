# Details Cache Virtual Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace in-memory `ILogData.details` with a two-tier cache (memory LRU + IndexedDB) to prevent OOM crashes and speed up the stats dashboard.

**Architecture:** A `DetailsCache` class manages EI JSON details with a 5-entry memory LRU backed by IndexedDB (via `idb-keyval`). A `useLogDetails(logId)` React hook provides component-level access. Consumers are migrated incrementally from reading `log.details` in React state to pulling from the cache on demand, with the final phase removing `details` from state entirely.

**Tech Stack:** TypeScript, React 18, vitest, idb-keyval, Electron IPC

**Spec:** `docs/superpowers/specs/2026-03-20-details-cache-virtual-memory-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/renderer/cache/DetailsCache.ts` | Two-tier cache class (memory LRU + IndexedDB) |
| `src/renderer/cache/useLogDetails.ts` | React hook wrapping DetailsCache for component use |
| `src/renderer/cache/DetailsCacheContext.tsx` | React context provider + singleton instantiation |
| `src/renderer/cache/__tests__/DetailsCache.test.ts` | Unit tests for cache class |
| `src/renderer/cache/__tests__/useLogDetails.test.tsx` | Unit tests for React hook |

### Modified Files (by phase)
| Phase | File | Change |
|-------|------|--------|
| 1 | `package.json` | Add `idb-keyval` dependency |
| 1 | `src/renderer/App.tsx` | Create cache singleton, wrap with `DetailsCacheProvider` |
| 2a | `src/renderer/ExpandableLogCard.tsx` | Replace `log.details` with `useLogDetails` |
| 2b | `src/renderer/StatsView.tsx` | Replace all 5 inline `log.details`/`selectedLog?.details` reads |
| 2c | `src/renderer/stats/hooks/useStatsAggregationWorker.ts` | Replace `log.details` read in both streaming + inline paths with cache |
| 2d | `src/renderer/global.d.ts` | Remove `details` from `ILogData` |
| 2d | `src/renderer/app/hooks/useDetailsHydration.ts` | Delete (retired) |
| 2d | `src/renderer/App.tsx` | Remove hydration wiring, stop storing details in state |
| 2d | `src/renderer/app/hooks/useDevDatasets.ts` | Migrate details access to cache |
| 2d | `src/renderer/app/hooks/useStatsDataProgress.ts` | Replace `log.details` check with `detailsAvailable` flag |
| 2d | `src/renderer/stats/hooks/useStatsUploads.ts` | Migrate `log.details` in `buildReportMeta` to cache |
| 3 | `src/main/index.ts` or `src/main/handlers/uploadHandlers.ts` | Push details to renderer on upload completion |
| 3 | `src/renderer/App.tsx` | Add IPC listener to pre-warm cache |
| 3 | `src/preload/index.ts` | Expose `onDetailsPrewarm`/`offDetailsPrewarm` |
| 4 | `src/main/detailsProcessing.ts` | Simplify to light ingest pruner |
| 4 | `src/renderer/stats/utils/pruneStatsLog.ts` | Delete |
| 4 | `src/renderer/workers/statsWorker.ts` | Remove `pruneLogForStats`/`isStatsPrunedLog` imports |
| 4 | `src/shared/metrics-spec.md` | Remove stale `pruneStatsLog.ts` reference |

---

## Phase 1: Foundation

### Task 1: Install idb-keyval

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dependency**

Run: `npm install idb-keyval`

- [ ] **Step 2: Verify installation**

Run: `node -e "require('idb-keyval')"`
Expected: No error (module resolves)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add idb-keyval dependency for details cache"
```

---

### Task 2: Create DetailsCache class

**Files:**
- Create: `src/renderer/cache/DetailsCache.ts`
- Create: `src/renderer/cache/__tests__/DetailsCache.test.ts`

The cache class has two tiers: a synchronous memory LRU (Map-based, capacity-bounded) and an async IndexedDB tier via `idb-keyval`. An IPC fetcher is the final fallback. Each IndexedDB entry includes a `schemaVersion` for forward-compatible invalidation.

- [ ] **Step 1: Write failing tests for memory LRU**

Create `src/renderer/cache/__tests__/DetailsCache.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DetailsCache } from '../DetailsCache';

// Mock idb-keyval — tests should not touch real IndexedDB
vi.mock('idb-keyval', () => ({
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
}));

const mockFetcher = vi.fn().mockResolvedValue(null);

describe('DetailsCache', () => {
    let cache: DetailsCache;

    beforeEach(() => {
        vi.clearAllMocks();
        cache = new DetailsCache({ lruCapacity: 3, fetchDetails: mockFetcher });
    });

    describe('memory LRU', () => {
        it('peek returns undefined for unknown key', () => {
            expect(cache.peek('unknown')).toBeUndefined();
        });

        it('peek returns value after put', async () => {
            await cache.put('log-1', { players: [] } as any);
            expect(cache.peek('log-1')).toEqual({ players: [] });
        });

        it('evicts oldest entry when capacity exceeded', async () => {
            await cache.put('a', { id: 'a' } as any);
            await cache.put('b', { id: 'b' } as any);
            await cache.put('c', { id: 'c' } as any);
            await cache.put('d', { id: 'd' } as any); // should evict 'a'
            expect(cache.peek('a')).toBeUndefined();
            expect(cache.peek('d')).toEqual({ id: 'd' });
            expect(cache.memorySize).toBe(3);
        });

        it('accessing a key promotes it in LRU order', async () => {
            await cache.put('a', { id: 'a' } as any);
            await cache.put('b', { id: 'b' } as any);
            await cache.put('c', { id: 'c' } as any);
            // Access 'a' to promote it
            await cache.get('a');
            // Now 'b' is the oldest
            await cache.put('d', { id: 'd' } as any); // should evict 'b'
            expect(cache.peek('a')).toEqual({ id: 'a' });
            expect(cache.peek('b')).toBeUndefined();
        });

        it('evict removes from memory only', async () => {
            const { del } = await import('idb-keyval');
            await cache.put('log-1', { players: [] } as any);
            cache.evict('log-1');
            expect(cache.peek('log-1')).toBeUndefined();
            expect(del).not.toHaveBeenCalled();
        });

        it('memorySize reflects current LRU count', async () => {
            expect(cache.memorySize).toBe(0);
            await cache.put('a', { id: 'a' } as any);
            expect(cache.memorySize).toBe(1);
            await cache.put('b', { id: 'b' } as any);
            expect(cache.memorySize).toBe(2);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/cache/__tests__/DetailsCache.test.ts`
Expected: FAIL — `Cannot find module '../DetailsCache'`

- [ ] **Step 3: Implement DetailsCache class**

Create `src/renderer/cache/DetailsCache.ts`:

```typescript
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

const SCHEMA_VERSION = 1;
const IDB_PREFIX = 'details:';

type IdbEntry = { schemaVersion: number; details: any; storedAt: number };

export type DetailsFetcher = (logId: string) => Promise<any | null>;

export class DetailsCache {
    private lru = new Map<string, any>();
    private lruCapacity: number;
    private fetchDetails: DetailsFetcher;
    private inFlight = new Map<string, Promise<any | null>>();

    constructor(options: { lruCapacity?: number; fetchDetails: DetailsFetcher }) {
        this.lruCapacity = options.lruCapacity ?? 5;
        this.fetchDetails = options.fetchDetails;
    }

    /** Synchronous — checks memory LRU only. */
    peek(logId: string): any | undefined {
        return this.lru.get(logId);
    }

    /** Async — checks LRU → IndexedDB → IPC fallback. */
    async get(logId: string): Promise<any | null> {
        // Tier 1: memory LRU
        const memHit = this.lru.get(logId);
        if (memHit !== undefined) {
            // Promote to most-recently-used
            this.lru.delete(logId);
            this.lru.set(logId, memHit);
            return memHit;
        }

        // Tier 2: IndexedDB
        try {
            const entry = await idbGet<IdbEntry>(IDB_PREFIX + logId);
            if (entry && entry.schemaVersion === SCHEMA_VERSION && entry.details) {
                this.lruSet(logId, entry.details);
                return entry.details;
            }
        } catch {
            // IndexedDB unavailable — fall through to IPC
        }

        // Tier 3: IPC fallback (deduplicate concurrent requests)
        const existing = this.inFlight.get(logId);
        if (existing) return existing;

        const promise = this.fetchDetails(logId).then((fetched) => {
            this.inFlight.delete(logId);
            if (fetched) {
                this.lruSet(logId, fetched);
                this.idbPut(logId, fetched);
            }
            return fetched;
        }).catch((err) => {
            this.inFlight.delete(logId);
            throw err;
        });
        this.inFlight.set(logId, promise);
        return promise;
    }

    /** Write-through — stores in both LRU and IndexedDB. */
    async put(logId: string, details: any): Promise<void> {
        this.lruSet(logId, details);
        await this.idbPut(logId, details);
    }

    /** Fire-and-forget variant of put — does not await IndexedDB write. */
    putSync(logId: string, details: any): void {
        this.lruSet(logId, details);
        this.idbPut(logId, details);
    }

    /** Evict from memory LRU only (IndexedDB retained). */
    evict(logId: string): void {
        this.lru.delete(logId);
    }

    /** Evict from both memory and IndexedDB. */
    async purge(logId: string): Promise<void> {
        this.lru.delete(logId);
        try {
            await idbDel(IDB_PREFIX + logId);
        } catch {
            // IndexedDB unavailable — memory eviction still succeeded
        }
    }

    /** Current memory LRU size. */
    get memorySize(): number {
        return this.lru.size;
    }

    private lruSet(logId: string, details: any): void {
        // Delete first to refresh insertion order (Map iterates in insertion order)
        this.lru.delete(logId);
        this.lru.set(logId, details);
        // Evict oldest if over capacity
        if (this.lru.size > this.lruCapacity) {
            const oldest = this.lru.keys().next().value;
            if (oldest !== undefined) this.lru.delete(oldest);
        }
    }

    private idbPut(logId: string, details: any): Promise<void> {
        const entry: IdbEntry = {
            schemaVersion: SCHEMA_VERSION,
            details,
            storedAt: Date.now(),
        };
        return idbSet(IDB_PREFIX + logId, entry).catch(() => {
            // IndexedDB write failed — memory LRU still has it
        });
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/cache/__tests__/DetailsCache.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Write failing tests for IndexedDB tier and IPC fallback**

Append to `src/renderer/cache/__tests__/DetailsCache.test.ts`:

```typescript
    describe('IndexedDB tier', () => {
        it('get reads from IndexedDB on LRU miss', async () => {
            const { get: idbGetMock } = await import('idb-keyval');
            (idbGetMock as any).mockResolvedValueOnce({
                schemaVersion: 1,
                details: { id: 'from-idb' },
                storedAt: Date.now(),
            });
            const result = await cache.get('log-1');
            expect(result).toEqual({ id: 'from-idb' });
            // Should now be in memory LRU
            expect(cache.peek('log-1')).toEqual({ id: 'from-idb' });
        });

        it('ignores IndexedDB entries with wrong schemaVersion', async () => {
            const { get: idbGetMock } = await import('idb-keyval');
            (idbGetMock as any).mockResolvedValueOnce({
                schemaVersion: 999,
                details: { id: 'stale' },
                storedAt: Date.now(),
            });
            mockFetcher.mockResolvedValueOnce({ id: 'fresh' });
            const result = await cache.get('log-1');
            expect(result).toEqual({ id: 'fresh' });
        });

        it('put writes to IndexedDB', async () => {
            const { set: idbSetMock } = await import('idb-keyval');
            await cache.put('log-1', { id: 'written' });
            expect(idbSetMock).toHaveBeenCalledWith(
                'details:log-1',
                expect.objectContaining({ schemaVersion: 1, details: { id: 'written' } })
            );
        });

        it('purge removes from both memory and IndexedDB', async () => {
            const { del: idbDelMock } = await import('idb-keyval');
            await cache.put('log-1', { id: 'data' });
            await cache.purge('log-1');
            expect(cache.peek('log-1')).toBeUndefined();
            expect(idbDelMock).toHaveBeenCalledWith('details:log-1');
        });
    });

    describe('IPC fallback', () => {
        it('calls fetchDetails on full cache miss', async () => {
            mockFetcher.mockResolvedValueOnce({ id: 'from-ipc' });
            const result = await cache.get('log-1');
            expect(mockFetcher).toHaveBeenCalledWith('log-1');
            expect(result).toEqual({ id: 'from-ipc' });
            // Should be cached in LRU now
            expect(cache.peek('log-1')).toEqual({ id: 'from-ipc' });
        });

        it('returns null when fetcher returns null', async () => {
            mockFetcher.mockResolvedValueOnce(null);
            const result = await cache.get('log-1');
            expect(result).toBeNull();
            expect(cache.peek('log-1')).toBeUndefined();
        });

        it('handles IndexedDB error gracefully and falls through to IPC', async () => {
            const { get: idbGetMock } = await import('idb-keyval');
            (idbGetMock as any).mockRejectedValueOnce(new Error('IndexedDB blocked'));
            mockFetcher.mockResolvedValueOnce({ id: 'fallback' });
            const result = await cache.get('log-1');
            expect(result).toEqual({ id: 'fallback' });
        });

        it('deduplicates concurrent get() calls for the same logId', async () => {
            let resolveFirst!: (v: any) => void;
            mockFetcher.mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }));
            const p1 = cache.get('log-1');
            const p2 = cache.get('log-1');
            resolveFirst({ id: 'shared' });
            const [r1, r2] = await Promise.all([p1, p2]);
            expect(r1).toEqual({ id: 'shared' });
            expect(r2).toEqual({ id: 'shared' });
            // Fetcher called only once, not twice
            expect(mockFetcher).toHaveBeenCalledTimes(1);
        });
    });

    describe('putSync', () => {
        it('stores in memory immediately without awaiting IndexedDB', () => {
            cache.putSync('log-1', { id: 'sync' });
            expect(cache.peek('log-1')).toEqual({ id: 'sync' });
        });
    });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/renderer/cache/__tests__/DetailsCache.test.ts`
Expected: All 14 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/cache/DetailsCache.ts src/renderer/cache/__tests__/DetailsCache.test.ts
git commit -m "feat: add DetailsCache class with memory LRU + IndexedDB tiers"
```

---

### Task 3: Create useLogDetails hook

**Files:**
- Create: `src/renderer/cache/useLogDetails.ts`
- Create: `src/renderer/cache/__tests__/useLogDetails.test.tsx`

The hook provides a synchronous-first API: returns cached details instantly on LRU hit, triggers async fetch on miss, and re-renders only when the specific logId's status changes.

- [ ] **Step 1: Write failing tests**

Create `src/renderer/cache/__tests__/useLogDetails.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { useLogDetails } from '../useLogDetails';
import { DetailsCacheProvider } from '../DetailsCacheContext';
import { DetailsCache } from '../DetailsCache';

vi.mock('idb-keyval', () => ({
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
}));

const mockFetcher = vi.fn().mockResolvedValue(null);

function createWrapper() {
    const cache = new DetailsCache({ lruCapacity: 3, fetchDetails: mockFetcher });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <DetailsCacheProvider cache={cache}>{children}</DetailsCacheProvider>
    );
    return { Wrapper, cache };
}

describe('useLogDetails', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns idle status when logId is undefined', () => {
        const { Wrapper } = createWrapper();
        const { result } = renderHook(() => useLogDetails(undefined), { wrapper: Wrapper });
        expect(result.current.status).toBe('idle');
        expect(result.current.details).toBeNull();
    });

    it('returns loaded status on LRU hit', async () => {
        const { Wrapper, cache } = createWrapper();
        await cache.put('log-1', { id: 'cached' });
        const { result } = renderHook(() => useLogDetails('log-1'), { wrapper: Wrapper });
        expect(result.current.status).toBe('loaded');
        expect(result.current.details).toEqual({ id: 'cached' });
    });

    it('returns loading then loaded on cache miss with successful fetch', async () => {
        mockFetcher.mockResolvedValueOnce({ id: 'fetched' });
        const { Wrapper } = createWrapper();
        const { result } = renderHook(() => useLogDetails('log-1'), { wrapper: Wrapper });

        // Initial render — cache miss triggers async fetch
        expect(result.current.status).toBe('loading');

        await waitFor(() => {
            expect(result.current.status).toBe('loaded');
        });
        expect(result.current.details).toEqual({ id: 'fetched' });
    });

    it('returns error status when fetch fails', async () => {
        mockFetcher.mockRejectedValueOnce(new Error('network down'));
        const { Wrapper } = createWrapper();
        const { result } = renderHook(() => useLogDetails('log-1'), { wrapper: Wrapper });

        await waitFor(() => {
            expect(result.current.status).toBe('error');
        });
        expect(result.current.details).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/cache/__tests__/useLogDetails.test.tsx`
Expected: FAIL — `Cannot find module '../useLogDetails'`

- [ ] **Step 3: Implement useLogDetails hook**

Create `src/renderer/cache/useLogDetails.ts`:

```typescript
import { useState, useEffect, useRef, useContext } from 'react';
import { DetailsCacheContext } from './DetailsCacheContext';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

export function useLogDetails(logId: string | undefined): {
    details: any | null;
    status: Status;
} {
    const cache = useContext(DetailsCacheContext);
    const [state, setState] = useState<{ details: any | null; status: Status }>(() => {
        if (!logId || !cache) return { details: null, status: 'idle' };
        const mem = cache.peek(logId);
        if (mem !== undefined) return { details: mem, status: 'loaded' };
        return { details: null, status: 'loading' };
    });
    const activeLogIdRef = useRef(logId);

    useEffect(() => {
        activeLogIdRef.current = logId;

        if (!logId || !cache) {
            setState({ details: null, status: 'idle' });
            return;
        }

        // Synchronous check — may already be in LRU
        const mem = cache.peek(logId);
        if (mem !== undefined) {
            setState({ details: mem, status: 'loaded' });
            return;
        }

        // Async path
        setState({ details: null, status: 'loading' });
        let cancelled = false;

        cache.get(logId).then((details) => {
            if (cancelled || activeLogIdRef.current !== logId) return;
            if (details) {
                setState({ details, status: 'loaded' });
            } else {
                setState({ details: null, status: 'error' });
            }
        }).catch(() => {
            if (cancelled || activeLogIdRef.current !== logId) return;
            setState({ details: null, status: 'error' });
        });

        return () => { cancelled = true; };
    }, [logId, cache]);

    return state;
}
```

- [ ] **Step 4: Create DetailsCacheContext**

Create `src/renderer/cache/DetailsCacheContext.tsx`:

```typescript
import React, { createContext } from 'react';
import { DetailsCache } from './DetailsCache';

export const DetailsCacheContext = createContext<DetailsCache | null>(null);

export function DetailsCacheProvider({
    cache,
    children,
}: {
    cache: DetailsCache;
    children: React.ReactNode;
}) {
    return (
        <DetailsCacheContext.Provider value={cache}>
            {children}
        </DetailsCacheContext.Provider>
    );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/renderer/cache/__tests__/useLogDetails.test.tsx`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/cache/useLogDetails.ts src/renderer/cache/DetailsCacheContext.tsx src/renderer/cache/__tests__/useLogDetails.test.tsx
git commit -m "feat: add useLogDetails hook and DetailsCacheContext"
```

---

### Task 4: Wire DetailsCache into AppLayout

**Files:**
- Modify: `src/renderer/app/AppLayout.tsx`
- Modify: `src/renderer/App.tsx`

The cache singleton is created in `App.tsx` (which has access to `electronAPI`) and passed into the provider wrapping `AppLayout`.

- [ ] **Step 1: Create the cache instance in App.tsx and wrap AppLayout with the provider**

In `src/renderer/App.tsx`, add the import and cache creation near the top of the component (after hooks):

```typescript
import { DetailsCache } from './cache/DetailsCache';
import { DetailsCacheProvider } from './cache/DetailsCacheContext';
```

Create the cache singleton using `useRef` (so it's stable across renders). The fetcher calls `electronAPI.getLogDetails` — it needs to resolve a logId to a filePath+permalink, which we can look up from the logs ref:

```typescript
const detailsCacheRef = useRef<DetailsCache | null>(null);
if (!detailsCacheRef.current) {
    detailsCacheRef.current = new DetailsCache({
        lruCapacity: 5,
        fetchDetails: async (logId: string) => {
            const log = logsRef.current.find((l) => l.id === logId || l.filePath === logId);
            if (!log) return null;
            try {
                const result = await window.electronAPI.getLogDetails({
                    filePath: log.filePath,
                    permalink: log.permalink,
                });
                return result?.success ? result.details ?? null : null;
            } catch {
                return null;
            }
        },
    });
}
```

Then wrap the render output with the provider:

```tsx
<DetailsCacheProvider cache={detailsCacheRef.current}>
    {/* existing AppLayout / render content */}
</DetailsCacheProvider>
```

- [ ] **Step 2: Verify the app still builds and runs**

Run: `npm run validate`
Expected: No typecheck or lint errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: wire DetailsCache into App with context provider"
```

---

## Phase 2a: Migrate ExpandableLogCard

### Task 5: Migrate ExpandableLogCard to useLogDetails

**Files:**
- Modify: `src/renderer/ExpandableLogCard.tsx`

This is the proof-of-concept migration. The component currently reads `log.details` directly (line 38). We replace it with `useLogDetails(log.id)` and show a loading state during cache miss.

**Important:** During this phase, `ILogData.details` still exists and is still populated. The cache `put` is called when details arrive via the existing hydration path (write-through). This task adds a `useEffect` in `App.tsx` to write-through details into the cache whenever they appear on a log.

- [ ] **Step 1: Add write-through from existing hydration to cache**

In `src/renderer/App.tsx`, add an effect that populates the cache whenever a log's details are hydrated via the existing path. This keeps the cache warm during the transition period:

```typescript
// Write-through: when details arrive via existing hydration, populate cache
useEffect(() => {
    const cache = detailsCacheRef.current;
    if (!cache) return;
    for (const log of logsRef.current) {
        if (log.details && log.id) {
            // Only write if not already in LRU (avoid unnecessary work)
            if (!cache.peek(log.id)) {
                cache.putSync(log.id, log.details);
            }
        }
    }
}, [logs]);
```

- [ ] **Step 2: Modify ExpandableLogCard to use the hook**

In `src/renderer/ExpandableLogCard.tsx`, replace the direct details access:

Before (line 38):
```typescript
const details = log.details || {};
```

After:
```typescript
import { useLogDetails } from './cache/useLogDetails';

// Inside the component:
const { details: cachedDetails, status: detailsStatus } = useLogDetails(
    (isExpanded || screenshotMode || Boolean(screenshotSection)) ? log.id : undefined
);
const details = cachedDetails || log.details || {};
```

The fallback to `log.details` ensures the component works whether details come from the cache or the old state path. The `logId` is only passed when the card needs details (expanded/screenshot), so idle cards don't trigger fetches.

- [ ] **Step 3: Verify the app builds**

Run: `npm run validate`
Expected: No typecheck or lint errors

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `npm run test:unit`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ExpandableLogCard.tsx src/renderer/App.tsx
git commit -m "feat: migrate ExpandableLogCard to useLogDetails with write-through"
```

---

## Phase 2b: Migrate StatsView Inline Consumers

### Task 6: Migrate StatsView inline detail reads

**Files:**
- Modify: `src/renderer/StatsView.tsx`

Three useMemos in StatsView read `log.details` directly by iterating the logs array. These need to pull from the cache instead. Since these are inside useMemo (not hooks — hooks can't be called conditionally inside useMemo), we use the cache's synchronous `peek` method with a fallback to `log.details`.

The pattern: the cache is populated via write-through (Task 5), so `peek` will hit for any log whose details have been hydrated. This is a safe incremental step — the useMemos still work with `log.details` if the cache hasn't been populated yet.

- [ ] **Step 1: Import cache context in StatsView**

Add at the top of `src/renderer/StatsView.tsx`:

```typescript
import { useContext } from 'react';
import { DetailsCacheContext } from './cache/DetailsCacheContext';
```

Inside the component, access the cache:

```typescript
const detailsCache = useContext(DetailsCacheContext);
```

Create a helper function inside the component:

```typescript
const getDetails = (log: any): any => {
    if (detailsCache && log?.id) {
        const cached = detailsCache.peek(log.id);
        if (cached) return cached;
    }
    return log?.details || {};
};
```

- [ ] **Step 2: Find and migrate all `log.details` / `selectedLog?.details` references**

Run this to find all references (line numbers may shift during development):

```bash
grep -n 'log\?\.details\|selectedLog\?\.details' src/renderer/StatsView.tsx
```

There are 5 sites to migrate. For each, replace the details access with `getDetails(log)` or `getDetails(selectedLog)`:

1. **Spike skill drilldown** (~line 1443): `const details = selectedLog?.details;` → `const details = getDetails(selectedLog);`
2. **Incoming strike skill drilldown** (~line 1941): `const details = selectedLog?.details;` → `const details = getDetails(selectedLog);`
3. **Second spike-related drilldown** (~line 2027): `const details = selectedLog?.details;` → `const details = getDetails(selectedLog);`
4. **Incoming damage buckets inline** (~line 2771): `log?.details` → `getDetails(log)` within the `.map()` call
5. **Incoming damage buckets loop** (~line 2775): `const details = log?.details;` → `const details = getDetails(log);`

Verify no references remain:
```bash
grep -n 'log\?\.details\|selectedLog\?\.details' src/renderer/StatsView.tsx
```
Expected: No matches

- [ ] **Step 5: Verify the app builds and tests pass**

Run: `npm run validate && npm run test:unit`
Expected: No errors, all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "feat: migrate StatsView inline detail reads to DetailsCache"
```

---

## Phase 2c: Migrate Stats Worker Streaming

### Task 7: Migrate worker streaming loop to use DetailsCache

**Files:**
- Modify: `src/renderer/stats/hooks/useStatsAggregationWorker.ts`

This is the biggest memory consumer. The streaming loop currently reads `log.details` from the `logs` array passed in props, prunes it, and posts to the worker. We change it to pull details from the cache instead.

**Key constraint:** The streaming loop runs inside `requestIdleCallback` and posts messages synchronously. Since `cache.get()` is async, we need to restructure the step function to await the cache before posting. The idle callback pattern needs to become async-aware — each step fetches the details, then posts to the worker.

- [ ] **Step 1: Import cache context and modify the hook**

In `src/renderer/stats/hooks/useStatsAggregationWorker.ts`, add:

```typescript
import { useContext } from 'react';
import { DetailsCacheContext } from '../../cache/DetailsCacheContext';
```

Inside the hook:
```typescript
const detailsCache = useContext(DetailsCacheContext);
```

- [ ] **Step 2: Modify getPrunedLogForWorker to accept details as a parameter**

Change the function signature to not read `log.details` directly:

Before:
```typescript
const getPrunedLogForWorker = (log: any, index: number) => {
    // ... reads log.details internally via pruneLogForStats
```

After:
```typescript
const getPrunedLogForWorker = (log: any, details: any, index: number) => {
    const logWithDetails = details ? { ...log, details } : log;
    const cacheKey = String(log?.filePath || log?.id || `idx-${index}`);
    const detailsRef = details && typeof details === 'object' ? details : null;
    const cached = prunedLogCacheRef.current.get(cacheKey);
    if (cached) {
        if (detailsRef && cached.sourceDetails === detailsRef) {
            return cached.pruned;
        }
        if (!detailsRef && cached.sourceLog === logWithDetails) {
            return cached.pruned;
        }
    }
    const pruned = pruneLogForStats(logWithDetails);
    prunedLogCacheRef.current.set(cacheKey, {
        sourceLog: logWithDetails,
        sourceDetails: detailsRef,
        pruned
    });
    return pruned;
};
```

- [ ] **Step 3: Modify the streaming step to fetch from cache**

The step function currently runs synchronously inside `requestIdleCallback`. Since `cache.get()` is async, we pre-fetch details for the next chunk before entering the idle callback. The step itself uses `peek` (synchronous) with a pre-fetched guarantee:

```typescript
// Pre-fetch details for the next chunk before scheduling idle callback
const prefetchAndStep = async () => {
    if (cancelled || streamSessionRef.current !== streamSession || !workerRef.current) return;
    // Pre-fetch next batch of details into the LRU so peek() hits in step()
    const prefetchEnd = Math.min(index + 4, totalLogs);
    for (let i = index; i < prefetchEnd; i++) {
        const log = logs[i];
        const logId = log?.id || log?.filePath;
        if (detailsCache && logId && !detailsCache.peek(logId)) {
            try { await detailsCache.get(logId); } catch { /* fallback to log.details */ }
        }
    }
    scheduleStep();
};

const step = (deadline?: any) => {
    if (cancelled || streamSessionRef.current !== streamSession || !workerRef.current) return;
    const hasIdleBudget = Boolean(deadline && typeof deadline.timeRemaining === 'function');
    const remaining = hasIdleBudget ? Math.max(0, Number(deadline.timeRemaining() || 0)) : 0;
    const chunkSize = hasIdleBudget
        ? (remaining > 12 ? 4 : remaining > 7 ? 2 : 1)
        : 1;
    let processed = 0;
    while (processed < chunkSize && index < totalLogs) {
        const log = logs[index];
        const logId = log?.id || log?.filePath;
        // peek is synchronous — details were pre-fetched into LRU
        const details = (detailsCache && logId ? detailsCache.peek(logId) : null) || log?.details;
        workerRef.current.postMessage({
            type: 'log',
            token: activeToken,
            payload: getPrunedLogForWorker(log, details, index)
        });
        index += 1;
        processed += 1;
    }
    if (index < totalLogs) {
        publishProgress('streaming');
        prefetchAndStep(); // async pre-fetch, then schedule next idle callback
    } else {
        publishProgress('computing', true);
        workerRef.current.postMessage({ type: 'flush', token: activeToken });
    }
};
```

This preserves the synchronous step/idle-callback chunking model while pulling details from the cache.

- [ ] **Step 4: Modify the inline computation path (<=8 logs)**

When `shouldUseWorker` is false (fewer than 8 logs), `computeStatsAggregation` is called inline with the raw logs array. After Phase 2d removes `details` from state, these logs will have no details. Add a details-assembly step before inline computation:

```typescript
// In the inline path (shouldUseWorker === false):
const logsWithDetails = await Promise.all(
    logs.map(async (log) => {
        const logId = log?.id || log?.filePath;
        const details = (detailsCache && logId ? await detailsCache.get(logId) : null) || log?.details;
        return details ? { ...log, details } : log;
    })
);
const result = computeStatsAggregation({ logs: logsWithDetails, ... });
```

- [ ] **Step 4: Verify the app builds and tests pass**

Run: `npm run validate && npm run test:unit`
Expected: No errors, all tests pass

- [ ] **Step 5: Run stats regression tests**

Run: `npm run test:regression:stats`
Expected: All regression tests pass — stats output unchanged

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/hooks/useStatsAggregationWorker.ts
git commit -m "feat: migrate stats worker streaming to fetch details from DetailsCache"
```

---

## Phase 2d: Remove details from React State

### Task 8: Stop writing details into React state

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/app/hooks/useDetailsHydration.ts`
- Modify: `src/renderer/global.d.ts`

This is the breaking change phase. By now, all consumers read from the cache. We stop the hydration hook from writing details into React state and remove the field from the interface.

- [ ] **Step 1: Modify useDetailsHydration to write to cache instead of state**

In `src/renderer/app/hooks/useDetailsHydration.ts`, the key change is: after fetching details via IPC, write to the DetailsCache instead of merging into the logs state.

The hook needs access to the cache. Add it as a parameter:

```typescript
import { DetailsCache } from '../../cache/DetailsCache';

export function useDetailsHydration({
    viewRef,
    logsRef,
    setLogs,
    setLogsDeferred,
    setLogsForStats,
    detailsCache,    // NEW
}: {
    // ... existing params ...
    detailsCache: DetailsCache | null;
}) {
```

Then in the fetch logic (around line 90-115), instead of updating `log.details` in state:

Before:
```typescript
return { ...log, details: result.details, detailsLoading: false, ... };
```

After:
```typescript
// Write details to cache, not state
if (detailsCache && result.details && log.id) {
    detailsCache.putSync(log.id, result.details);
}
return { ...log, detailsLoading: false, detailsAvailable: true, ... };
// Note: details field NOT set on the log
```

- [ ] **Step 2: Remove write-through effect from App.tsx**

The write-through effect added in Task 5 is no longer needed — hydration now writes directly to the cache. Remove it.

- [ ] **Step 3: Remove `details` from ILogData**

In `src/renderer/global.d.ts`, remove lines 429-436 (the `details?:` field from `ILogData`).

- [ ] **Step 4: Migrate useStatsDataProgress.ts**

In `src/renderer/app/hooks/useStatsDataProgress.ts` (~line 39), the check `log.details || log.statsDetailsLoaded` is used to determine hydration progress. Replace `log.details` with the `detailsAvailable` flag which is already on ILogData:

Before: `log.details || log.statsDetailsLoaded`
After: `log.detailsAvailable || log.statsDetailsLoaded`

- [ ] **Step 5: Migrate useStatsUploads.ts**

In `src/renderer/stats/hooks/useStatsUploads.ts` (~line 79), the `buildReportMeta` function reads `log.details` to extract timestamps and commander data. This function runs during web report upload — it needs async cache access:

```typescript
// Add cache context to the hook
const detailsCache = useContext(DetailsCacheContext);

// In buildReportMeta, replace log.details with cache lookup:
const details = detailsCache ? await detailsCache.get(log.id) : null;
```

If `buildReportMeta` is currently synchronous, make it async and await at the call site.

- [ ] **Step 6: Migrate useDevDatasets.ts**

In `src/renderer/app/hooks/useDevDatasets.ts`, `log.details` is used in multiple places:
- Building snapshot cache keys (identity check for cache invalidation)
- Carrying details between dataset entries during save/load

For snapshot key building: replace `log.details` identity check with a hash or version counter that changes when details are updated in the cache.

For dataset save/load: dev datasets need to serialize details to JSON files. Add cache reads during save:

```typescript
// During dataset save, fetch details from cache for each log
const detailsForSave = await detailsCache.get(log.id);
const logWithDetails = detailsForSave ? { ...log, details: detailsForSave } : log;
```

During dataset load, the loaded details go into the cache:

```typescript
// During dataset load, populate cache with loaded details
if (loadedLog.details) {
    detailsCache.putSync(loadedLog.id, loadedLog.details);
}
```

- [ ] **Step 7: Fix any remaining TypeScript errors**

Run `npm run typecheck` and fix any remaining references to `log.details` found by the type checker. By this point, all known consumers are migrated.

- [ ] **Step 8: Run full validation**

Run: `npm run validate && npm run test:unit && npm run test:regression:stats`
Expected: All pass

- [ ] **Step 9: Commit**

```bash
git add -u
git commit -m "feat: remove details from ILogData, all consumers now use DetailsCache"
```

---

## Phase 3: Stats Dashboard Speedup

### Task 9: Pre-warm IndexedDB on upload completion

**Files:**
- Modify: `src/main/index.ts` or `src/main/handlers/uploadHandlers.ts`
- Modify: `src/renderer/App.tsx`

When a log finishes uploading and the main process has the pruned details, push them to the renderer via a new IPC event. The renderer writes them straight into IndexedDB (not React state), so by the time the user switches to stats view, all details are cached.

- [ ] **Step 1: Add IPC event for pre-warming in the main process**

In the main process upload completion handler (where `pruneDetailsForStats` is called after fetching EI JSON), add:

```typescript
// After pruning details and sending the upload-complete status:
if (prunedDetails && mainWindow?.webContents) {
    mainWindow.webContents.send('details-prewarm', {
        logId: logData.id,
        filePath: logData.filePath,
        details: prunedDetails,
    });
}
```

- [ ] **Step 2: Add IPC listener in the renderer to populate cache**

In `src/renderer/App.tsx`, add a listener:

```typescript
useEffect(() => {
    const cache = detailsCacheRef.current;
    if (!cache) return;
    const handler = (_event: any, payload: { logId: string; filePath: string; details: any }) => {
        if (payload.details && (payload.logId || payload.filePath)) {
            cache.putSync(payload.logId || payload.filePath, payload.details);
        }
    };
    window.electronAPI.onDetailsPrewarm?.(handler);
    return () => {
        window.electronAPI.offDetailsPrewarm?.(handler);
    };
}, []);
```

- [ ] **Step 3: Expose the IPC channel in preload**

In `src/preload/index.ts`, add:

```typescript
onDetailsPrewarm: (callback: (event: any, payload: any) => void) =>
    ipcRenderer.on('details-prewarm', callback),
offDetailsPrewarm: (callback: (event: any, payload: any) => void) =>
    ipcRenderer.removeListener('details-prewarm', callback),
```

Add the corresponding type signatures in `src/renderer/global.d.ts` for the `IElectronAPI` interface.

- [ ] **Step 4: Verify the flow works**

Run: `npm run validate && npm run test:unit`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat: pre-warm DetailsCache on upload completion via IPC push"
```

---

## Phase 4: Simplify Pruning

### Task 10: Collapse to single ingest pruner

**Files:**
- Modify: `src/main/detailsProcessing.ts`
- Delete: `src/renderer/stats/utils/pruneStatsLog.ts`
- Modify: `src/renderer/stats/hooks/useStatsAggregationWorker.ts` (remove pruneLogForStats calls)
- Modify: any files importing `pruneStatsLog`

- [ ] **Step 1: Simplify the main-process pruner**

In `src/main/detailsProcessing.ts`, replace the current `PLAYER_DENY` / `TOP_LEVEL_DENY` system with a single light ingest pruner:

```typescript
const INGEST_DENY_TOP = ['mechanics'];

const INGEST_DENY_PLAYER = [
    // Never consumed by any code path
    'targetConditionDamage1S',
    'damageModifiersTarget',
    'incomingDamageModifiersTarget',
    'deathRecap',
    'conditionDamage1S',
    'conditionDamageTaken1S',
    // Misc unused
    'consumables', 'weaponSets', 'weapons', 'guildID',
    // Buff volume variants (large, never consumed)
    'buffUptimesActive', 'buffVolumes', 'buffVolumesActive',
    'offGroupBuffVolumes', 'offGroupBuffVolumesActive',
    'groupBuffVolumes', 'groupBuffVolumesActive',
    'selfBuffVolumes', 'selfBuffVolumesActive',
    'offGroupBuffs', 'offGroupBuffsActive',
    // Time series (large, never consumed)
    'boonsStates', 'conditionsStates', 'healthPercents', 'barrierPercents',
];
```

Note: This is the same denylist as current, plus the newly confirmed unused fields. The pruner logic remains `omit` — no behavioral change, just consolidation.

- [ ] **Step 2: Update statsWorker.ts**

`src/renderer/workers/statsWorker.ts` imports `pruneLogForStats` and `isStatsPrunedLog` from the file we're about to delete. Update the worker to accept logs as-is (they're pre-pruned at ingest):

Before (~line 2):
```typescript
import { pruneLogForStats, isStatsPrunedLog } from '../stats/utils/pruneStatsLog';
```

Remove this import. At the usage site (~line 132):

Before:
```typescript
latestPayload.logs.push(isStatsPrunedLog(data.payload) ? data.payload : pruneLogForStats(data.payload));
```

After:
```typescript
latestPayload.logs.push(data.payload);
```

- [ ] **Step 3: Remove the renderer-side pruner**

Delete `src/renderer/stats/utils/pruneStatsLog.ts`.

In `src/renderer/stats/hooks/useStatsAggregationWorker.ts`, remove the `pruneLogForStats` import and call. The `getPrunedLogForWorker` function simplifies to just returning the log as-is.

- [ ] **Step 4: Remove `__statsPruned` / `isStatsPrunedLog` usage**

Search for all references and remove:

```bash
grep -rn "__statsPruned\|isStatsPrunedLog" src/
```

Remove each reference found.

- [ ] **Step 5: Update metrics-spec.md**

`src/shared/metrics-spec.md` references `pruneStatsLog.ts`. Update or remove that reference to reflect the new single-pruner architecture.

- [ ] **Step 6: Update the IndexedDB schema version**

In `src/renderer/cache/DetailsCache.ts`, bump `SCHEMA_VERSION` from `1` to `2`. This invalidates all IndexedDB entries cached with the old pruning, forcing a re-fetch with the new lighter pruning.

- [ ] **Step 7: Run full validation and all tests**

Run: `npm run validate && npm run test:unit && npm run test:regression:stats`
Expected: All pass

Run: `npm run audit:metrics && npm run audit:boons`
Expected: All audits pass (metric values unchanged since we only removed unused fields)

- [ ] **Step 8: Commit**

```bash
git add -u
git commit -m "refactor: collapse dual pruner into single light ingest pruner, retire pruneStatsLog"
```

---

## Verification Checklist

After all phases complete:

- [ ] `npm run validate` — typecheck + lint pass
- [ ] `npm run test:unit` — all unit tests pass
- [ ] `npm run test:regression:stats` — stats regression tests pass
- [ ] `npm run audit:metrics` — metric values match fixtures
- [ ] `npm run audit:boons` — boon values match fixtures
- [ ] Manual test: open app, upload 16+ logs, verify no OOM on dashboard
- [ ] Manual test: switch to stats view, verify stats load quickly
- [ ] Manual test: expand a log card after eviction, verify details load without error
- [ ] Manual test: restart app, switch to stats view, verify IndexedDB cache hits
