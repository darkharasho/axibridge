# Commander Tab — Design

**Date:** 2026-05-11
**Status:** Draft (pending implementation plan)
**Scope:** Add a new top-level tab focused on per-fight, commander-level diagnostics.

---

## Purpose

Give a WvW commander a single-page, failure-first diagnostic for the most recent fight: *what just happened, why, and what could have gone better.* The page is read between pushes — verdict in 5 seconds, full evidence one scroll away.

The page does **not** try to answer "did we win?" — commanders already know. It answers "where did this go sideways and what should we adjust?"

---

## Non-goals

- Replacing the existing Stats tab (which aggregates across many logs).
- Per-player coaching (covered by AxiPulse).
- Live in-fight overlay.
- Publishing to the web report. Commander tab is Electron-only for v1.

---

## Top-level layout

```
┌──────────────────────────────────────────────────────────┐
│  Tab bar: Logs · Stats · History · [Commander] · Settings │
├──────────────────────────────────────────────────────────┤
│  SESSION ROLLUP (6 small KPIs, derived from loaded logs)  │
├──────────────────────────────────────────────────────────┤
│  FIGHT HEADER                                             │
│    Map · Time · Duration                                  │
│    Squad(N) + Allies(N) vs Enemy(N) (peak)                │
│    Result verdict chips (Wipe / Trade / Carry / Clean +   │
│    Outnumbered / Caught engage / etc.)                    │
│    Fight selector (dropdown — defaults to most recent)    │
├───────────────────────┬──────────────────────────────────┤
│  ✓ WHAT WENT RIGHT    │  ⚠ COULD'VE GONE BETTER           │
│  2–4 insight bullets, │  2–4 insight bullets,             │
│  each with evidence + │  each with evidence +             │
│  threshold + mini viz │  threshold + mini viz             │
├──────────────────────────────────────────────────────────┤
│  METRIC GRID — 7 sections, color-coded, each with viz     │
│    1. Numbers & Matchup                                   │
│    2. Survival & Attrition                                │
│    3. Burst Exposure                                      │
│    4. Cohesion & Positioning                              │
│    5. Sustain Race                                        │
│    6. Engage Readiness                                    │
│    7. Outcome Ledger                                      │
└──────────────────────────────────────────────────────────┘
```

The approved mockup is preserved at `.superpowers/brainstorm/<session>/content/commander-tab-mock-v2.html`.

---

## Selected fight

- **Default:** the most recently uploaded log in the current set (auto-updates when a new log arrives).
- **History selector:** the fight header includes a dropdown listing all currently loaded logs, sorted newest first, formatted as `HH:MM · Map · Squad N vs Enemy N`. Selecting an entry re-renders the page against that log.
- **Selection state** is **not** persisted across app restarts — it always resets to "most recent."

---

## Session rollup strip (top)

Aggregates over all currently loaded logs in the renderer (same set the Stats tab uses), not just tonight's logs explicitly. The label reads "Tonight" only as a casual descriptor; the underlying set is "currently loaded."

Six items, left to right:

| KPI | Value | Sub-label |
|---|---|---|
| Fights | count of loaded logs | timespan (first→last) |
| K / D | enemy downs / squad deaths | overall ratio |
| Squad alive avg | mean squad alive % at end-of-fight | trend vs prior hour |
| Avg duration | mean fight duration | median |
| Outnumbered | count of fights where peak enemy > peak (squad+allies) | as % of fights |
| Trend sparkline | last 9 fights, mapped to a normalized "fight score" | direction arrow |

The trend score is a coarse signal (good vs bad fights) — its definition is a v1.5 concern; for v1, plot squad-alive-% per fight as the spark.

---

## Fight header

A horizontal strip. Components:

- **Map** — pulled from EI `fightName` or zone metadata.
- **Time** — log start time, local.
- **Duration** — `mm:ss`.
- **Matchup** — `Squad N + Allies M vs Enemy ~K (peak K_peak)`. Definitions:
  - **Squad**: players in the recording user's subgroup or in any subgroup ≤ 5 (configurable) — same definition AxiBridge already uses for squad metrics today. Reuse existing helper.
  - **Allies**: friendly non-squad players appearing on the field during the fight (EI friendlies − squad).
  - **Enemy**: EI's enemy player count, with a peak/avg distinction.
- **Verdict chips** — small pill labels driven by detectors (see §Detectors). At most 4 visible.
- **Fight selector dropdown** — described above.

---

## Insight columns (the "What went right / Could've gone better" panes)

Each pane shows **2–4** insight cards. Each card has:

```
┌──────────────────────────────────────────────────┐
│ Headline (one line, plain language)              │
│ Evidence (monospace, the numbers that fired)     │
│ Threshold (small grey, the rule that triggered)  │
│                       [ mini viz, 100×36 ]       │
└──────────────────────────────────────────────────┘
```

Insights are produced by **detectors** (see next section). Each detector emits at most one finding per fight, classified as *good*, *bad*, or *neutral*, with a numeric severity. The pane sorts by severity, takes top 4 per side. If a side has fewer than 2 findings, the pane shows whatever it has — never invented filler.

**Transparency requirement:** every card states (1) the value that triggered, (2) the threshold rule. Threshold rules are pulled from the Settings store so users can verify "why did this fire?"

---

## Detectors

A detector is a pure function:

```ts
type Detector = (fight: CommanderFightData, thresholds: CommanderThresholds) => DetectorFinding | null;

interface DetectorFinding {
  id: string;                  // stable, used for sorting & deduping
  side: 'good' | 'bad';
  severity: number;            // 0..1, higher = more salient
  headline: string;            // plain language, no numbers
  evidence: string;            // numbers, monospace-friendly
  threshold: string;           // human-readable rule
  vizKind: VizKind;            // which mini chart to draw
  vizData: unknown;            // shape depends on vizKind
}
```

The detector set for v1 maps directly to the failure patterns enumerated during brainstorming:

| ID | Fires when | Side |
|---|---|---|
| `first-squad-death-early` | first squad death < `firstDeathMinSec` (15s) OR > `firstDeathMaxDist` (900u) from tag | bad |
| `first-support-death-pre-bomb` | a support-classified player dies > 5s before the largest 3s incoming-damage window | bad |
| `bomb-overwhelmed-sustain` | any 3s window where incoming / healing > `bombRatio` (2.5×) | bad |
| `bomb-survived` | the largest 3s incoming window resulted in ≤ 1 squad death | good |
| `stab-coverage-good` | avg squad stab uptime through engage window (0–10s) ≥ `stabGood` (75%) | good |
| `stab-coverage-bad` | avg squad stab in worst bomb window < `stabBad` (50%) | bad |
| `cleanse-race-won` | cleanses applied − conditions taken > 0 | good |
| `cleanse-race-lost` | net < `cleanseDeficit` (-50) | bad |
| `strip-race-lost` | strips received − strips landed > `stripDeficit` (40) | bad |
| `rally-rate-healthy` | rally rate ≥ `rallyGood` (55%) and downs ≥ 4 | good |
| `caught-out-deaths` | avg distance-from-tag at death > `caughtOutDist` (700u) | bad |
| `fragmented-at-bomb` | squad-spread σ at bomb-window time > `spreadBad` (600u) | bad |
| `outnumbered-significantly` | (squad+allies) / enemy peak < `outnumThreshold` (0.85) | informational chip |

The detector set is extensible: new detectors are added by writing a function and registering it in a detector array. Thresholds live in a single typed object loaded from settings.

---

## Metric grid

Seven sections, each rendered as a row of 5 cards on a wide window (responsive: 4 on medium, 2 on narrow). Each card carries a small visual tuned to the metric type.

### Visual vocabulary

To keep the page legible, only these visuals are used:

| Viz | When | Example metrics |
|---|---|---|
| **Threshold bar** | A value compared against a "good" target | Effective ratio, distance from tag, stab uptime, % alive |
| **Diverging bar** | A net-positive/negative pair | Cleanses vs condis, strips landed vs taken |
| **Sparkline** | A time series over fight duration | Stab uptime curve, in/heal curve, spread σ |
| **Mini timeline** | Discrete events along the fight | First death, support death, bomb windows |
| **Tag bubble** | Dots inside/outside the commander's radius | Cohesion at engage, stragglers at bomb |
| **Stacked count bar** | Alive/down/dead split | Squad survival, ally survival |
| **Comp bars** | Categorical breakdown by class | Enemy composition |
| **Donut** | One percentage worth highlighting | Rally rate (used sparingly) |

Each card is color-coded on its left border (green/yellow/red) by the same thresholds that drive the insight detectors — one source of truth.

### Metric content per section

All metrics below are derived from a single EI JSON for the selected fight.

**1. Numbers & Matchup**
- Squad / Allies / Enemy counts (peak enemy noted)
- Effective ratio `(squad + allies) / enemy_peak`
- Time outnumbered (seconds where ratio < 1)
- Enemy comp (per-class count, bars)
- "In tag bubble" at engage start (count within `tagRadius` (600u) of commander)

**2. Survival & Attrition**
- Time to first squad death (timestamp + player + profession)
- Time to first support death (support = role-classified, reuse existing helper)
- Squad alive at end (4/25 style)
- Down → rally rate
- Deaths-over-time spark (each bar is one death)

**3. Burst Exposure**
- Worst 3-second incoming damage window (value + timestamp)
- Incoming / heal ratio at that spike
- Bomb-window count (count of 3s windows where incoming > `bombFloor`), with per-window outcome
- Downs in worst 3s
- Stab uptime in that spike

**4. Cohesion & Positioning**
- Avg distance from tag
- Time spent spread > 900u (any player)
- Avg distance from tag at moment of each death
- Squad spread σ (peak σ + timestamp)
- Stragglers at bomb (>1500u from tag in the bomb window)

**5. Sustain Race**
- Cleanses applied vs conditions taken (net)
- Strips landed vs strips received (net)
- Avg stab uptime across bomb windows
- Resistance uptime at burst moments
- Aegis uptime at burst moments

**6. Engage Readiness**
- Avg squad HP at engage start
- % of "key" CDs (stab/heal/CC) used in first 10s — reuse skill-usage data
- Pre-engage downs count
- Stab uptime 0–10s
- Inferred dodge starvation (heuristic, low/med/high)

**7. Outcome Ledger** (small footer)
- Kills (enemy down events)
- Squad deaths
- Ally deaths
- Net trade (kills/squad-death)
- Total damage out / damage in

---

## Data flow & architecture

### New shared module: `src/shared/commanderMetrics.ts`

Produces a `CommanderFightData` from a single `EIJson`:

```ts
interface CommanderFightData {
  fightId: string;
  map: string;
  startedAt: number;
  duration: number;

  matchup: {
    squadCount: number;
    alliesCount: number;
    enemyCount: number;
    enemyPeak: number;
    effectiveRatio: number;
    timeOutnumberedSec: number;
    enemyComp: Array<{ profession: string; count: number }>;
    inTagBubbleAtEngage: number;
  };

  survival: { /* ... */ };
  burst: { /* ... */ };
  cohesion: { /* ... */ };
  sustain: { /* ... */ };
  engage: { /* ... */ };
  outcome: { /* ... */ };

  /** Pre-computed series for sparklines (downsampled to ~50 points). */
  series: {
    incomingDps: number[];      // per-second damage taken by squad
    healingThroughput: number[];// per-second healing applied
    stabUptime: number[];       // per-second avg stab uptime
    spreadStdev: number[];      // per-second σ of distance-from-tag
    deathsTimeline: Array<{ tSec: number; account: string; profession: string; role: 'support' | 'damage' | 'unknown' }>;
    bombWindows: Array<{ tSec: number; durationSec: number; incoming: number; heal: number; outcome: 'survived' | 'broke' }>;
  };
}
```

All section metrics are pre-computed; the renderer is pure presentation.

### Computation placement

- Compute synchronously on the renderer when the selected fight changes — a single EI JSON is small relative to the multi-log aggregation that already runs inline below 8 logs.
- No web worker for v1. Single-fight computation is bounded.
- Cache by `fightId` in a small LRU (10 entries) inside the Commander view, so flipping back and forth doesn't recompute.

### New components

```
src/renderer/commander/
  CommanderView.tsx          # top-level page
  CommanderHeader.tsx        # fight header + selector + chips
  CommanderRollup.tsx        # session rollup strip
  CommanderInsights.tsx      # the two columns
  CommanderGrid.tsx          # the 7 sections
  detectors/
    index.ts                 # registry + runAll(fightData, thresholds)
    firstDeathEarly.ts
    bombOverwhelmedSustain.ts
    ... (one file per detector)
  viz/
    ThresholdBar.tsx
    DivergingBar.tsx
    Sparkline.tsx
    MiniTimeline.tsx
    TagBubble.tsx
    StackedCountBar.tsx
    CompBars.tsx
    Donut.tsx
  hooks/
    useCommanderFightData.ts # selects current fight, runs commanderMetrics, caches
    useCommanderRollup.ts    # session aggregate
```

### Settings (5b → option 2)

A new `commanderThresholds` slice in user settings, persisted via existing `electronAPI.saveSettings`. Defaults shipped in `src/shared/commanderThresholds.ts`. The Settings view gets a new "Commander thresholds" section (after the existing metric settings), with one row per threshold:

- Label (e.g., "First squad death — flag if before")
- Input (number, with unit suffix)
- "Reset to default" button per row
- "Reset all" button at the top of the section

Editing thresholds re-evaluates detectors live without page reload.

### Tab registration

Add a `commander` entry to the existing top-level tab enum (currently in `src/renderer/App.tsx`). Insert between History and Settings (or wherever the user prefers — see open question §Open). The tab is always visible; if no logs are loaded, the page shows an empty state with "Upload or wait for a log."

---

## Visual design

- Reuses the existing dark theme tokens from the renderer (`bg-slate-950`, slate borders, emerald/amber/rose accents). No new Tailwind config.
- Card style mirrors the existing `StatsView` cards but with the left-border color stripe and a fixed `min-h-[92px]` to make room for the embedded viz.
- All visuals are inline SVG components — no chart libraries.
- Threshold bar marker is a 2px white tick at the target line; fill color matches the card severity.

---

## Error & empty states

- **No logs loaded:** centered empty state — "No logs yet. Drop a .zevtc into the watched folder or upload one to see your latest fight." Session rollup is hidden.
- **Selected log still uploading or details still hydrating:** show the layout skeleton with shimmer placeholders in each card. Reuse the existing skeleton component pattern.
- **EI JSON missing required fields:** any individual metric or detector that can't compute shows "—" in its card (greyed) instead of throwing. Detectors that can't evaluate simply don't produce a finding.

---

## Testing

- **Unit tests** (vitest) for each detector — given a synthetic `CommanderFightData`, assert it fires/doesn't fire and produces the expected evidence string. One test file per detector.
- **Unit tests** for `commanderMetrics.ts` — feed a stored fixture (`test-fixtures/*.json`) and assert key derived values against a checked-in golden.
- **Component tests** (vitest + jsdom) for `CommanderView` — given a fixture, assert presence of section headings, at least N insight bullets when expected, and correct verdict chips.
- **Visual regression** is out of scope for v1.

No new e2e Playwright tests required for v1 (the existing fixture-driven view tests cover the integration shape).

---

## Open questions

1. **Tab placement** — between History and Settings, or as the new first tab? The Commander view arguably wants prominence ("the page you look at between pushes"), so first-tab is defensible. Defer to the user during plan review.
2. **Support classification** — we rely on the existing role-classification helper (`player-role-classification` design from 2026-04-02). v1 trusts whatever that helper returns. If a fight has no classified support, "Time to first support death" shows "—" rather than guessing.
3. **Bomb-window detection floor** — `bombFloor` (an absolute incoming-damage threshold) needs sensible defaults. Suggest: `max(150_000, p75 of all 3s windows in fight)`. Tunable.
4. **Trend sparkline scoring** — for v1 use squad-alive-% per fight; revisit a composite "fight score" later.

---

## Out of scope for v1 (deferred to follow-ups)

- Cross-session trend graphs (only "tonight"/loaded set).
- Per-player drill-down from the Commander view (users still go to Stats / per-log for that).
- Map-overlay positioning view (AxiBridge has map-replay; Commander reuses spread/cohesion stats only).
- Composite "fight quality" score with weights.
- AI-generated narrative summary (separate effort).
- Web report publication.

---

## Glossary

- **Squad** — players in the recording user's subgroup. Reuse existing helper.
- **Allies** — friendly non-squad players (EI friendlies − squad).
- **Bomb window** — a 3-second window where incoming squad damage exceeds `bombFloor`.
- **Engage window** — the first 10 seconds of the fight.
- **Tag bubble** — area within `tagRadius` (600u default) of the commander's position.
- **Effective ratio** — `(squad + allies) / enemy_peak`.
