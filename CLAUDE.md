# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

AxiBridge is an Electron desktop app for Guild Wars 2 players that watches the arcdps log folder, uploads logs to dps.report, computes WvW fight statistics, and sends formatted summaries to Discord webhooks or publishes persistent web reports to GitHub Pages.

## Commands

```bash
# Development
npm run dev               # Run full Electron + React dev environment (concurrently)
npm run dev:web           # Run only the web report viewer (port 4173)

# Build
npm run build             # Full build: React + web report + Electron
npm run build:web         # Build only the web report (dist-web/)
npm run build:linux       # Build AppImage
npm run build:win         # Build Windows NSIS installer

# Type checking & linting
npm run typecheck         # TypeScript check for src/ and electron/
npm run lint              # ESLint (max-warnings 0)
npm run validate          # typecheck + lint

# Tests
npm run test:unit                    # Run all vitest unit tests
npm run test:unit:watch              # Watch mode
npm run test:e2e:web                 # Playwright tests for web report
npm run test:e2e:electron            # Playwright tests for the Electron app
npm run test:regression:stats        # Run specific regression tests for stats/upload logic

# Run a single test file
npx vitest run src/renderer/__tests__/StatsView.integration.test.tsx

# Audits (validate metric consistency against test fixtures)
npm run audit:boons
npm run audit:metrics
npm run audit:conditions
npm run audit:conditions:consistency

# Generate test fixtures from .zevtc log files in testdata/
npm run generate:fixtures

# Sync metrics-spec.md from src/shared/ to docs/
npm run sync:metrics-spec
```

## Architecture

### Three Vite Targets, One Electron Shell

| Target | Config | Output | Entry |
|--------|--------|--------|-------|
| Electron renderer (React) | `vite.config.ts` | `dist-react/` | `index.html` |
| Web report viewer | `vite.web.config.ts` | `dist-web/` | `web/index.html` |
| Electron main process | `electron/tsconfig.json` + `tsc` | `dist-electron/` | `src/main/index.ts` |

Electron main uses `electron-builder` for packaging. Dev userData is isolated to `AxiBridge-Dev` when not packaged.

### Process Communication (IPC)

The preload script (`src/preload/index.ts`) exposes `window.electronAPI` to the renderer via `contextBridge`. All communication between the React renderer and Electron main uses `ipcMain`/`ipcRenderer` through this bridge. The renderer should never call Node APIs directly.

### Source Layout

```
src/
  main/          # Electron main process
    index.ts     # App bootstrap, IPC handlers, all settings persistence
    uploader.ts  # dps.report upload queue (max 3 concurrent) with retry logic
    watcher.ts   # chokidar-based folder watcher for .evtc/.zevtc files
    discord.ts   # Discord webhook formatting and posting
    integration.ts  # AppImage desktop integration
  preload/
    index.ts     # contextBridge – exposes electronAPI to renderer
  shared/        # Code shared across main, renderer, and web
    dpsReportTypes.ts    # TypeScript interfaces for EI JSON (Player, Target, etc.)
    dashboardMetrics.ts  # Per-player metric extraction functions
    boonGeneration.ts    # Boon uptime/output calculations
    combatMetrics.ts     # Combat stat helpers
    conditionsMetrics.ts # Condition application metrics
    dashboardMetrics.ts  # Dashboard stat getters
    metricsSettings.ts   # DisruptionMethod and metric configuration
    professionUtils.ts   # Profession name, color, emoji, icon helpers
    webThemes.ts         # Web report theme definitions (Arcane, CRT, Matte, Kinetic)
    metrics-spec.md      # Source-of-truth metrics documentation (synced to docs/)
  renderer/      # Electron renderer (main desktop UI)
    App.tsx              # Root component, manages all app state
    StatsView.tsx        # Multi-section stats dashboard (aggregated view)
    ExpandableLogCard.tsx
    FightReportHistoryView.tsx
    SettingsView.tsx
    global.d.ts          # All shared TypeScript interfaces and default values (ILogData, IWebhook, etc.)
    stats/
      computeStatsAggregation.ts  # Core stats computation (called directly or via worker)
      statsTypes.ts               # Stats-specific types
      statsMetrics.ts             # OFFENSE/DEFENSE/SUPPORT metric definitions
      hooks/                      # React hooks for stats (aggregation, navigation, uploads, etc.)
      sections/                   # One component per stats section (OffenseSection, DefenseSection, etc.)
      utils/                      # dashboardUtils, pruneStatsLog, statsSyncRecovery
    workers/
      statsWorker.ts   # Web Worker that runs computeStatsAggregation off the main thread (>8 logs)
    app/
      AppLayout.tsx         # Shell layout
      hooks/useWebUpload.ts # GitHub Pages upload flow via electronAPI
      hooks/useFilePicker.ts
      hooks/useDevDatasets.ts
  web/           # Standalone web report viewer
    reportApp.tsx  # Web report root – loads report.json, renders StatsView + rollup
    rollup.ts      # Cross-report commander/player aggregate types and builder
```

### Data Flow

1. **Log detection**: `LogWatcher` (chokidar) emits `log-detected` → main process IPC sends to renderer.
2. **Upload**: `Uploader` queues .evtc/.zevtc files, posts to `dps.report/uploadContent`, then fetches EI JSON via `dps.report/getJson`. Max 3 concurrent uploads, 1 concurrent detail fetch.
3. **State**: All `ILogData` entries live in renderer state (App.tsx). Persisted via `electronAPI.saveLogs`.
4. **Stats computation**: `computeStatsAggregation` is the single aggregation function. For >8 logs it runs in a Web Worker (`statsWorker.ts`); otherwise inline. The `useStatsAggregationWorker` hook manages both paths.
5. **Discord**: Main process receives screenshot/embed requests from renderer → `DiscordNotifier` posts to configured webhooks.
6. **Web report**: Main process builds a static `dist-web/` site with `report.json` embedded, then pushes to GitHub Pages via git.

### Metrics System

All combat metrics are defined in `src/shared/metrics-spec.md`. This is the **source of truth**. After editing, run `npm run sync:metrics-spec` to copy to `docs/`.

Metric implementations live in `src/shared/dashboardMetrics.ts` and `src/shared/boonGeneration.ts`. The audit scripts (`npm run audit:*`) validate metric values against `test-fixtures/`.

### Web Themes

Themes (`WebTheme`) are defined in `src/shared/webThemes.ts` and used by both the Electron renderer and the web report. UI themes (`UiTheme`: `classic | modern | crt | matte | kinetic`) control the desktop app appearance.

### Testing

- **Unit tests**: vitest + jsdom, setup in `src/renderer/test/setup.ts`. Tests live alongside source in `src/**/__tests__/`.
- **E2E web**: Playwright against the web report served by `npm run dev:web` (port 4173).
- **E2E Electron**: Playwright against a built Electron app.
- Test fixtures (`.zevtc` → `.json`) are generated with `npm run generate:fixtures` and live in `test-fixtures/`.

### Dev Tooling Notes

- `NODE_OPTIONS=--max-old-space-size=6144` is set on all build/dev scripts because large log datasets can exhaust the default V8 heap.
- Dev mode separates userData to `AxiBridge-Dev` to avoid corrupting production settings.
- `npm run dev:fake-first-time` resets the dev first-time-experience flow.
- `scripts/obfuscate-accounts.mjs` can anonymize account names in test fixtures before committing.
