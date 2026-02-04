
# ArcBridge Feature Roadmap

## Planning assumptions
- Keep each feature shippable in increments (MVP -> expansion).
- Prefer reusing existing log parsing and stats pipelines before adding new backend complexity.
- Prioritize features that improve upload reliability and post-fight analysis speed.

## Defaults
- All changes should be backed by tests
- Update the spec as needed for new computations and logic
- Update the how-tos for any functionality change

## Phase 1 (Foundations and High Impact)

### 1) Smart Upload Retry Queue
Direction:
- Make upload reliability visible and controllable from one place.

MVP scope:
- Central retry queue UI with statuses (`queued`, `retrying`, `failed`, `resolved`).
- Exponential backoff with capped attempts.
- One-click `Retry all failed`.
- Persist queue state between app restarts.

Expansion:
- Failure reason grouping (network, auth, dps.report, malformed file).
- Auto-pause queue on repeated auth failures.

Definition of done:
- Failed uploads no longer disappear silently.
- Users can recover most transient failures without manual re-upload.

### 2) Session Timeline View
Direction:
- Provide a single chronological workspace for all fights in a session.

MVP scope:
- Timeline rows for each fight with outcome, duration, upload time, and tags.
- Jump-to-log interaction from timeline entries.
- Basic quick compare entry point from two selected fights.

Expansion:
- Event overlays (comp swaps, wipes, spikes in deaths, tag movement events).
- Session bookmarks and notes.

Definition of done:
- Users can navigate a large session faster than scrolling card lists.

### 3) Command Palette (`Ctrl/Cmd+K`)
Direction:
- Reduce UI friction for power users and frequent workflows.

MVP scope:
- Command launcher with fuzzy search.
- Core actions: open specific settings section, load dataset, open How-To, upload web report, export/import settings.
- Keyboard-first navigation and execution.

Expansion:
- Context-aware commands (selected log actions, compare two fights).
- Recently used and pinned commands.

Definition of done:
- Most frequent actions reachable in <3 keystrokes after opening palette.

### 4) Pinned Metrics Dashboard
Direction:
- Let users create their own “first screen” with only the metrics they care about.

MVP scope:
- Add/remove/reorder metric widgets.
- Save layout per user in settings.
- Include existing key metrics (W/L, KDR, avg squad/enemies, uptime summaries).

Expansion:
- Multiple saved layouts by scenario (roaming, guild raid, reset night).
- Widget-level filters (time window, only wins, only outnumbered).

Definition of done:
- Users can replace static defaults with a personalized dashboard in under 2 minutes.

## Phase 2 (Analysis Depth)

### 5) Diff Mode for Two Fights
Direction:
- Make fight-to-fight deltas obvious and actionable.

MVP scope:
- Side-by-side compare with delta columns for comp, boon uptime, damage, downs/deaths.
- Target focus comparison and top performer deltas.

Expansion:
- Visual trend spark lines and significance highlighting.
- “Compare against previous fight” quick action from timeline.

Definition of done:
- Users can explain why one fight succeeded and another failed in one view.

### 6) Comp Heatmap
Direction:
- Expose which compositions work best over time.

MVP scope:
- Heatmap for class/build participation by fight index or time.
- Overlay win-rate and KDR per composition slice.

Expansion:
- Weighting by enemy count/outnumbered status.
- Drill-down from heatmap cell to filtered fight list.

Definition of done:
- Users can identify strongest and weakest comp patterns in a session/week.

### 7) Player Trend Profiles
Direction:
- Track player performance consistency and progression.

MVP scope:
- Per-player trend charts for DPS, downs, cleanses, deaths, and attendance.
- Session and weekly view presets.

Expansion:
- Role-aware metrics (support, strip, frontline, ranged pressure).
- Teammate-relative percentile view.

Definition of done:
- Officers can quickly review player consistency and improvement trends.

### 8) Fight Similarity + Tagging
Direction:
- Make recurring fight types searchable and analyzable.

MVP scope:
- Rule-based auto-tagging (`outnumbered`, `cloud`, `keep_defense`, etc.).
- Tag filters in dashboard, timeline, and exports.

Expansion:
- Similarity score between fights based on comp, map context, and outcome signals.
- Suggested tags users can accept/edit.

Definition of done:
- Users can filter large datasets by tactical situation in seconds.

## Phase 3 (Intelligence and Presentation)

### 9) Auto Highlights Reel
Direction:
- Auto-summarize sessions into shareable key moments.

MVP scope:
- Generate highlight cards: highest spike damage, clutch rez chain, biggest strip window, cleanest win.
- “Copy/share summary” output for Discord/web report.

Expansion:
- Clip-like timeline snippets with jump-to-fight anchors.
- Highlight confidence scoring to reduce noisy picks.

Definition of done:
- Session recap can be generated in one click without manual hunting.

### 10) Report Sharing Presets
Direction:
- Standardize outputs for different audiences.

MVP scope:
- Presets: `Guild Recap`, `Commander Recap`, `Training Night`.
- Each preset defines included metrics, ordering, and narrative tone.

Expansion:
- User-editable preset templates with import/export.
- Auto-select preset suggestions from session tags.

Definition of done:
- Users can publish tailored summaries with no manual metric reconfiguration.

### 11) Anomaly Detection
Direction:
- Surface important outliers users would otherwise miss.

MVP scope:
- Rule-based anomaly flags (death spikes, boon uptime collapse, sudden comp mismatch).
- Severity levels and one-click “show related fights”.

Expansion:
- Baseline-aware anomaly scoring per guild/group.
- False-positive feedback loop (“ignore this pattern”).

Definition of done:
- Outlier events are visible without deep manual inspection.

### 12) Coach Mode
Direction:
- Translate analytics into practical tactical advice.

MVP scope:
- Generate hints tied to detected patterns (“stability uptime dropped during pushes”).
- Hints link to supporting metrics and affected fights.

Expansion:
- Role-specific coaching tracks and training objectives.
- “Before/after” validation against trend improvements.

Definition of done:
- Users get actionable recommendations, not just raw stats.

## Cross-feature implementation notes
- Data model:
  - Add normalized `sessionId`, `tags`, `derivedSignals`, `anomalies`.
  - Keep compatibility with current log records and dev datasets.
- UX consistency:
  - Reuse status and filter components across timeline, compare, and presets.
  - Keep keyboard shortcuts and accessible focus handling as first-class requirements.
- Testing:
  - Add regression coverage for new stateful UI flows (timeline selection, compare mode, retry queue persistence).
  - Snapshot tests for preset output schemas.
- Release strategy:
  - Ship Phase 1 behind feature flags if needed.
  - Use opt-in beta toggles for anomaly/coach features before default-on.
