# Native History Panel Design

Replace the iframe-based History view with a native tabbed report browser that fetches data from GitHub via API and renders reports in-app using StatsView.

## Decisions

| Question | Decision |
|----------|----------|
| Scope | Report list + detail viewer (no rollup) |
| Navigation model | Sub-tabs within History view |
| List layout | Summary cards (2-column grid) |
| Detail actions | Read-only (no Discord/upload) |
| Delete support | Yes, multi-select with confirm dialog |
| Data architecture | GitHub API only (no direct HTTP fetch from Pages) |

## Component Architecture

```
FightReportHistoryView (container — manages tabs, index, detail cache)
├── HistoryTabBar
│   ├── "Reports" tab (permanent, always first)
│   └── ReportTab × N (closeable, max 5)
├── ReportListPanel (visible when "Reports" tab active)
│   ├── RepoDropdown (reused from current implementation)
│   ├── ReportCardGrid
│   │   └── ReportCard × N
│   └── DeleteConfirmDialog
└── ReportDetailPanel (visible when a report tab active)
    └── StatsView (embedded, read-only, precomputedStats)
```

### State (lives in FightReportHistoryView)

| Field | Type | Purpose |
|-------|------|---------|
| `tabs` | `Array<{ id: string; title: string; report: ReportPayload }>` | Open report tabs with cached data. `id` is always `report.meta.id`. |
| `activeTab` | `string \| 'list'` | Which tab is displayed |
| `indexEntries` | `ReportIndexEntry[]` | Report list from index.json |
| `selectedForDelete` | `Set<string>` | IDs selected for deletion |
| `deleteMode` | `boolean` | Whether multi-select delete mode is active |
| `indexLoading` / `indexError` | `boolean` / `string \| null` | Index fetch state |
| `detailLoading` | `string \| null` | ID of report currently being fetched |

## Data Flow

### Report List
1. On mount or repo change: IPC `get-github-reports` (existing handler) returns index entries
2. Render entries as summary cards in a 2-column grid
3. Repo switch: clear index, close all tabs, re-fetch

### Report Detail
1. User clicks a card: if already open in a tab, switch to it (no re-fetch)
2. Otherwise: IPC `get-github-report-detail` (new handler) fetches `reports/{id}/report.json`
3. On success: apply normalization (from `src/shared/reportNormalization.ts`), create new tab with parsed payload, switch to it
4. Render `StatsView` with `logs={[]}`, `precomputedStats={report.stats}`, `embedded`
5. On failure: show inline error banner in the list panel (e.g., "Failed to load report"). Do not create a tab.

### Delete
1. User clicks manage/trash button: enters delete mode
2. Cards show checkboxes; clicking toggles selection
3. Selection toolbar at bottom shows count + "Delete Selected" button
4. Confirm dialog warns deletion is permanent
5. On confirm: IPC `delete-github-reports` (existing handler)
6. On success: refresh index, close tabs for deleted reports, exit delete mode

## Report Card Content

Each card renders from `ReportIndexEntry` fields (no extra API call):

| Element | Source |
|---------|--------|
| Title | `entry.title` |
| Date range | `entry.dateLabel` or formatted from `entry.dateStart` / `entry.dateEnd` |
| Commander(s) | `entry.commanders[]` |
| Avg squad size | `entry.summary?.avgSquadSize` |
| Avg enemy size | `entry.summary?.avgEnemySize` |
| Map breakdown bar | `entry.summary?.mapSlices[]` (colored segments) |

Cards without summary data (older reports) show title/date/commanders only — summary stats section is hidden.

## Tab Bar

- Permanent "Reports" tab (leftmost, not closeable)
- Report tabs to the right, each with truncated title + close button
- Active tab: brand-color bottom border
- Max 5 open report tabs; opening a 6th closes the oldest
- Tab max-width with text-overflow ellipsis for long titles
- Closing a tab discards its cached report data

## IPC Changes

### New: `get-github-report-detail`

**Handler** in `src/main/handlers/githubHandlers.ts`:

```typescript
ipcMain.handle('get-github-report-detail', async (_event, payload: {
    reportId: string;
    owner?: string;
    repo?: string;
    branch?: string;
}) => { ... })
```

- Resolves owner/repo/branch/token from payload overrides or store defaults
- **Pages path resolution**: When using the default repo (no owner/repo overrides), use `getStoredPagesPath()` as normal. When using a favorite repo (owner/repo overrides provided), call `ensureGithubPages()` directly to resolve the pages path **without persisting it** to the store — `resolvePagesSource()` must not be called for favorites because it writes back to the store and would corrupt the default repo's stored path.
- Calls `getGithubFile(owner, repo, withPagesPath(pagesPath, 'reports/${reportId}/report.json'), branch, token)`
- Base64 decodes + JSON parses the content
- Returns `{ success: true, report: parsed }` or `{ success: false, error: string }`

Follows the same pattern as existing `get-github-reports` handler, with the pages path caveat above.

### Modified: `get-github-reports`

Add optional `{ owner?: string; repo?: string; branch?: string }` parameter to support fetching from favorite repos instead of only the default. The same pages path caveat applies: when owner/repo overrides are provided, do not use `getStoredPagesPath()` or `resolvePagesSource()`. The preload bridge method `getGithubReports` and its type in `global.d.ts` must also be updated to accept and forward these optional parameters.

### Modified: `delete-github-reports`

Add optional `{ owner?: string; repo?: string; branch?: string }` to the existing `{ ids: string[] }` payload, so deletes target the correct repo when viewing a favorite. Same pages path caveat for favorites. The preload bridge method and type must also be updated.

### Pages Path Resolution for Favorites

All three handlers share the same concern: `getStoredPagesPath()` reads from `store.get('githubPagesSourcePath')` which is the default repo's path, and `resolvePagesSource()` writes back to the store. For favorite repos, instead call `ensureGithubPages()` directly and use the returned path transiently. A shared helper (e.g., `resolveEffectivePagesPath(owner, repo, branch, token)`) can encapsulate this logic.

### Preload Additions

```typescript
// src/preload/index.ts — new method
getGithubReportDetail: (payload: { reportId: string; owner?: string; repo?: string; branch?: string }) =>
    ipcRenderer.invoke('get-github-report-detail', payload)

// Updated signatures for existing methods:
getGithubReports: (payload?: { owner?: string; repo?: string; branch?: string }) =>
    ipcRenderer.invoke('get-github-reports', payload)
deleteGithubReports: (payload: { ids: string[]; owner?: string; repo?: string; branch?: string }) =>
    ipcRenderer.invoke('delete-github-reports', payload)
```

Plus corresponding type updates in `src/renderer/global.d.ts` for `window.electronAPI`. Existing callers (e.g., `SettingsView.tsx`) continue to work without changes since all new parameters are optional.

### Repo Option → IPC Bridging

The existing `HistoryRepoOption` type stores `key` as `"owner/repo"`. The container must parse `owner` and `repo` from this key using the existing `parseRepoFullName()` utility before passing to IPC calls. The `RepoDropdown` component itself is reused unchanged.

## Shared Types

`ReportIndexEntry` and `ReportPayload` are currently defined only in `src/web/reportApp.tsx`. They need to be extracted to a shared location so both the web report and the renderer can import them.

**Extract to `src/shared/reportTypes.ts`:**

```typescript
export interface ReportMeta {
    id: string;
    title: string;
    commanders: string[];
    dateStart: string;
    dateEnd: string;
    dateLabel: string;
    generatedAt: string;
    appVersion?: string;
    trimmedSections?: string[];
}

export interface ReportPayload {
    meta: ReportMeta;
    stats: any;
}

export interface ReportIndexEntry {
    id: string;
    title: string;
    commanders: string[];
    dateStart: string;
    dateEnd: string;
    dateLabel: string;
    url: string;
    summary?: {
        borderlandsPct?: number | null;
        mapSlices?: Array<{ name: string; value: number; color: string }>;
        avgSquadSize?: number | null;
        avgEnemySize?: number | null;
    };
}
```

Both `src/web/reportApp.tsx` and `src/renderer/FightReportHistoryView.tsx` import from this shared file. The web report's local type definitions are replaced with imports.

## Report Data Normalization

The web report viewer applies two normalization passes to fetched report data before rendering (in `src/web/reportApp.tsx`):
- `normalizeCommanderDistance` — zeros out closest-to-tag values for commanders
- `normalizeTopDownContribution` — re-sorts and reconciles down contribution leaderboard

These handle legacy report formats. The same normalization must be applied when loading report detail in the History view. Extract these functions to `src/shared/reportNormalization.ts` so both the web viewer and the renderer can import them.

## Existing Code Reused

| What | Where |
|------|-------|
| `StatsView` with `precomputedStats` + `embedded` | Already used by web report viewer |
| `get-github-reports` IPC handler | Existing, fetches index.json |
| `delete-github-reports` IPC handler | Existing, removes reports from repo |
| `getGithubFile()` | Existing utility for GitHub Contents API |
| `RepoDropdown` component | Existing in FightReportHistoryView |
| `buildRepoOptions()` / `resolveReportsIndexUrl()` | Existing utility functions |
| `resolvePagesSource()` / `getStoredPagesPath()` / `withPagesPath()` | Existing in githubHandlers |

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/FightReportHistoryView.tsx` | Rewrite: iframe replaced with tabbed container, card grid, delete flow |
| `src/main/handlers/githubHandlers.ts` | Add `get-github-report-detail` handler; extend `get-github-reports` with optional owner/repo |
| `src/preload/index.ts` | Add `getGithubReportDetail` bridge method |
| `src/renderer/global.d.ts` | Update `electronAPI` types for new + modified IPC methods |
| `src/shared/reportTypes.ts` | **New**: shared `ReportMeta`, `ReportPayload`, `ReportIndexEntry` types |
| `src/shared/reportNormalization.ts` | **New**: extracted normalization functions from web report |
| `src/web/reportApp.tsx` | Replace local type definitions and normalization functions with imports from shared |

## Not In Scope

- **Rollup view**: Cross-report aggregation (would require fetching all report JSONs — heavy on API)
- **Disk caching**: Report payloads cached in memory only; could add persistent cache later
- **Discord sharing from history**: Detail view is read-only
- **Re-upload / update existing report**: Not needed for a viewer
- **Offline support**: Requires GitHub API access; no offline fallback in this iteration
- **Search/filter**: No search bar for filtering the report list in this iteration (could add later)
