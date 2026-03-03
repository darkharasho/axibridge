# Refactoring Opportunities

Review conducted 2026-03-01. Ranked by impact.

---

## High Impact

### 1. Modularize `src/main/index.ts` (~4871 lines)

The entire Electron main process lives in one file: app lifecycle, console logging, electron-store persistence, 50+ IPC handlers, GitHub OAuth, upload retry queue, DPS report cache, dev dataset management, and image fetching.

**Proposed split:**

| New file | Responsibility | Key exports |
|---|---|---|
| `src/main/uploadRetryQueue.ts` | Retry queue types, pure logic, store I/O | `inferUploadRetryFailureCategory`, `trimUploadRetryQueue`, `loadUploadRetryQueue`, `markUploadRetryFailure` |
| `src/main/detailsProcessing.ts` | Pure EI JSON processing, pruning, summaries | `pruneDetailsForStats`, `buildDashboardSummaryFromDetails`, `resolveTimestampSeconds`, `buildManifestEntry` |
| `src/main/dpsReportCache.ts` | Cache index CRUD, TTL expiry | `loadDpsReportCacheEntry`, `saveDpsReportCacheEntry`, `clearDpsReportCache` |
| `src/main/devDatasets.ts` | Dev dataset I/O, integrity checks | `buildDatasetIntegrity`, `validateDatasetIntegrity`, `resolveOrderedDatasetLogPaths` |
| `src/main/imageFetcher.ts` | HTTPS image download with redirect + size limit | `fetchImageBuffer` |
| `src/main/consoleLogger.ts` | Console override, history, renderer forwarding | `setupConsoleLogger`, `formatLogArg` |
| `src/main/handlers/` | IPC handler registration grouped by domain | settings, upload, github, datasets, cache |

**Design constraint:** store-dependent functions should accept a minimal `StoreAdapter` interface (see `uploadRetryQueue.ts`) so they can be tested without Electron.

**Status:** Complete. All 7 logic modules extracted (`uploadRetryQueue.ts`, `detailsProcessing.ts`, `versionUtils.ts`, `imageFetcher.ts`, `consoleLogger.ts`, `dpsReportCache.ts`, `devDatasets.ts`) and all 51 IPC handlers moved to `src/main/handlers/` (7 files: appHandlers, datasetHandlers, discordHandlers, fileHandlers, githubHandlers, settingsHandlers, uploadHandlers). `index.ts` reduced from ~4871 → ~1093 lines.

---

### 2. Decompose `src/renderer/stats/computeStatsAggregation.ts` (~4734 lines → ~627 lines)

A single monolithic function handles player aggregation, damage, conditions, boons, skill breakdowns, and fight diff mode — with 3–4 levels of nested loops and 15+ helpers defined inline.

**Status:** Complete. Eleven standalone modules extracted:
- `computeSkillUsageData.ts` — skill usage aggregation
- `computeSpikeDamageData.ts` — outgoing spike damage
- `computeIncomingStrikeDamageData.ts` — incoming strike damage by enemy class
- `computeBoonTimeline.ts` — boon generation timeline
- `computeBoonUptimeTimeline.ts` — boon uptime timeline
- `computeCommanderStats.ts` — per-commander statistics
- `computeTimelineAndMapData.ts` — fight sorting, map data, timeline, boon tables
- `computeFightDiffMode.ts` — per-fight target focus and squad metrics comparison
- `computeSpecialTables.ts` — special buff tables and player skill breakdowns
- `computePlayerAggregation.ts` — main per-log/per-player accumulation loop, all types (`PlayerStats`, `DamageMitigationRow`, etc.), and helpers (`getFightDownsDeaths`, `getFightOutcome`, `resolveProfessionLabel`)
- `computeFightBreakdown.ts` — fightBreakdown construction and its helpers (`resolvePermalink`, `resolveFightDurationLabel`, `resolveFightOutcomeForDisplay`)

`computeStatsAggregation.ts` reduced from ~4734 → 627 lines; serves as a pure coordinator calling extracted modules.

---

### 3. Extract shared hooks from section components (`src/renderer/stats/sections/`)

13+ section files (OffenseSection, DefenseSection, SupportSection, …) independently duplicate:
- `[sortState, setSortState]` + toggle logic
- Column / player selection state
- Search filtering
- `Array.from(new Map(…))` deduplication pattern

A `useMetricSectionState.ts` hook eliminates ~2000 lines of duplication.

**Status:** Hook used in 7 sections: OffenseSection, DefenseSection, SupportSection, HealingSection, DamageMitigationSection, BoonOutputSection, SpecialBuffsSection. `filteredBoonTables` and `filteredSpecialTables` props removed from StatsView.tsx (now computed inside sections). Remaining candidates (ConditionsSection, ApmSection, PlayerBreakdownSection) have different enough sort/column patterns that partial hook usage has minimal benefit.

---

### 4. Split `src/renderer/App.tsx` (~2015 lines → ~1138 lines)

Root component manages all log state, settings, upload state, navigation, dashboard summary caching, and all render logic.

**Status:** Complete. Six hooks extracted to `src/renderer/app/hooks/`:
- `useSettings.ts` — settings load, persistence, theme body-class effect, all setting state/handlers
- `useUploadRetryQueue.ts` — retry queue state, IPC listener, retry/resume handlers
- `useAppNavigation.ts` — view state, modal open/close, webhook dropdown, scroll/resize tracking, navigation handlers
- `useLogQueue.ts` — batched log update queue (`setLogsDeferred`, `queueLogUpdate`, `normalizeIncomingStatus`, flush timers)
- `useDetailsHydration.ts` — log details fetching, stats batch hydration, `scheduleDetailsHydration`, retry tracking
- `useUploadListeners.ts` — all IPC listeners (`onUploadStatus`, `onUploadComplete`, `onRequestScreenshot`) and full screenshot capture chain; `dataUrlToUint8Array` moved here

App.tsx reduced from ~2015 → ~1138 lines (−877 lines).

---

### 5. Reduce prop drilling in `src/renderer/StatsView.tsx` (~4543 lines)

~40+ `useState` calls for search terms, active metrics, view modes, and sort state. A `useStatsViewState` hook + React Context would eliminate the drilling.

**Status:** Complete. `StatsSharedContext` created at `src/renderer/stats/StatsViewContext.tsx` with 12 shared values (stats, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, isSectionVisible, isFirstVisibleSection, sectionClass, sidebarListClass, formatWithCommas, renderProfessionIcon, roundCountStats). All 27 section components updated to consume context. Metrics constants (OFFENSE_METRICS, etc.) now imported directly in section files. ~336 redundant prop passings removed from StatsView.tsx JSX.

---

## Medium Impact

### 6. Remove passthrough wrappers in `src/shared/dashboardMetrics.ts`

Functions like `getPlayerDownContribution()` are single-line wrappers around `combatMetrics.ts` with no added semantics.

**Status:** Complete. 6 re-export aliases removed from `dashboardMetrics.ts`. Call sites (`computeStatsAggregation.ts`, `computeFightDiffMode.ts`, `discord.ts`, `ExpandableLogCard.tsx`) now import directly from `combatMetrics`.

### 7. Extract magic numbers to `src/shared/constants.ts`

`1e12` (timestamp threshold), `10 * 1024 * 1024` (max image bytes), stability boon ID `1122`, etc. are scattered across files.

**Status:** Complete. `src/shared/constants.ts` created with `TIMESTAMP_MS_THRESHOLD` (1e12), `STABILITY_BOON_ID` (1122), and `BULK_PROCESS_CONCURRENCY` (3). Replaced in `combatMetrics.ts`, `timestampUtils.ts`, `detailsProcessing.ts`, `discord.ts`, `ExpandableLogCard.tsx`, `uploadHandlers.ts`. Dead-code duplicate in `index.ts` removed.

### 8. Add error boundaries around stats aggregation in `StatsView.tsx`

No fallback UI if the worker fails or log data is malformed.

**Status:** Complete. `src/renderer/stats/StatsErrorBoundary.tsx` created (class-based, shows error message + retry button). `StatsView` wrapped in `AppLayout.tsx`.

---

## Low Impact / Quick Wins

- **`src/shared/boonGeneration.ts`**: Repeated `category === 'selfBuffs' ? 1 : …` ternary chain → lookup map.
- **`src/shared/conditionsMetrics.ts`**: `NON_DAMAGING_CONDITIONS` partially duplicated in `statsMetrics.ts` — consolidate.
- **Dead props in sections**: Several section components receive props they don't use; some internal state is never read.

---

## Recommended Order

1. `src/main/` modularization (already started) — highest isolated testability
2. Shared section hooks — high duplication, contained scope
3. `computeStatsAggregation.ts` decomposition — most complex, but highest long-term payoff
