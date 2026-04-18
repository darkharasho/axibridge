# GitHub Upload Size Optimization

**Session date:** 2026-04-17

## Problem

GitHub uploads were failing with a 422 error:
> "Sorry, your input was too large to process. Consider creating the blob in a local clone of the repository and then pushing it to GitHub."

Root cause: `report.json` was being trimmed to ≤90 MB, but GitHub's blob API encodes content as base64 (+33% overhead), pushing the request body to ~120 MB — over GitHub's ~100 MB API limit.

## Changes Made

### 1. Lower `MAX_GITHUB_REPORT_JSON_BYTES` — `githubHandlers.ts`
90 MB → 50 MB. A 50 MB raw file becomes ~67 MB base64, safely under GitHub's limit.

### 2. Reorder trim steps — `githubHandlers.ts`
`replayFights` was the last thing dropped (lowest priority). It's actually the largest section by far — positional data for every player at every 300 ms tick, multiplied across all fights. Moved to **first** in the trim order. Full new order:

1. `replayFights` ← was last, now first
2. `replayIcons` (orphaned after fights are gone)
3. `skillUsageData.logRecords`
4. `playerSkillBreakdowns`
5. `boonTimeline`
6. `boonUptimeTimeline`
7. `specialTables`
8. `fightDiffMode`
9. `outgoingConditionPlayers`
10. `incomingConditionPlayers`
11. `skillUsageData.players`
12. `skillUsageData.skillOptions`
13. `topSkills` / `topIncomingSkills` / `topSkillsByDamage` / `topSkillsByDownContribution`
14. `fightBreakdown`
15. `timelineData`
16. `squadCompByFight`
17. `iconIndex` (last resort)

### 3. Deduplicate `boonIcons`/`skillIcons` across fights — `githubHandlers.ts` + `StatsView.tsx`
Each `ReplayFightPayload.movementData` stored identical icon dictionaries. Now merged into a single `stats.replayIcons` at serialization time, and re-injected per fight in `resolveReplayFights()` before rendering.

### 4. Round positions to integers — `movementData.ts`
GW2 positions are floats like `[345.393, 5432.823]`. Sub-inch precision is irrelevant for map visualization. Rounded to integers for both players and enemies. ~40% reduction in position data.

### 5. Round `healthPercents` and `damageTaken1SPerSec` to integers — `movementData.ts`
Health percentages (0–100) and per-second damage values are rounded. No display impact.

### 6. Global icon URL index — `githubHandlers.ts` + `reportApp.tsx`
GW2 CDN icon URLs (~84 chars each, e.g. `https://render.guildwars2.com/file/.../ID.png`) appear hundreds of times across `skillUsageData`, `playerSkillBreakdowns`, `boonTables`, etc. with ~3.3× redundancy.

Now: all `icon` string values are collected into `stats.iconIndex: string[]`, replaced with their numeric index (1–3 chars). Expanded back to URLs in `reportApp.tsx` at load time before passing to `StatsView`. Transparent to all rendering components.

### 7. Compress `targetFocusSamples.memberKey` — `githubHandlers.ts` + `StatsView.tsx`
Each sample stored a full account string (e.g. `"SomePerson.1234"`) repeated thousands of times in large fights. Now stored as a numeric index into `fight.memberKeys[]`. Restored in `resolveReplayFights()`. Only one consumer: `EventOverlay.tsx`.

## Result

| Before | After |
|--------|-------|
| 90 MB (trimmed) | ~31 MB |
| Upload failing (422) | Upload succeeding |

Previous reports before replay feature: 5–6 MB. Replay data is the dominant cost.

## Storage Limits (for reference)

- **GitHub Pages**: 1 GB published site limit → ~25–30 concurrent reports at 30–40 MB each
- **Git history**: Blobs persist in history even after report deletion. Each upload permanently adds ~30–40 MB to the object store. After ~25–30 total uploads the repo approaches GitHub's soft 1 GB repo size recommendation.
- **Mitigation options:**
  - Periodic orphan branch reset (automated when repo crosses size threshold)
  - Store `report.json` files in a separate data repo; keep Pages repo for template only (scales indefinitely)

## Files Changed

- `src/main/handlers/githubHandlers.ts` — limit, trim order, icon dedup, icon index, memberKey compression
- `src/shared/movementData.ts` — position/health/damage rounding
- `src/web/reportApp.tsx` — icon index expansion at load time
- `src/renderer/StatsView.tsx` — `resolveReplayFights()` for icon re-injection + memberKey restoration
