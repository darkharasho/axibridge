# Stats Section Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the stats dashboard sections to match the unified theme — CSS variable tokens, 4px radii, connected panel containers per nav group, hybrid color strategy.

**Architecture:** Each of the 7 nav groups becomes a single card container (group wrapper) in the classic layout. Individual sections become panels inside their group, separated by thin dividers instead of being independent cards. All hardcoded Tailwind colors are replaced with CSS variables. Interactive elements use the brand palette; section identity uses semantic accent colors.

**Tech Stack:** React, Tailwind CSS, CSS custom properties, existing stats component system

**Spec:** `docs/superpowers/specs/2026-03-24-stats-section-redesign.md`

---

### Task 1: Add Semantic Section Color CSS Variables

**Files:**
- Modify: `src/renderer/index.css` (lines 6–57, `:root` block)

- [ ] **Step 1: Add section color variables to `:root`**

After the existing `--scrollbar-thumb-hover` line (line 52) and before the `font-family` line (line 54), add:

```css
  /* Section semantic accent colors */
  --section-offense: #f47272;
  --section-offense-bg: rgba(244, 114, 114, 0.08);
  --section-defense: #60a5fa;
  --section-defense-bg: rgba(96, 165, 250, 0.08);
  --section-mitigation: #818cf8;
  --section-mitigation-bg: rgba(129, 140, 248, 0.08);
  --section-support: #34d399;
  --section-support-bg: rgba(52, 211, 153, 0.08);
  --section-healing: #a3e635;
  --section-healing-bg: rgba(163, 230, 53, 0.08);
  --section-boon: #fbbf24;
  --section-boon-bg: rgba(251, 191, 36, 0.08);
```

- [ ] **Step 2: Verify no syntax errors**

Run: `npm run validate`
Expected: PASS (no CSS parsing errors, existing type/lint checks pass)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.css
git commit -m "style: add semantic section color CSS variables"
```

---

### Task 2: Create StatsGroupContainer Component

**Files:**
- Create: `src/renderer/stats/ui/StatsGroupContainer.tsx`

- [ ] **Step 1: Create the group container component**

```tsx
import type { ReactNode } from 'react';

type StatsGroupContainerProps = {
    groupId: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    sectionCount: number;
    children: ReactNode;
};

export function StatsGroupContainer({
    groupId,
    label,
    icon: Icon,
    accentColor,
    sectionCount,
    children,
}: StatsGroupContainerProps) {
    return (
        <div
            id={`group-${groupId}`}
            className="stats-group-container scroll-mt-24"
            style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderLeft: `2px solid ${accentColor}`,
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-card)',
            }}
        >
            <div
                className="flex items-center gap-2.5 px-[18px] py-[14px]"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
                <div
                    className="flex items-center justify-center w-[18px] h-[18px] rounded-[3px]"
                    style={{ background: `${accentColor}33` }}
                >
                    <Icon className="w-3 h-3" style={{ color: accentColor }} />
                </div>
                <h2
                    className="text-xs font-bold uppercase tracking-[0.08em]"
                    style={{ color: 'var(--text-primary)' }}
                >
                    {label}
                </h2>
                <span
                    className="ml-auto text-[10px]"
                    style={{ color: 'var(--text-muted)' }}
                >
                    {sectionCount} {sectionCount === 1 ? 'section' : 'sections'}
                </span>
            </div>
            {children}
        </div>
    );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/ui/StatsGroupContainer.tsx
git commit -m "feat: add StatsGroupContainer component for nav group wrappers"
```

---

### Task 3: Create SectionPanel Wrapper Component

**Files:**
- Create: `src/renderer/stats/ui/SectionPanel.tsx`

- [ ] **Step 1: Create the section panel component**

This replaces the per-section card styling. Each section becomes a panel inside a group container.

```tsx
import type { ReactNode } from 'react';

type SectionPanelProps = {
    sectionId: string;
    children: ReactNode;
    isLast?: boolean;
};

export function SectionPanel({
    sectionId,
    children,
    isLast = false,
}: SectionPanelProps) {
    return (
        <div
            id={sectionId}
            className="scroll-mt-24 page-break-avoid"
            style={{
                padding: '18px',
                borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
            }}
        >
            {children}
        </div>
    );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/ui/SectionPanel.tsx
git commit -m "feat: add SectionPanel wrapper component for panel-based sections"
```

---

### Task 4: Define Group-to-Color Mapping

**Files:**
- Create: `src/renderer/stats/sectionColors.ts`

- [ ] **Step 1: Create the mapping file**

```ts
/**
 * Maps nav group IDs and section IDs to their semantic accent colors.
 * Brand-primary groups use the CSS variable; semantic groups use fixed colors.
 */

/** Group-level accent colors (for StatsGroupContainer left-edge border) */
export const GROUP_ACCENT_COLORS: Record<string, string> = {
    overview: 'var(--brand-primary)',
    commanders: 'var(--brand-primary)',
    'squad-stats': 'var(--section-offense)',
    roster: 'var(--brand-primary)',
    offense: 'var(--section-offense)',
    defense: 'var(--section-defense)',
    other: 'var(--brand-primary)',
};

/** Section-level accent colors (for SectionPanel header dots) */
export const SECTION_ACCENT_COLORS: Record<string, string> = {
    // Overview group
    'overview': 'var(--brand-primary)',
    'fight-breakdown': 'var(--brand-primary)',
    'top-players': 'var(--brand-primary)',
    'top-skills-outgoing': 'var(--brand-primary)',
    'top-skills-incoming': 'var(--brand-primary)',
    'squad-composition': 'var(--brand-primary)',
    'timeline': 'var(--brand-primary)',
    'map-distribution': 'var(--brand-primary)',
    // Commander group
    'commander-stats': 'var(--brand-primary)',
    'commander-push-timing': 'var(--brand-primary)',
    'commander-target-conversion': 'var(--brand-primary)',
    'commander-tag-movement': 'var(--brand-primary)',
    'commander-tag-death-response': 'var(--brand-primary)',
    // Squad Stats group
    'squad-damage-comparison': 'var(--section-offense)',
    'squad-kill-pressure': 'var(--section-offense)',
    'heal-effectiveness': 'var(--section-healing)',
    'squad-tag-distance-deaths': 'var(--section-defense)',
    // Roster group
    'attendance-ledger': 'var(--brand-primary)',
    'squad-comp-fight': 'var(--brand-primary)',
    'fight-comp': 'var(--brand-primary)',
    // Offense group
    'offense-detailed': 'var(--section-offense)',
    'damage-modifiers': 'var(--section-offense)',
    'player-breakdown': 'var(--section-offense)',
    'damage-breakdown': 'var(--section-offense)',
    'spike-damage': 'var(--section-offense)',
    'conditions-outgoing': 'var(--section-offense)',
    // Defense group
    'defense-detailed': 'var(--section-defense)',
    'incoming-damage-modifiers': 'var(--section-defense)',
    'incoming-strike-damage': 'var(--section-defense)',
    'defense-mitigation': 'var(--section-mitigation)',
    'boon-output': 'var(--section-boon)',
    'boon-timeline': 'var(--section-boon)',
    'boon-uptime': 'var(--section-boon)',
    'support-detailed': 'var(--section-support)',
    'healing-stats': 'var(--section-healing)',
    'healing-breakdown': 'var(--section-healing)',
    // Other group
    'fight-diff-mode': 'var(--brand-primary)',
    'special-buffs': 'var(--brand-primary)',
    'sigil-relic-uptime': 'var(--brand-primary)',
    'skill-usage': 'var(--brand-primary)',
    'apm-stats': 'var(--brand-primary)',
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/sectionColors.ts
git commit -m "feat: add group-to-color and section-to-color accent mappings"
```

---

### Task 5: Update StatsView Classic Layout with Group Wrappers

**Files:**
- Modify: `src/renderer/StatsView.tsx` (lines 4272–4668, the classic layout `<>...</>` block)

This is the structural change. The flat list of `{isSectionVisible('x') && renderSectionWrap(...)}` calls gets reorganized into group wrappers.

- [ ] **Step 1: Add imports at top of StatsView.tsx**

Add these imports near the existing section imports:

```tsx
import { StatsGroupContainer } from './stats/ui/StatsGroupContainer';
import { SectionPanel } from './stats/ui/SectionPanel';
import { STATS_TOC_GROUPS } from './stats/hooks/useStatsNavigation';
import { GROUP_ACCENT_COLORS } from './stats/sectionColors';
```

- [ ] **Step 2: Create `renderGroupedSections` helper**

Add this inside the component, near the existing `renderSectionWrap` function (around line 435):

```tsx
/**
 * Wraps a group's sections in StatsGroupContainer + SectionPanel.
 * Checks group-level visibility via .some(), not a single sectionId.
 */
const renderGroup = (groupId: string, sections: Array<{ id: string; element: React.ReactNode }>) => {
    const group = STATS_TOC_GROUPS.find(g => g.id === groupId);
    if (!group) return null;
    const anyVisible = group.sectionIds.some(id => isSectionVisible(id));
    if (!anyVisible) return null;
    return (
        <StatsGroupContainer
            key={groupId}
            groupId={groupId}
            label={group.label}
            icon={group.icon as React.ComponentType<{ className?: string }>}
            accentColor={GROUP_ACCENT_COLORS[groupId] || 'var(--brand-primary)'}
            sectionCount={sections.length}
        >
            {sections.map((s, i) => (
                <SectionPanel key={s.id} sectionId={s.id} isLast={i === sections.length - 1}>
                    {renderSectionWrap(s.element)}
                </SectionPanel>
            ))}
        </StatsGroupContainer>
    );
};
```

- [ ] **Step 3: Restructure classic layout into groups**

Replace the flat `<>...</>` block (lines 4272–4668) with calls to `renderGroup`. Each group passes its section IDs and elements. Preserve all existing section props exactly.

```tsx
: (
    <>
        {renderGroup('overview', [
            { id: 'overview', element: <OverviewSection /> },
            { id: 'fight-breakdown', element: <FightBreakdownSection fightBreakdownTab={fightBreakdownTab} setFightBreakdownTab={setFightBreakdownTab} /> },
            { id: 'top-players', element: <TopPlayersSection showTopStats={showTopStats} showMvp={showMvp} topStatsMode={topStatsMode} expandedLeader={expandedLeader} setExpandedLeader={setExpandedLeader} formatTopStatValue={formatTopStatValue} isMvpStatEnabled={isMvpStatEnabled} /> },
            { id: 'top-skills-outgoing', element: <TopSkillsSection topSkillsMetric={topSkillsMetric} onTopSkillsMetricChange={updateTopSkillsMetric} /> },
            { id: 'squad-composition', element: <SquadCompositionSection sortedSquadClassData={sortedSquadClassData} sortedEnemyClassData={sortedEnemyClassData} getProfessionIconPath={getProfessionIconPath} /> },
            { id: 'timeline', element: <TimelineSection timelineData={safeStats.timelineData} timelineFriendlyScope={timelineFriendlyScope} setTimelineFriendlyScope={setTimelineFriendlyScope} /> },
            { id: 'map-distribution', element: <MapDistributionSection mapData={safeStats.mapData} /> },
        ])}

        {renderGroup('commanders', [
            { id: 'commander-stats', element: <CommanderStatsSection commanderStats={commanderStats} getProfessionIconPath={getProfessionIconPath} /> },
            { id: 'commander-push-timing', element: <CommanderPushTimingSection commanderStats={commanderStats} /> },
            { id: 'commander-target-conversion', element: <CommanderTargetConversionSection commanderStats={commanderStats} /> },
            { id: 'commander-tag-movement', element: <CommanderTagMovementSection commanderStats={commanderStats} /> },
            { id: 'commander-tag-death-response', element: <CommanderTagDeathResponseSection commanderStats={commanderStats} /> },
        ])}

        {renderGroup('squad-stats', [
            { id: 'squad-damage-comparison', element: <SquadDamageComparisonSection /> },
            { id: 'squad-kill-pressure', element: <SquadKillPressureSection /> },
            { id: 'heal-effectiveness', element: <HealEffectivenessSection fights={healEffectivenessFights} /> },
            { id: 'squad-tag-distance-deaths', element: <SquadTagDistanceDeathsSection fights={tagDistanceDeathsData} /> },
        ])}

        {renderGroup('roster', [
            { id: 'attendance-ledger', element: <AttendanceSection attendanceRows={attendanceData} getProfessionIconPath={getProfessionIconPath} /> },
            { id: 'squad-comp-fight', element: <SquadCompByFightSection fights={squadCompByFight} getProfessionIconPath={getProfessionIconPath} /> },
            { id: 'fight-comp', element: <FightCompSection fights={fightCompByFight} getProfessionIconPath={getProfessionIconPath} /> },
        ])}

        {renderGroup('offense', [
            { id: 'offense-detailed', element: <OffenseSection offenseSearch={offenseSearch} setOffenseSearch={setOffenseSearch} activeOffenseStat={activeOffenseStat} setActiveOffenseStat={setActiveOffenseStat} offenseViewMode={offenseViewMode} setOffenseViewMode={setOffenseViewMode} /> },
            { id: 'damage-modifiers', element: <DamageModifiersSection search={damageModSearch} setSearch={setDamageModSearch} activeMod={activeDamageMod} setActiveMod={setActiveDamageMod} incoming={false} /> },
            { id: 'player-breakdown', element: <PlayerBreakdownSection /* ... all existing props ... */ /> },
            { id: 'damage-breakdown', element: <DamageBreakdownSection playerSkillBreakdowns={playerSkillBreakdowns} /> },
            { id: 'spike-damage', element: <SpikeDamageSection /* ... all existing props ... */ /> },
            { id: 'conditions-outgoing', element: <ConditionsSection /* ... all existing props ... */ /> },
        ])}

        {renderGroup('defense', [
            { id: 'defense-detailed', element: <DefenseSection defenseSearch={defenseSearch} setDefenseSearch={setDefenseSearch} activeDefenseStat={activeDefenseStat} setActiveDefenseStat={setActiveDefenseStat} defenseViewMode={defenseViewMode} setDefenseViewMode={setDefenseViewMode} /> },
            { id: 'incoming-damage-modifiers', element: <DamageModifiersSection search={incomingDamageModSearch} setSearch={setIncomingDamageModSearch} activeMod={activeIncomingDamageMod} setActiveMod={setActiveIncomingDamageMod} incoming={true} /> },
            { id: 'incoming-strike-damage', element: <SpikeDamageSection /* ... all existing incoming-strike props ... */ /> },
            { id: 'defense-mitigation', element: <DamageMitigationSection /* ... all existing props ... */ /> },
            { id: 'boon-output', element: <BoonOutputSection /* ... all existing props ... */ /> },
            { id: 'boon-timeline', element: <BoonTimelineSection /* ... all existing props ... */ /> },
            { id: 'boon-uptime', element: <BoonUptimeSection /* ... all existing props ... */ /> },
            { id: 'support-detailed', element: <SupportSection supportSearch={supportSearch} setSupportSearch={setSupportSearch} activeSupportStat={activeSupportStat} setActiveSupportStat={setActiveSupportStat} supportViewMode={supportViewMode} setSupportViewMode={setSupportViewMode} cleanseScope={cleanseScope} setCleanseScope={setCleanseScope} /> },
            { id: 'healing-stats', element: <HealingSection /* ... all existing props ... */ /> },
            { id: 'healing-breakdown', element: <HealingBreakdownSection healingBreakdownPlayers={safeStats.healingBreakdownPlayers} /> },
        ])}

        {renderGroup('other', [
            { id: 'fight-diff-mode', element: <FightDiffModeSection /> },
            { id: 'special-buffs', element: <SpecialBuffsSection specialSearch={specialSearch} setSpecialSearch={setSpecialSearch} activeSpecialTab={activeSpecialTab} setActiveSpecialTab={setActiveSpecialTab} activeSpecialTable={activeSpecialTable} /> },
            { id: 'sigil-relic-uptime', element: <SigilRelicUptimeSection /* ... all existing props ... */ /> },
            { id: 'skill-usage', element: <SkillUsageSection /* ... all existing props ... */ /> },
            { id: 'apm-stats', element: <ApmSection /* ... all existing props ... */ /> },
        ])}
    </>
)
```

**Note:** Props abbreviated with `/* ... all existing props ... */` must be copied verbatim from the current flat layout (lines 4272–4668). Do not change any props — this is a structural wrapping change only. The `renderGroup` helper handles group-level visibility via `.some()`, so individual `isSectionVisible` guards are removed.

**Note:** `StatsTableLayout.tsx` and `StatsTableShell.tsx` are in the spec's scope list but have no hardcoded colors to replace — no changes needed for those files.

- [ ] **Step 4: Verify it compiles and renders**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "feat: wrap stats classic layout sections in group containers"
```

---

### Task 6: Update Section Root Styling (Remove Card Classes)

**Files:**
- Modify: All 34 files in `src/renderer/stats/sections/`

Every section file has a root `<div>` with card-level classes like `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24`. These need to change because: (1) the group container now provides the card styling, and (2) `SectionPanel` (from Task 3) now provides `scroll-mt-24`, `page-break-avoid`, and panel padding. Sections should remove those classes from their root divs.

**Important:** Each section's root `id` attribute (e.g., `id="offense-detailed"`) should be **removed** — `SectionPanel` now provides the `id` via its `sectionId` prop. The `data-section-visible` and `data-section-first` attributes can also be removed since group-level visibility replaces per-section visibility.

- [ ] **Step 1: Identify the pattern**

Each section's root div looks like one of these patterns:

**Pattern A — Metric sections** (Offense, Defense, Support, DamageMitigation, Healing, BoonOutput, SpecialBuffs):
```tsx
className={sectionClass('offense-detailed', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
    expandedSection === 'offense-detailed'
        ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}`
        : ''
}`)}
```

Replace with:
```tsx
className={sectionClass('offense-detailed', `page-break-avoid stats-share-exclude ${
    expandedSection === 'offense-detailed'
        ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}`
        : ''
}`)}
style={expandedSection === 'offense-detailed' ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
```

**Pattern B — Simple sections** (Overview, SquadComposition, Timeline, etc.):
```tsx
className={sectionClass('overview', 'space-y-4 scroll-mt-24')}
```

Replace with:
```tsx
className={sectionClass('overview', 'space-y-4')}
```

(The `scroll-mt-24` is handled by the SectionPanel or group container)

**Pattern C — Sections with card wrappers** (TopPlayers, Attendance, FightBreakdown):
These have internal `bg-white/5 border border-white/10 rounded-xl` on sub-cards. Replace with CSS variable equivalents:
```tsx
style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}
```

- [ ] **Step 2: Update all 34 section files**

Apply the pattern from Step 1 to each file. The key changes per file:

**Metric sections (7 files) — remove card wrapper, update expanded state:**
- `OffenseSection.tsx` — Pattern A
- `DefenseSection.tsx` — Pattern A
- `SupportSection.tsx` — Pattern A
- `DamageMitigationSection.tsx` — Pattern A
- `HealingSection.tsx` — Pattern A
- `BoonOutputSection.tsx` — Pattern A
- `SpecialBuffsSection.tsx` — Pattern A

**Chart/visual sections (8 files) — remove card wrapper:**
- `TimelineSection.tsx` — Pattern B
- `BoonTimelineSection.tsx` — Pattern A (has expand)
- `BoonUptimeSection.tsx` — Pattern A (has expand)
- `SpikeDamageSection.tsx` — Pattern A (has expand)
- `MapDistributionSection.tsx` — Pattern B
- `SquadCompositionSection.tsx` — Pattern B
- `SquadCompByFightSection.tsx` — Pattern B
- `FightCompSection.tsx` — Pattern B

**Table/list sections (10 files) — remove card wrapper:**
- `FightBreakdownSection.tsx` — Pattern C (has card sub-elements)
- `AttendanceSection.tsx` — Pattern C
- `TopPlayersSection.tsx` — Pattern C (LeaderCard sub-elements)
- `TopSkillsSection.tsx` — Pattern B
- `CommanderStatsSection.tsx` — Pattern C
- `ConditionsSection.tsx` — Pattern A
- `DamageModifiersSection.tsx` — Pattern A
- `DamageBreakdownSection.tsx` — Pattern B
- `PlayerBreakdownSection.tsx` — Pattern A
- `HealingBreakdownSection.tsx` — Pattern B

**Remaining sections (9 files):**
- `OverviewSection.tsx` — Pattern B (special: gradient cards, handled in Task 8)
- `FightDiffModeSection.tsx` — Pattern B
- `SkillUsageSection.tsx` — Pattern A (has expand)
- `ApmSection.tsx` — Pattern A (has expand)
- `SigilRelicUptimeSection.tsx` — Pattern A
- `SquadDamageComparisonSection.tsx` — Pattern B
- `SquadKillPressureSection.tsx` — Pattern B
- `HealEffectivenessSection.tsx` — Pattern B
- `SquadTagDistanceDeathsSection.tsx` — Pattern B

- [ ] **Step 3: Verify no regressions**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/
git commit -m "style: remove card-level classes from section root divs for panel model"
```

---

### Task 7: Update Section Headers to New Design

**Files:**
- Modify: All section files that have headers (most of the 34 files)

- [ ] **Step 1: Identify current header pattern**

Current:
```tsx
<h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
    <OffenseSwordIcon className="w-5 h-5 text-rose-300" />
    Offenses - Detailed
</h3>
```

New:
```tsx
<div className="flex items-center gap-2 mb-3.5">
    <div
        className="w-2 h-2 rounded-sm shrink-0"
        style={{ background: 'var(--section-offense)' }}
    />
    <h3
        className="text-[11px] font-semibold uppercase tracking-[0.05em]"
        style={{ color: 'var(--text-primary)' }}
    >
        Offense Detailed
    </h3>
    {/* expand button stays, but restyled */}
    <button
        type="button"
        onClick={...}
        className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
        style={{
            background: 'transparent',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
        }}
    >
        {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
    </button>
</div>
```

- [ ] **Step 2: Update headers across all sections**

Apply the new header pattern to each section. Replace hardcoded color classes on icons (`text-rose-300`, `text-sky-200`, etc.) with the corresponding `var(--section-*)` variable. Replace `text-gray-200` on titles with `var(--text-primary)`.

Sections that don't have headers (e.g., OverviewSection) skip this step.

- [ ] **Step 3: Remove unused Lucide icon imports**

Some sections import icons only used for old-style headers (e.g., Shield for Defense header icon). Since headers now use accent dots, these imports can be removed unless used elsewhere in the section.

- [ ] **Step 4: Verify**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/sections/
git commit -m "style: redesign section headers with accent dots and new typography"
```

---

### Task 8: Update Overview Section (Gradient Removal)

**Files:**
- Modify: `src/renderer/stats/sections/OverviewSection.tsx`

- [ ] **Step 1: Replace gradient cards with solid cards**

Current allied card:
```tsx
<div className="overview-card overview-card--green bg-gradient-to-br from-green-500/20 to-emerald-900/20 border border-green-500/30 rounded-2xl px-5 py-4">
```

New:
```tsx
<div
    className="overview-card"
    style={{
        background: 'var(--bg-card-inner)',
        border: '1px solid var(--border-default)',
        borderLeft: '2px solid #4ade80',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
    }}
>
```

Current enemy card:
```tsx
<div className="overview-card overview-card--red bg-gradient-to-br from-red-500/20 to-rose-900/20 border border-red-500/30 rounded-2xl px-5 py-4">
```

New:
```tsx
<div
    className="overview-card"
    style={{
        background: 'var(--bg-card-inner)',
        border: '1px solid var(--border-default)',
        borderLeft: '2px solid #f87171',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
    }}
>
```

- [ ] **Step 2: Update text colors**

Replace:
- `text-green-100` → `style={{ color: '#a7f3d0' }}` (muted green)
- `text-green-200/60` → `style={{ color: 'rgba(167, 243, 208, 0.5)' }}`
- `text-green-300` → `style={{ color: '#86efac' }}`
- `text-red-100` → `style={{ color: '#fecaca' }}` (muted red)
- `text-red-200/60` → `style={{ color: 'rgba(254, 202, 202, 0.5)' }}`
- `text-red-300` → `style={{ color: '#fca5a5' }}`

Replace the downs/deaths summary card:
```tsx
<div className="overview-card rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 px-5 py-4">
```
→
```tsx
<div
    className="overview-card"
    style={{
        background: 'var(--bg-card-inner)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
    }}
>
```

- [ ] **Step 3: Verify**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/OverviewSection.tsx
git commit -m "style: replace overview gradient cards with solid themed cards"
```

---

### Task 9: Update UI Components — StatsTableCard

**Files:**
- Modify: `src/renderer/stats/ui/StatsTableCard.tsx`

- [ ] **Step 1: Replace default class strings**

Current (lines 4–5):
```ts
const defaultSidebarClass = 'stats-table-sidebar bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 overflow-hidden';
const defaultContentClass = 'bg-black/30 border border-white/5 rounded-xl overflow-hidden';
```

New:
```ts
const defaultSidebarClass = 'stats-table-sidebar px-3 pt-3 pb-2 flex flex-col min-h-0 overflow-hidden';
const defaultSidebarStyle: CSSProperties = { background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' };
const defaultContentClass = 'overflow-hidden';
const defaultContentStyle: CSSProperties = { background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' };
```

Update the JSX to apply styles when using defaults (add `style` prop to the sidebar and content divs when no custom className is provided).

- [ ] **Step 2: Verify**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/ui/StatsTableCard.tsx
git commit -m "style: update StatsTableCard defaults to CSS variables"
```

---

### Task 10: Update UI Components — PillToggleGroup

**Files:**
- Modify: `src/renderer/stats/ui/PillToggleGroup.tsx`

- [ ] **Step 1: Replace container classes**

Current (line 25):
```tsx
className={`pill-toggle-group flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-[10px] uppercase tracking-[0.25em] text-gray-400 ${className}`}
```

New:
```tsx
className={`pill-toggle-group flex items-center gap-1 p-[1px] text-[10px] uppercase tracking-[0.25em] ${className}`}
style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '3px', color: 'var(--text-secondary)' }}
```

Update pill button radius from `rounded-full` to `rounded-sm` (2px).

- [ ] **Step 2: Verify**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/ui/PillToggleGroup.tsx
git commit -m "style: update PillToggleGroup to new design tokens"
```

---

### Task 11: Update UI Components — ColumnFilterDropdown

**Files:**
- Modify: `src/renderer/stats/ui/ColumnFilterDropdown.tsx`

- [ ] **Step 1: Update button styling**

Current (line 48):
```tsx
className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-300 hover:text-white hover:border-white/30 transition-colors"
```

New:
```tsx
className="flex items-center gap-2 px-3 py-1 text-xs font-semibold transition-colors"
style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--text-secondary)' }}
```

- [ ] **Step 2: Update dropdown panel**

Current (line 59):
```tsx
className="absolute z-20 mt-2 w-56 rounded-xl border border-white/10 bg-slate-950 p-2 text-xs shadow-2xl"
```

New:
```tsx
className="absolute z-20 mt-2 w-56 p-2 text-xs app-dropdown"
style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-dropdown)' }}
```

- [ ] **Step 3: Update option items, badge, and text colors**

Replace `text-gray-500` → `var(--text-muted)`, `text-gray-300` → `var(--text-secondary)`, `text-gray-400` → `var(--text-secondary)`, `text-gray-200` → `var(--text-primary)`.

Replace `bg-white/10` badge → `var(--bg-hover)`.

Replace `bg-white/5` hover → `var(--bg-hover)`.

Replace `border-white/20` selected → `var(--border-hover)`.

Replace `bg-emerald-400/80 border-emerald-300` active indicator → `background: var(--brand-primary); border-color: var(--brand-primary)`.

- [ ] **Step 4: Verify**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/ui/ColumnFilterDropdown.tsx
git commit -m "style: update ColumnFilterDropdown to new design tokens"
```

---

### Task 12: Update UI Components — StatsViewShared (Tooltips)

**Files:**
- Modify: `src/renderer/stats/ui/StatsViewShared.tsx`

- [ ] **Step 1: Update tooltip backgrounds**

Find all instances of `bg-black/70 border border-white/10` in tooltip components (ProfessionIcon tooltip, CountClassTooltip, SkillBreakdownTooltip).

Replace with:
```tsx
style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-dropdown)' }}
```

- [ ] **Step 2: Update tooltip text colors**

Replace:
- `text-gray-200` → `var(--text-primary)`
- `text-gray-100` → `var(--text-primary)`
- `text-gray-400` → `var(--text-secondary)`
- `text-amber-200` (used for counts/highlights) → keep as-is (semantic meaning)

- [ ] **Step 3: Verify**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/ui/StatsViewShared.tsx
git commit -m "style: update tooltip components to new design tokens"
```

---

### Task 13: Update Metric Section Active/Inactive Tab Colors

**Files:**
- Modify: All 7 metric sections (OffenseSection, DefenseSection, SupportSection, DamageMitigationSection, HealingSection, BoonOutputSection, SpecialBuffsSection)

- [ ] **Step 1: Identify current tab color pattern**

Current active tab pattern (varies by section):
```tsx
className={`... ${active ? 'bg-rose-500/20 text-rose-200 border-rose-500/40' : 'text-gray-400 ...'}`}
```

New (unified across all sections):
```tsx
className={`... ${active ? 'font-medium' : ''}`}
style={active
    ? { background: 'var(--accent-bg-strong)', border: '1px solid var(--accent-border)', color: 'var(--brand-primary)' }
    : { color: 'var(--text-secondary)', border: '1px solid transparent' }
}
```

- [ ] **Step 2: Update pill toggle activeClassName/inactiveClassName props**

Each section passes color-specific classes to PillToggleGroup. Update to brand colors:

Current:
```tsx
activeClassName="bg-rose-500/20 text-rose-200 border border-rose-500/40"
inactiveClassName="text-gray-400"
```

New:
```tsx
activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
inactiveClassName="text-[color:var(--text-secondary)]"
```

- [ ] **Step 3: Verify**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/
git commit -m "style: unify metric tab and pill colors to brand palette"
```

---

### Task 14: Update Remaining Hardcoded Colors in Sections

**Files:**
- Modify: Various section files with hardcoded `text-gray-*`, `bg-white/*`, `border-white/*` classes

- [ ] **Step 1: Search and replace remaining patterns across all section files**

Use these replacements:
- `text-gray-200` → `text-[color:var(--text-primary)]`
- `text-gray-300` → `text-[color:var(--text-secondary)]`
- `text-gray-400` → `text-[color:var(--text-secondary)]`
- `text-gray-500` → `text-[color:var(--text-muted)]`
- `bg-white/5` → `bg-[var(--bg-hover)]`
- `bg-white/10` → `bg-[var(--bg-hover)]`
- `bg-black/20` → style `var(--bg-card-inner)`
- `bg-black/30` → style `var(--bg-card-inner)`
- `border-white/10` → `border-[color:var(--border-default)]`
- `border-white/5` → `border-[color:var(--border-subtle)]`
- `rounded-2xl` → `rounded-[var(--radius-md)]`
- `rounded-xl` → `rounded-[var(--radius-md)]`
- `shadow-2xl` → (remove, or style `var(--shadow-card)`)
- `hover:text-white` → `hover:text-[color:var(--text-primary)]`
- `hover:border-white/30` → `hover:border-[color:var(--border-hover)]`

- [ ] **Step 2: Handle TopPlayersSection colorClasses**

The `colorClasses` map in TopPlayersSection.tsx (lines 14-23) uses category colors like `bg-red-500/20`, `text-red-400`. These are semantic category colors for leaderboard cards — keep them but consider defining as CSS variables or inline styles.

- [ ] **Step 3: Verify**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/ src/renderer/stats/ui/
git commit -m "style: replace all remaining hardcoded Tailwind colors with CSS variables"
```

---

### Task 15: Update SearchSelectDropdown

**Files:**
- Modify: `src/renderer/stats/ui/SearchSelectDropdown.tsx`

- [ ] **Step 1: Audit for hardcoded colors**

Read the full file and identify any hardcoded Tailwind color/border/radius classes. Apply the same token replacements as Task 14.

- [ ] **Step 2: Update**

Apply replacements following the same pattern.

- [ ] **Step 3: Verify**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/ui/SearchSelectDropdown.tsx
git commit -m "style: update SearchSelectDropdown to new design tokens"
```

---

### Task 16: Update DenseStatsTable

**Files:**
- Modify: `src/renderer/stats/ui/DenseStatsTable.tsx`

- [ ] **Step 1: Audit and update**

Read the full file. Update any hardcoded color classes, border classes, and radius values to CSS variables. The dense table is used in expanded modal views — ensure it works with the `var(--bg-elevated)` modal background.

- [ ] **Step 2: Verify**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/ui/DenseStatsTable.tsx
git commit -m "style: update DenseStatsTable to new design tokens"
```

---

### Task 17: Final Validation

**Files:** All modified files

- [ ] **Step 1: Run full validation**

Run: `npm run validate`
Expected: PASS — no TypeScript errors, no lint warnings

- [ ] **Step 2: Run unit tests**

Run: `npm run test:unit`
Expected: All tests pass

- [ ] **Step 3: Visual check in dev mode**

Run: `npm run dev`

Check each nav group:
1. Overview — solid cards, no gradients, group container with brand accent
2. Commander Stats — group container, section panels with dividers
3. Squad Stats — group container with offense accent
4. Roster Intel — group container with brand accent
5. Offensive Stats — group container with offense accent, metric tabs use brand color
6. Defensive Stats — group container with defense accent, sub-sections have semantic dots
7. Other Metrics — group container with brand accent

Check:
- Expand a section to modal — background is `var(--bg-elevated)`, no old rounded-2xl
- Switch palette (Settings → try all 4 palettes) — brand colors update across tabs/pills
- Toggle glass mode — group containers get backdrop-filter
- Tooltips have new styling

- [ ] **Step 4: Commit any visual fixes found**

```bash
git add -A
git commit -m "fix: visual fixes from manual review"
```
