# Native History Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the iframe-based History view with a native tabbed report browser that fetches data via the GitHub API and renders reports in-app using StatsView.

**Architecture:** New shared types and normalization functions extracted from the web report viewer, one new IPC handler (`get-github-report-detail`) and two modified handlers with favorite-repo support, a rewritten `FightReportHistoryView` with sub-tabs containing a card grid list and embedded StatsView detail panels.

**Tech Stack:** React, TypeScript, Electron IPC, GitHub REST API (via existing `githubApiRequest` utility)

**Spec:** `docs/superpowers/specs/2026-03-24-native-history-panel-design.md`

---

## File Structure

| File | Responsibility | Status |
|------|---------------|--------|
| `src/shared/reportTypes.ts` | Shared `ReportMeta`, `ReportPayload`, `ReportIndexEntry` types | **New** |
| `src/shared/reportNormalization.ts` | `normalizeCommanderDistance`, `normalizeTopDownContribution` functions | **New** |
| `src/web/reportApp.tsx` | Replace local type defs + normalization with imports from shared | Modify |
| `src/main/handlers/githubHandlers.ts` | Add `get-github-report-detail`, modify `get-github-reports` + `delete-github-reports` for favorite repos, add `resolveEffectivePagesPath` helper | Modify |
| `src/preload/index.ts` | Add `getGithubReportDetail`, update `getGithubReports` + `deleteGithubReports` signatures | Modify |
| `src/renderer/global.d.ts` | Add/update `electronAPI` types for the three IPC methods | Modify |
| `src/renderer/FightReportHistoryView.tsx` | Full rewrite: tabbed container, card grid, detail panels, delete flow | Rewrite |

---

## Task 1: Extract Shared Types

**Files:**
- Create: `src/shared/reportTypes.ts`
- Modify: `src/web/reportApp.tsx:54-84`

- [ ] **Step 1: Create the shared types file**

Create `src/shared/reportTypes.ts` with the three interfaces extracted from `src/web/reportApp.tsx` (lines 54-84):

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

Note: `ReportPayload.stats` is intentionally `any` — legacy report format variance makes a strict type impractical.

- [ ] **Step 2: Update web report to use shared types**

In `src/web/reportApp.tsx`:
- Add import: `import type { ReportMeta, ReportPayload, ReportIndexEntry } from '../shared/reportTypes';`
- Remove the local `ReportMeta` interface (lines 54-63)
- Remove the local `ReportPayload` interface (lines 65-68)
- Remove the local `ReportIndexEntry` interface (lines 70-84)

- [ ] **Step 3: Verify no regressions**

Run: `npx tsc --noEmit`
Expected: No type errors. The web report's existing code should work identically with the imported types.

- [ ] **Step 4: Commit**

```bash
git add src/shared/reportTypes.ts src/web/reportApp.tsx
git commit -m "refactor: extract shared report types to src/shared/reportTypes.ts"
```

---

## Task 2: Extract Normalization Functions

**Files:**
- Create: `src/shared/reportNormalization.ts`
- Modify: `src/web/reportApp.tsx:825-863`

- [ ] **Step 1: Create the normalization module**

Create `src/shared/reportNormalization.ts`. Extract `normalizeCommanderDistance` (lines 825-841 of `reportApp.tsx`) and `normalizeTopDownContribution` (lines 843-863). These are currently defined as closures inside a `useEffect` — extract them as standalone exported functions:

```typescript
import type { ReportPayload } from './reportTypes';

/**
 * Zero out closest-to-tag values for commanders (they are always at tag distance 0).
 */
export const normalizeCommanderDistance = (payload: ReportPayload): ReportPayload => {
    const commanders = new Set((payload?.meta?.commanders || []).map((name) => String(name)));
    if (commanders.size === 0) return payload;
    const stats: any = payload.stats;
    if (stats?.leaderboards?.closestToTag) {
        stats.leaderboards.closestToTag = stats.leaderboards.closestToTag.map((entry: any) => {
            if (commanders.has(String(entry?.account))) {
                return { ...entry, value: 0 };
            }
            return entry;
        });
    }
    if (stats?.closestToTag?.player && commanders.has(String(stats.closestToTag.player))) {
        stats.closestToTag = { ...stats.closestToTag, value: 0 };
    }
    return payload;
};

/**
 * Re-sort and reconcile down contribution leaderboard for legacy reports.
 */
export const normalizeTopDownContribution = (payload: ReportPayload): ReportPayload => {
    const stats: any = payload?.stats;
    if (!stats || typeof stats !== 'object') return payload;
    const rows = Array.isArray(stats?.leaderboards?.downContrib) ? stats.leaderboards.downContrib : [];
    if (!rows.length) return payload;
    const sorted = rows
        .map((row: any) => ({ ...row, value: Number(row?.value ?? 0) }))
        .filter((row: any) => Number.isFinite(row.value))
        .sort((a: any, b: any) => (b.value - a.value) || String(a?.account || '').localeCompare(String(b?.account || '')));
    const top = sorted[0];
    if (!top) return payload;
    stats.maxDownContrib = {
        ...(stats.maxDownContrib || {}),
        value: Number(top.value || 0),
        player: String(top.account || stats.maxDownContrib?.player || '-'),
        count: Number(top.count || stats.maxDownContrib?.count || 0),
        profession: String(top.profession || stats.maxDownContrib?.profession || 'Unknown'),
        professionList: Array.isArray(top.professionList) ? top.professionList : (stats.maxDownContrib?.professionList || [])
    };
    return payload;
};

/**
 * Apply all normalization passes to a report payload.
 */
export const normalizeReportPayload = (payload: ReportPayload): ReportPayload => {
    return normalizeTopDownContribution(normalizeCommanderDistance(payload));
};
```

- [ ] **Step 2: Update web report to use shared normalization**

In `src/web/reportApp.tsx`:
- Add import: `import { normalizeCommanderDistance, normalizeTopDownContribution } from '../shared/reportNormalization';`
- In the `useEffect` starting around line 813, remove the local `normalizeCommanderDistance` function definition (lines 825-841)
- Remove the local `normalizeTopDownContribution` function definition (lines 843-863)
- The call site at line 899 (`const normalized = normalizeTopDownContribution(normalizeCommanderDistance(data));`) stays unchanged — it now uses the imported functions

- [ ] **Step 3: Verify no regressions**

Run: `npx tsc --noEmit`
Expected: No type errors.

Run: `npm run test:unit`
Expected: All tests pass. The normalization logic is identical.

- [ ] **Step 4: Commit**

```bash
git add src/shared/reportNormalization.ts src/web/reportApp.tsx
git commit -m "refactor: extract report normalization to src/shared/reportNormalization.ts"
```

---

## Task 3: IPC — Add `resolveEffectivePagesPath` Helper

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts` (inside `registerGithubHandlers`, near line 725)

- [ ] **Step 1: Add the helper function**

Inside `registerGithubHandlers()`, after the existing `resolvePagesSource` definition (line 732), add a new helper that encapsulates the pages path resolution logic for both default and favorite repos:

```typescript
/**
 * Resolve the effective pages path. For the default repo (no overrides),
 * uses the stored pages path and falls back to resolvePagesSource which
 * persists the result. For favorite repos (overrides provided), calls
 * ensureGithubPages directly WITHOUT persisting to avoid corrupting the
 * default repo's stored path.
 */
const resolveEffectivePagesPath = async (
    effectiveOwner: string,
    effectiveRepo: string,
    effectiveBranch: string,
    token: string,
    isOverride: boolean
): Promise<string> => {
    if (!isOverride) {
        const stored = getStoredPagesPath();
        if (stored) return stored;
        try {
            const resolved = await resolvePagesSource(effectiveOwner, effectiveRepo, effectiveBranch, token);
            return resolved.pagesPath;
        } catch {
            return '';
        }
    }
    // Favorite repo: resolve transiently, never persist
    try {
        const pagesInfo = await ensureGithubPages(effectiveOwner, effectiveRepo, effectiveBranch, token);
        return normalizePagesPath(pagesInfo?.source?.path);
    } catch {
        return '';
    }
};
```

Note: `normalizePagesPath` and `ensureGithubPages` are already module-level functions in `githubHandlers.ts` (lines 348 and 353), so they're accessible here.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/handlers/githubHandlers.ts
git commit -m "feat(github): add resolveEffectivePagesPath helper for favorite repos"
```

---

## Task 4: IPC — Modify `get-github-reports` for Favorites

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts:760-793`
- Modify: `src/preload/index.ts:112`
- Modify: `src/renderer/global.d.ts:361`

- [ ] **Step 1: Update the handler signature and body**

In `src/main/handlers/githubHandlers.ts`, change the `get-github-reports` handler (line 760) from:

```typescript
ipcMain.handle('get-github-reports', async () => {
```

to:

```typescript
ipcMain.handle('get-github-reports', async (_event, payload?: { owner?: string; repo?: string; branch?: string }) => {
```

Then update the body to use payload overrides when provided:

```typescript
const token = store.get('githubToken') as string | undefined;
const isOverride = !!(payload?.owner && payload?.repo);
const owner = (isOverride ? payload!.owner! : store.get('githubRepoOwner') as string | undefined);
const repo = (isOverride ? payload!.repo! : store.get('githubRepoName') as string | undefined);
const branch = payload?.branch || (store.get('githubBranch') as string | undefined) || 'main';
```

Replace the pages path resolution block (lines 772-780) with:

```typescript
const pagesPath = await resolveEffectivePagesPath(owner!, repo!, branch, token!, isOverride);
```

The rest of the handler (lines 781-792) stays the same.

- [ ] **Step 2: Update preload bridge**

In `src/preload/index.ts`, change line 112 from:

```typescript
getGithubReports: () => ipcRenderer.invoke('get-github-reports'),
```

to:

```typescript
getGithubReports: (payload?: { owner?: string; repo?: string; branch?: string }) => ipcRenderer.invoke('get-github-reports', payload),
```

- [ ] **Step 3: Update type definition**

In `src/renderer/global.d.ts`, change line 361 from:

```typescript
getGithubReports: () => Promise<{ success: boolean; reports?: any[]; error?: string }>;
```

to:

```typescript
getGithubReports: (payload?: { owner?: string; repo?: string; branch?: string }) => Promise<{ success: boolean; reports?: any[]; error?: string }>;
```

- [ ] **Step 4: Verify backward compatibility**

Run: `npx tsc --noEmit`
Expected: No errors. `SettingsView.tsx` calls `getGithubReports()` with no args (line 858), which still works since the param is optional.

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/githubHandlers.ts src/preload/index.ts src/renderer/global.d.ts
git commit -m "feat(github): add owner/repo/branch overrides to get-github-reports"
```

---

## Task 5: IPC — Modify `delete-github-reports` for Favorites

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts:795`
- Modify: `src/preload/index.ts:113`
- Modify: `src/renderer/global.d.ts:362`

- [ ] **Step 1: Update the handler signature and body**

In `src/main/handlers/githubHandlers.ts`, change the `delete-github-reports` handler (line 795) from:

```typescript
ipcMain.handle('delete-github-reports', async (_event, payload: { ids: string[] }) => {
```

to:

```typescript
ipcMain.handle('delete-github-reports', async (_event, payload: { ids: string[]; owner?: string; repo?: string; branch?: string }) => {
```

Update the body to use overrides:

```typescript
const token = store.get('githubToken') as string | undefined;
const isOverride = !!(payload?.owner && payload?.repo);
const owner = (isOverride ? payload.owner! : store.get('githubRepoOwner') as string | undefined);
const repo = (isOverride ? payload.repo! : store.get('githubRepoName') as string | undefined);
const branch = payload?.branch || (store.get('githubBranch') as string | undefined) || 'main';
```

Replace the pages path resolution block (lines 811-819) with:

```typescript
const pagesPath = await resolveEffectivePagesPath(owner!, repo!, branch, token!, isOverride);
```

- [ ] **Step 2: Update preload bridge**

In `src/preload/index.ts`, change line 113 from:

```typescript
deleteGithubReports: (payload: { ids: string[] }) => ipcRenderer.invoke('delete-github-reports', payload),
```

to:

```typescript
deleteGithubReports: (payload: { ids: string[]; owner?: string; repo?: string; branch?: string }) => ipcRenderer.invoke('delete-github-reports', payload),
```

- [ ] **Step 3: Update type definition**

In `src/renderer/global.d.ts`, change line 362 from:

```typescript
deleteGithubReports: (payload: { ids: string[] }) => Promise<{ success: boolean; removed?: string[]; error?: string }>;
```

to:

```typescript
deleteGithubReports: (payload: { ids: string[]; owner?: string; repo?: string; branch?: string }) => Promise<{ success: boolean; removed?: string[]; error?: string }>;
```

- [ ] **Step 4: Verify backward compatibility**

Run: `npx tsc --noEmit`
Expected: No errors. `SettingsView.tsx` calls `deleteGithubReports({ ids })` (line 892) which still works since the new fields are optional.

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/githubHandlers.ts src/preload/index.ts src/renderer/global.d.ts
git commit -m "feat(github): add owner/repo/branch overrides to delete-github-reports"
```

---

## Task 6: IPC — Add `get-github-report-detail` Handler

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts` (after `get-github-reports` handler, ~line 793)
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/global.d.ts`

- [ ] **Step 1: Add the handler**

In `src/main/handlers/githubHandlers.ts`, after the `get-github-reports` handler, add:

```typescript
ipcMain.handle('get-github-report-detail', async (_event, payload: {
    reportId: string;
    owner?: string;
    repo?: string;
    branch?: string;
}) => {
    try {
        const token = store.get('githubToken') as string | undefined;
        const reportId = payload?.reportId;
        if (!token) {
            return { success: false, error: 'GitHub not connected.' };
        }
        if (!reportId) {
            return { success: false, error: 'No report ID provided.' };
        }
        const isOverride = !!(payload?.owner && payload?.repo);
        const owner = isOverride ? payload.owner! : (store.get('githubRepoOwner') as string | undefined);
        const repo = isOverride ? payload.repo! : (store.get('githubRepoName') as string | undefined);
        const branch = payload?.branch || (store.get('githubBranch') as string | undefined) || 'main';
        if (!owner || !repo) {
            return { success: false, error: 'Repository not configured.' };
        }
        const pagesPath = await resolveEffectivePagesPath(owner, repo, branch, token, isOverride);
        const filePath = withPagesPath(pagesPath, `reports/${reportId}/report.json`);
        const file = await getGithubFile(owner, repo, filePath, branch, token);
        if (!file?.content) {
            return { success: false, error: 'Report not found.' };
        }
        const decoded = Buffer.from(file.content, 'base64').toString('utf8');
        const report = JSON.parse(decoded);
        return { success: true, report };
    } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to load report.' };
    }
});
```

- [ ] **Step 2: Add preload bridge method**

In `src/preload/index.ts`, add after the `deleteGithubReports` line (line 113):

```typescript
getGithubReportDetail: (payload: { reportId: string; owner?: string; repo?: string; branch?: string }) => ipcRenderer.invoke('get-github-report-detail', payload),
```

- [ ] **Step 3: Add type definition**

In `src/renderer/global.d.ts`, add after the `deleteGithubReports` type (line 362):

```typescript
getGithubReportDetail: (payload: { reportId: string; owner?: string; repo?: string; branch?: string }) => Promise<{ success: boolean; report?: any; error?: string }>;
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/githubHandlers.ts src/preload/index.ts src/renderer/global.d.ts
git commit -m "feat(github): add get-github-report-detail IPC handler"
```

---

## Task 7: Rewrite FightReportHistoryView — Scaffolding & Tab Bar

**Files:**
- Rewrite: `src/renderer/FightReportHistoryView.tsx`

This task sets up the component shell with tab state management. The `RepoDropdown`, `buildRepoOptions`, `parseRepoFullName`, and `resolveReportsIndexUrl` helper functions/components from the current file are preserved as-is. The iframe is removed.

- [ ] **Step 1: Rewrite the component with tab scaffolding**

Rewrite `src/renderer/FightReportHistoryView.tsx`. Preserve the existing `HistoryRepoOption` type, `resolveReportsIndexUrl`, `parseRepoFullName`, `buildRepoOptions`, and `RepoDropdown` — they are reused unchanged.

Replace the `FightReportHistoryView` component with a new implementation that has:

**State:**
```typescript
import { useCallback } from 'react'; // add to existing React imports
import type { ReportIndexEntry, ReportPayload } from '../shared/reportTypes';

type HistoryTab = { id: string; title: string; report: ReportPayload };

// Inside the component:
const [repoOptions, setRepoOptions] = useState<HistoryRepoOption[]>([]);
const [selectedRepoKey, setSelectedRepoKey] = useState<string>('');
const [error, setError] = useState<string | null>(null);
const [indexEntries, setIndexEntries] = useState<ReportIndexEntry[]>([]);
const [indexLoading, setIndexLoading] = useState(false);
const [tabs, setTabs] = useState<HistoryTab[]>([]);
const [activeTab, setActiveTab] = useState<string>('list');
const [detailLoading, setDetailLoading] = useState<string | null>(null);
const [detailError, setDetailError] = useState<string | null>(null);
const [deleteMode, setDeleteMode] = useState(false);
const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
const [deleteLoading, setDeleteLoading] = useState(false);

const MAX_OPEN_TABS = 5;
```

**Tab bar rendering** (inside the component return):
```tsx
<div className="flex items-center gap-0 border-b" style={{ borderColor: 'var(--border-default)' }}>
    <button
        type="button"
        onClick={() => setActiveTab('list')}
        className="px-4 py-2 text-xs"
        style={{
            color: activeTab === 'list' ? 'var(--brand-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'list' ? '2px solid var(--brand-primary)' : '2px solid transparent'
        }}
    >
        Reports
    </button>
    {tabs.map((tab) => (
        <div key={tab.id} className="flex items-center max-w-[180px]">
            <button
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="px-3 py-2 text-xs truncate"
                style={{
                    color: activeTab === tab.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
                    borderBottom: activeTab === tab.id ? '2px solid var(--brand-primary)' : '2px solid transparent'
                }}
            >
                {tab.title}
            </button>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="px-1 text-[10px] opacity-50 hover:opacity-100"
                style={{ color: 'var(--text-secondary)' }}
            >
                ✕
            </button>
        </div>
    ))}
</div>
```

**Tab management functions:**
```typescript
const closeTab = (tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    setActiveTab((prev) => prev === tabId ? 'list' : prev);
};

const openReportTab = (report: ReportPayload) => {
    const id = report.meta.id;
    const existing = tabs.find((t) => t.id === id);
    if (existing) {
        setActiveTab(id);
        return;
    }
    setTabs((prev) => {
        const next = [...prev, { id, title: report.meta.title || report.meta.dateLabel || id, report }];
        if (next.length > MAX_OPEN_TABS) next.shift(); // evict oldest
        return next;
    });
    setActiveTab(id);
};
```

**Content area:** Conditionally render list panel or detail panel based on `activeTab`:
```tsx
{activeTab === 'list' ? (
    <div>/* ReportListPanel — built in Task 8 */</div>
) : (
    <div>/* ReportDetailPanel — built in Task 9 */</div>
)}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/FightReportHistoryView.tsx
git commit -m "feat(history): scaffold tabbed container with tab bar and state"
```

---

## Task 8: Report List Panel — Card Grid & Index Fetching

**Files:**
- Modify: `src/renderer/FightReportHistoryView.tsx`

- [ ] **Step 1: Add index fetching logic**

Add the static import at the top of the file:
```typescript
import { normalizeReportPayload } from '../shared/reportNormalization';
```

Add derived state and a `useEffect` that fetches the report index when the selected repo changes. This replaces the old iframe-loading behavior:

```typescript
const selectedOption = repoOptions.find((o) => o.key === selectedRepoKey) || repoOptions[0] || null;

// Derive owner/repo from selected option for IPC calls
const selectedRepo = selectedOption ? parseRepoFullName(selectedOption.key) : null;
const defaultRepo = repoOptions[0] ? parseRepoFullName(repoOptions[0].key) : null;
const isOverride = !!(selectedRepo && defaultRepo && selectedOption?.key !== repoOptions[0]?.key);

const fetchIndex = useCallback(async () => {
    if (!selectedRepo) return;
    setIndexLoading(true);
    setIndexEntries([]);
    setError(null);
    try {
        const payload = isOverride ? { owner: selectedRepo.owner, repo: selectedRepo.repo } : undefined;
        const result = await window.electronAPI.getGithubReports(payload);
        if (result?.success) {
            setIndexEntries(Array.isArray(result.reports) ? result.reports : []);
        } else {
            setError(result?.error || 'Failed to load reports.');
        }
    } catch (err: any) {
        setError(err?.message || 'Failed to load reports.');
    } finally {
        setIndexLoading(false);
    }
}, [selectedRepoKey, isOverride, selectedRepo?.owner, selectedRepo?.repo]);

useEffect(() => {
    if (!selectedRepoKey) return;
    // Reset tabs and delete mode on repo switch
    setTabs([]);
    setActiveTab('list');
    setDeleteMode(false);
    setSelectedForDelete(new Set());
    fetchIndex();
}, [selectedRepoKey, fetchIndex]);
```

Note: `useCallback` is already imported from React in the existing file's import statement (add it if not present).

- [ ] **Step 2: Add card click handler**

```typescript
const handleCardClick = async (entry: ReportIndexEntry) => {
    if (deleteMode) {
        setSelectedForDelete((prev) => {
            const next = new Set(prev);
            next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
            return next;
        });
        return;
    }
    // Already open?
    if (tabs.find((t) => t.id === entry.id)) {
        setActiveTab(entry.id);
        return;
    }
    // Fetch detail
    setDetailLoading(entry.id);
    setDetailError(null);
    try {
        const payload: any = { reportId: entry.id };
        if (isOverride && selectedRepo) {
            payload.owner = selectedRepo.owner;
            payload.repo = selectedRepo.repo;
        }
        const result = await window.electronAPI.getGithubReportDetail(payload);
        if (result?.success && result.report) {
            const normalized = normalizeReportPayload(result.report);
            openReportTab(normalized);
        } else {
            setDetailError(result?.error || 'Failed to load report.');
        }
    } catch (err: any) {
        setDetailError(err?.message || 'Failed to load report.');
    } finally {
        setDetailLoading(null);
    }
};
```

- [ ] **Step 3: Add the card grid JSX**

Render the list panel when `activeTab === 'list'`:

```tsx
<div className="flex-1 min-h-0 overflow-y-auto px-8 pb-4">
    {/* Repo bar */}
    <div className="rounded-[4px] px-4 py-3 mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
        <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--text-secondary)' }}>History Source</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Browse your published fight reports.</div>
        </div>
        <div className="flex items-center gap-2">
            <RepoDropdown options={repoOptions} selected={selectedOption!} onSelect={setSelectedRepoKey} />
            <button
                type="button"
                onClick={() => { setDeleteMode((v) => !v); setSelectedForDelete(new Set()); }}
                className="px-3 py-2 rounded-[4px] text-xs"
                style={{
                    background: deleteMode ? 'var(--brand-primary)' : 'var(--bg-input)',
                    color: deleteMode ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-default)'
                }}
            >
                {deleteMode ? 'Cancel' : 'Manage'}
            </button>
        </div>
    </div>

    {/* Error banner */}
    {detailError && (
        <div className="rounded-[4px] px-4 py-3 mb-4 text-sm text-red-300"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
            {detailError}
        </div>
    )}

    {/* Loading state */}
    {indexLoading && (
        <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading reports...
        </div>
    )}

    {/* Empty state */}
    {!indexLoading && !error && indexEntries.length === 0 && (
        <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>
            No reports found.
        </div>
    )}

    {/* Card grid */}
    {!indexLoading && indexEntries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {indexEntries.map((entry) => (
                <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleCardClick(entry)}
                    className="text-left rounded-[6px] p-4 transition-colors"
                    style={{
                        background: 'var(--bg-card)',
                        border: `1px solid ${selectedForDelete.has(entry.id) ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                        opacity: detailLoading === entry.id ? 0.6 : 1
                    }}
                >
                    {deleteMode && (
                        <div className="mb-2">
                            <input type="checkbox" checked={selectedForDelete.has(entry.id)} readOnly
                                   className="accent-blue-500" />
                        </div>
                    )}
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {entry.title}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {entry.dateLabel || `${entry.dateStart} — ${entry.dateEnd}`}
                    </div>
                    {entry.commanders?.length > 0 && (
                        <div className="text-[11px] mt-1" style={{ color: 'var(--brand-primary)' }}>
                            {entry.commanders.join(', ')}
                        </div>
                    )}
                    {entry.summary && (
                        <div className="flex gap-4 mt-2 pt-2" style={{ borderTop: '1px solid var(--border-default)' }}>
                            {entry.summary.avgSquadSize != null && (
                                <div>
                                    <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Squad</div>
                                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>~{Math.round(entry.summary.avgSquadSize)}</div>
                                </div>
                            )}
                            {entry.summary.avgEnemySize != null && (
                                <div>
                                    <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Enemy</div>
                                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>~{Math.round(entry.summary.avgEnemySize)}</div>
                                </div>
                            )}
                        </div>
                    )}
                    {entry.summary?.mapSlices && entry.summary.mapSlices.length > 0 && (
                        <div className="flex h-1 rounded-full overflow-hidden mt-2">
                            {entry.summary.mapSlices.map((slice, i) => (
                                <div key={i} style={{ width: `${slice.value}%`, background: slice.color }} />
                            ))}
                        </div>
                    )}
                </button>
            ))}
        </div>
    )}
</div>
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/FightReportHistoryView.tsx
git commit -m "feat(history): add report card grid with index fetching"
```

---

## Task 9: Report Detail Panel — StatsView Integration

**Files:**
- Modify: `src/renderer/FightReportHistoryView.tsx`

- [ ] **Step 1: Add the detail panel**

Import StatsView at the top of the file:
```typescript
import { StatsView } from './StatsView';
```

Render when `activeTab !== 'list'`:

```tsx
const activeReport = tabs.find((t) => t.id === activeTab);

// In the JSX, when activeTab !== 'list':
{activeReport ? (
    <div className="flex-1 min-h-0 overflow-y-auto">
        <StatsView
            logs={[]}
            onBack={() => setActiveTab('list')}
            precomputedStats={activeReport.report.stats}
            statsViewSettings={activeReport.report.stats?.statsViewSettings}
            embedded
            dashboardTitle={activeReport.title}
        />
    </div>
) : (
    <div className="flex-1 min-h-0 flex items-center justify-center text-sm"
         style={{ color: 'var(--text-secondary)' }}>
        Report not found. It may have been closed.
    </div>
)}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Smoke test visually**

Run: `npm run dev`
1. Navigate to the History tab
2. Verify the repo dropdown and card grid appear (requires GitHub to be configured with existing reports)
3. Click a report card — verify it opens in a new sub-tab with the StatsView
4. Open multiple reports — verify tab bar shows them, max 5
5. Close tabs with the ✕ button — verify it returns to list

- [ ] **Step 4: Commit**

```bash
git add src/renderer/FightReportHistoryView.tsx
git commit -m "feat(history): add report detail panel with embedded StatsView"
```

---

## Task 10: Delete Flow — Multi-Select & Confirm

**Files:**
- Modify: `src/renderer/FightReportHistoryView.tsx`

- [ ] **Step 1: Add delete handler and confirm dialog**

```typescript
const handleDeleteSelected = async () => {
    const ids = Array.from(selectedForDelete);
    if (ids.length === 0) return;
    const confirmed = window.confirm(
        `Delete ${ids.length} report${ids.length === 1 ? '' : 's'} from GitHub? This cannot be undone.`
    );
    if (!confirmed) return;
    setDeleteLoading(true);
    try {
        const payload: any = { ids };
        if (isOverride && selectedRepo) {
            payload.owner = selectedRepo.owner;
            payload.repo = selectedRepo.repo;
        }
        const result = await window.electronAPI.deleteGithubReports(payload);
        if (result?.success) {
            // Close tabs for deleted reports
            setTabs((prev) => prev.filter((t) => !ids.includes(t.id)));
            setActiveTab((prev) => ids.includes(prev) ? 'list' : prev);
            // Refresh index
            setSelectedForDelete(new Set());
            setDeleteMode(false);
            await fetchIndex();
        } else {
            setDetailError(result?.error || 'Failed to delete reports.');
        }
    } catch (err: any) {
        setDetailError(err?.message || 'Failed to delete reports.');
    } finally {
        setDeleteLoading(false);
    }
};
```

- [ ] **Step 2: Add the delete toolbar**

Render at the bottom of the list panel when `deleteMode && selectedForDelete.size > 0`:

```tsx
{deleteMode && selectedForDelete.size > 0 && (
    <div className="sticky bottom-0 px-8 py-3"
         style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-default)' }}>
        <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {selectedForDelete.size} report{selectedForDelete.size === 1 ? '' : 's'} selected
            </span>
            <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-[4px] text-sm font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
                {deleteLoading ? 'Deleting...' : 'Delete Selected'}
            </button>
        </div>
    </div>
)}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/FightReportHistoryView.tsx
git commit -m "feat(history): add multi-select delete flow with confirmation"
```

---

## Task 11: Final Validation

**Files:** None (verification only)

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: No warnings (max-warnings 0).

- [ ] **Step 3: Unit tests**

Run: `npm run test:unit`
Expected: All tests pass. No regressions.

- [ ] **Step 4: Full validate**

Run: `npm run validate`
Expected: Passes (typecheck + lint).

- [ ] **Step 5: Visual smoke test**

Run: `npm run dev`

Test the following flows:
1. **History tab** → shows card grid with reports from default repo
2. **Click a report card** → opens in sub-tab, StatsView renders with all sections
3. **Open 6 reports** → oldest tab is evicted, only 5 tabs visible
4. **Close a tab** → returns to list if it was the active tab
5. **Switch repo** → clears tabs, loads new index
6. **Manage mode** → checkboxes appear, select reports, delete toolbar shows
7. **Delete** → confirm dialog, reports removed, tabs for deleted reports close
8. **Error handling** → disconnect GitHub token, verify error messages appear

- [ ] **Step 6: Commit any lint/type fixes if needed**

```bash
git add -A
git commit -m "fix(history): lint and type fixes from final validation"
```
