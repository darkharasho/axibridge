# Report Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 8-group scroll-facade Stats navigation with a 10-category taxonomy, category-page navigation, a data-map landing section, and a shared universal search palette (sections + metrics + players) working identically in the desktop app and the web report.

**Architecture:** A new `statsTaxonomy.ts` module becomes the single source of truth for categories, section metadata, descriptions, and search keywords. Desktop (`StatsView` + `AppLayout`), History (`FightReportHistoryView`), and web (`reportApp.tsx`) all derive their navigation from it. Search is a pure client-side index (no server) built from the taxonomy + `@axiapps/bridge-metrics` metric arrays + the aggregation player list. Rendering is already gated to the active group; this plan renames that concept to "category," deletes dead scroll-facade machinery, and replaces the hover-rail sidebar with a category bar + subnav.

**Tech Stack:** React 18 + TypeScript, zustand (`useStatsStore`), vitest + jsdom + @testing-library/react, Playwright (web e2e), lucide-react icons, framer-motion (existing patterns).

**Spec:** `docs/superpowers/specs/2026-08-08-report-navigation-design.md`

## Global Constraints

- Run vitest with `--maxWorkers=2` always (machine memory policy).
- Section DOM ids are immutable — every current id keeps working as a `#hash` deep link.
- No changes to `report.json` format, aggregation output, or metric values.
- All three surfaces (desktop Stats, History embedded, web report) must derive nav/search from `statsTaxonomy.ts` — no hardcoded group lists may remain when done.
- `npm run validate` (typecheck + lint, max-warnings 0) must pass at the end of every task.
- Commit at the end of every task (each task leaves the app working).
- Existing icon components are reused: lucide icons plus `CommanderTagIcon`, `SupportPlusIcon`, `Gw2ApmIcon`, `Gw2AegisIcon`, `Gw2BoonIcon`, `Gw2DamMitIcon`, `Gw2FuryIcon`, `Gw2SigilIcon` from `src/renderer/ui/`.

## Key Existing Facts (read before starting any task)

- `STATS_TOC_GROUPS` lives in `src/renderer/stats/hooks/useStatsNavigation.ts:29-153` — the current 8 groups. It is consumed by `StatsView.tsx` (lines 14, 263-265, 2792-2795), `StatsNavSidebar.tsx:4`, and duplicated **by hand** (already drifted) in `src/web/reportApp.tsx:681+` as `navGroups`.
- `useStatsStore` (`src/renderer/stats/statsStore.ts`) holds `activeNavGroup: string` (default `'overview'`), `setActiveNavGroup`, `groupHeights`, `setGroupHeight`. `groupHeights` is measured by `useLazyGroups` but **never read for rendering** — StatsView renders inactive groups as `height: 0` placeholders (`StatsView.tsx:526-535`). It is dead weight.
- `StatsNavSidebar.tsx` (hover-expanding rail) mounts in `AppLayout.tsx:404` (desktop, no props — drives the store) and `FightReportHistoryView.tsx:450` (passes `onSectionVisibilityChange` into its embedded StatsView).
- Desktop visibility: `StatsView.tsx:2792-2803` — non-embedded sections are visible iff in the active group. Embedded visibility comes from the `sectionVisibility` prop.
- Web report: own `navGroups` literal (`reportApp.tsx:681`), own hash sync (`reportApp.tsx:905-940`), `sectionVisibilityFn` = active group's ids (`reportApp.tsx:822-830`), `'kdr'` is a web-only anchor alias for `overview`, `'report-top'` scrolls to page top.
- Metric definitions: `packages/bridge-metrics/src/statsMetrics.ts` exports `OFFENSE_METRICS`, `DEFENSE_METRICS`, `DAMAGE_MITIGATION_METRICS`, `SUPPORT_METRICS`, `HEALING_METRICS` — each entry has `{ id: string; label: string; ... }`. Re-exported at `src/renderer/stats/statsMetrics.ts`.
- Player list for search: `safeStats.playerSkillBreakdowns` (type `PlayerSkillBreakdown` in `src/renderer/stats/statsTypes.ts:45-54`) — has `account`, `displayName`, `profession`, `professionList`.
- Detailed metric sections share `useMetricSectionState` (`src/renderer/stats/hooks/useMetricSectionState.ts`); metric "columns" render as tabs/rows per section from the metric arrays.
- `noEgoMode` (`StatsView.tsx:235`) conditionally removes `top-skills-outgoing` and `player-comparison` from the render arrays.
- Test conventions: `src/renderer/stats/__tests__/*.test.ts` (plain vitest), setup `src/renderer/test/setup.ts`. Run: `npx vitest run <file> --maxWorkers=2`.

---

### Task 1: Taxonomy module + section resolver

**Files:**
- Create: `src/renderer/stats/statsTaxonomy.ts`
- Test: `src/renderer/stats/__tests__/statsTaxonomy.test.ts`

**Interfaces:**
- Consumes: icon components from `src/renderer/ui/` and `lucide-react` (same imports as `useStatsNavigation.ts:3-11`).
- Produces (later tasks rely on these exact names):
  - `interface StatsSectionMeta { id: string; label: string; icon: ComponentType<{ className?: string }>; description: string; keywords: readonly string[] }`
  - `interface StatsCategory { id: string; label: string; icon: ComponentType<{ className?: string }>; description: string; keywords: readonly string[]; sections: readonly StatsSectionMeta[] }`
  - `const STATS_CATEGORIES: readonly StatsCategory[]` (10 categories, 52 sections incl. `data-map`)
  - `const ALL_SECTION_IDS: readonly string[]`
  - `const SECTION_TO_CATEGORY: ReadonlyMap<string, string>`
  - `const LEGACY_ALIASES: ReadonlyMap<string, string>` (anchor → section id)
  - `function resolveSectionTarget(anchor: string): { categoryId: string; sectionId: string } | null`
  - `function getCategory(categoryId: string): StatsCategory | undefined`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/__tests__/statsTaxonomy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
    STATS_CATEGORIES,
    ALL_SECTION_IDS,
    SECTION_TO_CATEGORY,
    resolveSectionTarget,
} from '../statsTaxonomy';

// Every id that StatsView renders today (from the old STATS_TOC_GROUPS +
// rendered-but-unlisted sections). This list is the contract: ids are immutable.
const EXPECTED_SECTION_IDS = [
    // overview
    'data-map', 'overview', 'fight-breakdown', 'fight-diff-mode', 'timeline',
    'map-distribution', 'top-players', 'top-skills-outgoing', 'top-skills-incoming',
    // offense
    'offense-detailed', 'damage-breakdown', 'all-damage', 'spike-damage',
    'damage-modifiers', 'conditions-outgoing',
    // defense
    'defense-detailed', 'incoming-strike-damage', 'incoming-damage-modifiers',
    'defense-mitigation',
    // boons-strips
    'boon-output', 'boon-uptime', 'all-boons', 'boon-timeline', 'stab-performance',
    'boon-strip-comparison', 'strip-spikes',
    // support-healing
    'support-detailed', 'healing-stats', 'healing-breakdown', 'heal-effectiveness',
    // squad-cohesion
    'on-tag-review', 'squad-distance-to-tag', 'squad-distance-to-tag-visual',
    'squad-tag-distance-deaths', 'squad-kill-pressure', 'squad-damage-comparison',
    // commander
    'commander-stats', 'commander-push-timing', 'commander-target-conversion',
    'commander-tag-movement', 'commander-tag-death-response',
    // players
    'player-breakdown', 'player-comparison', 'apm-stats', 'skill-usage',
    'sigil-relic-uptime', 'special-buffs',
    // roster
    'attendance-ledger', 'squad-composition', 'squad-comp-fight', 'fight-comp',
    // replay
    'replay',
];

describe('statsTaxonomy', () => {
    it('has 10 categories', () => {
        expect(STATS_CATEGORIES.map((c) => c.id)).toEqual([
            'overview', 'offense', 'defense', 'boons-strips', 'support-healing',
            'squad-cohesion', 'commander', 'players', 'roster', 'replay',
        ]);
    });

    it('contains every expected section exactly once', () => {
        expect([...ALL_SECTION_IDS].sort()).toEqual([...EXPECTED_SECTION_IDS].sort());
        expect(new Set(ALL_SECTION_IDS).size).toBe(ALL_SECTION_IDS.length);
    });

    it('maps every section to exactly one category', () => {
        for (const id of EXPECTED_SECTION_IDS) {
            const categoryId = SECTION_TO_CATEGORY.get(id);
            expect(categoryId, `section ${id} has no category`).toBeTruthy();
            const category = STATS_CATEGORIES.find((c) => c.id === categoryId)!;
            expect(category.sections.some((s) => s.id === id)).toBe(true);
        }
    });

    it('has a non-empty label, description, and icon for every category and section', () => {
        for (const c of STATS_CATEGORIES) {
            expect(c.label.length).toBeGreaterThan(0);
            expect(c.description.length).toBeGreaterThan(0);
            expect(c.icon).toBeTruthy();
            for (const s of c.sections) {
                expect(s.label.length, `label for ${s.id}`).toBeGreaterThan(0);
                expect(s.description.length, `description for ${s.id}`).toBeGreaterThan(0);
                expect(s.icon, `icon for ${s.id}`).toBeTruthy();
            }
        }
    });

    it('resolves every section id to its category', () => {
        for (const id of EXPECTED_SECTION_IDS) {
            expect(resolveSectionTarget(id)).toEqual({
                categoryId: SECTION_TO_CATEGORY.get(id),
                sectionId: id,
            });
        }
    });

    it('resolves legacy aliases', () => {
        expect(resolveSectionTarget('kdr')).toEqual({ categoryId: 'overview', sectionId: 'overview' });
        expect(resolveSectionTarget('report-top')).toEqual({ categoryId: 'overview', sectionId: 'overview' });
        // old group anchors from the pre-redesign TOC
        expect(resolveSectionTarget('commanders')).toEqual({ categoryId: 'commander', sectionId: 'commander-stats' });
        expect(resolveSectionTarget('squad-stats')).toEqual({ categoryId: 'squad-cohesion', sectionId: 'squad-damage-comparison' });
        expect(resolveSectionTarget('other')).toEqual({ categoryId: 'overview', sectionId: 'fight-diff-mode' });
        expect(resolveSectionTarget('map')).toEqual({ categoryId: 'replay', sectionId: 'replay' });
    });

    it('resolves category ids to their first real section', () => {
        expect(resolveSectionTarget('offense')).toEqual({ categoryId: 'offense', sectionId: 'offense-detailed' });
        expect(resolveSectionTarget('boons-strips')).toEqual({ categoryId: 'boons-strips', sectionId: 'boon-output' });
    });

    it('normalizes hash prefix, case, and URI encoding', () => {
        expect(resolveSectionTarget('#On-Tag-Review')).toEqual({ categoryId: 'squad-cohesion', sectionId: 'on-tag-review' });
        expect(resolveSectionTarget(encodeURIComponent('boon-uptime'))).toEqual({ categoryId: 'boons-strips', sectionId: 'boon-uptime' });
    });

    it('returns null for unknown anchors', () => {
        expect(resolveSectionTarget('does-not-exist')).toBeNull();
        expect(resolveSectionTarget('')).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/statsTaxonomy.test.ts --maxWorkers=2`
Expected: FAIL — `Cannot find module '../statsTaxonomy'`.

- [ ] **Step 3: Implement `statsTaxonomy.ts`**

Create `src/renderer/stats/statsTaxonomy.ts`. Copy icon imports from `useStatsNavigation.ts:3-11` (lucide named imports + the 8 `ui/` icon components). Full content of the data (labels/icons match the current TOC where a section already had an entry; descriptions and keywords are new copy — use these verbatim):

```ts
import type { ComponentType } from 'react';
import { Trophy, Shield, ShieldAlert, ShieldOff, Zap, Map as MapIcon, Users, Skull, Star, HeartPulse, Keyboard, ListTree, BarChart3, ArrowBigUp, FileText, Swords, GitCompareArrows, Clock3, Target, Route, Waves, Flame, Crosshair, ArrowUpDown, Eraser, Play, LayoutGrid } from 'lucide-react';
import { CommanderTagIcon } from '../ui/CommanderTagIcon';
import { SupportPlusIcon } from '../ui/SupportPlusIcon';
import { Gw2ApmIcon } from '../ui/Gw2ApmIcon';
import { Gw2AegisIcon } from '../ui/Gw2AegisIcon';
import { Gw2BoonIcon } from '../ui/Gw2BoonIcon';
import { Gw2DamMitIcon } from '../ui/Gw2DamMitIcon';
import { Gw2FuryIcon } from '../ui/Gw2FuryIcon';
import { Gw2SigilIcon } from '../ui/Gw2SigilIcon';

export type StatsIcon = ComponentType<{ className?: string }>;

export interface StatsSectionMeta {
    id: string;
    label: string;
    icon: StatsIcon;
    description: string;
    keywords: readonly string[];
}

export interface StatsCategory {
    id: string;
    label: string;
    icon: StatsIcon;
    description: string;
    keywords: readonly string[];
    sections: readonly StatsSectionMeta[];
}

export const STATS_CATEGORIES: readonly StatsCategory[] = [
    {
        id: 'overview', label: 'Overview', icon: Trophy,
        description: 'The raid at a glance — outcomes, KDR, timeline, and standouts.',
        keywords: ['summary', 'kdr', 'kills', 'deaths'],
        sections: [
            { id: 'data-map', label: 'Data Map', icon: LayoutGrid, description: 'Directory of every category and section in this report.', keywords: ['index', 'directory', 'contents', 'guide'] },
            { id: 'overview', label: 'Overview', icon: Trophy, description: 'Kills, deaths, downs, and KDR for the session.', keywords: ['kdr', 'kill death ratio', 'summary'] },
            { id: 'fight-breakdown', label: 'Fight Breakdown', icon: Swords, description: 'Per-fight results: outcome, sizes, kills, and deaths.', keywords: ['fights', 'per fight', 'wins', 'losses'] },
            { id: 'fight-diff-mode', label: 'Fight Comparison', icon: GitCompareArrows, description: 'Compare two fights side by side across metrics.', keywords: ['compare fights', 'diff', 'versus'] },
            { id: 'timeline', label: 'Squad vs Enemy', icon: Users, description: 'Squad and enemy sizes across the session timeline.', keywords: ['squad size', 'enemy size', 'outnumbered'] },
            { id: 'map-distribution', label: 'Map Distribution', icon: MapIcon, description: 'Where the fights happened, by map.', keywords: ['maps', 'borderlands', 'ebg'] },
            { id: 'top-players', label: 'Top Players', icon: Trophy, description: 'Leaderboard of standout performances.', keywords: ['mvp', 'leaderboard', 'best'] },
            { id: 'top-skills-outgoing', label: 'Top Skills', icon: ArrowBigUp, description: 'Highest-impact outgoing skills across the squad.', keywords: ['skills used', 'damage skills'] },
            { id: 'top-skills-incoming', label: 'Top Incoming Skills', icon: ArrowBigUp, description: 'Enemy skills that hurt the squad the most.', keywords: ['skills taken', 'incoming skills', 'killed by'] },
        ],
    },
    {
        id: 'offense', label: 'Offense', icon: Swords,
        description: 'Outgoing damage — totals, breakdowns, spikes, modifiers, conditions.',
        keywords: ['damage', 'dps', 'attack'],
        sections: [
            { id: 'offense-detailed', label: 'Offense Detailed', icon: Swords, description: 'Full offensive stat table per player: damage, down contribution, CC, crits.', keywords: ['down contribution', 'cc', 'interrupts', 'critical', 'kills'] },
            { id: 'damage-breakdown', label: 'Damage Breakdown', icon: BarChart3, description: 'Damage split by type and target.', keywords: ['power', 'condition damage'] },
            { id: 'all-damage', label: 'All Damage', icon: Flame, description: 'Total damage view including all sources.', keywords: ['total damage'] },
            { id: 'spike-damage', label: 'Spike Damage', icon: Zap, description: 'Burst windows — who contributes when it matters.', keywords: ['burst', 'spike'] },
            { id: 'damage-modifiers', label: 'Damage Modifiers', icon: Flame, description: 'Outgoing damage modifier uptimes and contributions.', keywords: ['modifiers', 'multipliers'] },
            { id: 'conditions-outgoing', label: 'Conditions', icon: Skull, description: 'Outgoing condition applications per player.', keywords: ['condi', 'burning', 'torment', 'confusion', 'immobilize'] },
        ],
    },
    {
        id: 'defense', label: 'Defense', icon: Shield,
        description: 'Incoming damage and how it was absorbed, avoided, or mitigated.',
        keywords: ['survivability', 'tanking'],
        sections: [
            { id: 'defense-detailed', label: 'Defense Detailed', icon: Shield, description: 'Full defensive stat table: damage taken, downs, deaths, dodges.', keywords: ['damage taken', 'deaths', 'downs', 'dodges'] },
            { id: 'incoming-strike-damage', label: 'Incoming Strike Damage', icon: ShieldAlert, description: 'Incoming pressure over time and per player.', keywords: ['pressure', 'focused'] },
            { id: 'incoming-damage-modifiers', label: 'Incoming Modifiers', icon: ShieldOff, description: 'Incoming damage modifier uptimes.', keywords: ['damage reduction'] },
            { id: 'defense-mitigation', label: 'Damage Mitigation', icon: Gw2DamMitIcon, description: 'Blocks, evades, misses, invulns — avoided damage totals.', keywords: ['blocked', 'evaded', 'mitigated', 'avoided'] },
        ],
    },
    {
        id: 'boons-strips', label: 'Boons & Strips', icon: Gw2BoonIcon,
        description: 'Boon generation, uptime, stability, and boon removal both ways.',
        keywords: ['boons', 'buffs'],
        sections: [
            { id: 'boon-output', label: 'Boon Output', icon: Gw2BoonIcon, description: 'Boon generation per player to squad and subgroup.', keywords: ['might', 'quickness', 'alacrity', 'fury', 'protection', 'regeneration', 'swiftness', 'vigor', 'resistance', 'resolution', 'aegis', 'generation'] },
            { id: 'boon-uptime', label: 'Boon Uptime', icon: Gw2FuryIcon, description: 'Boon uptime percentages across the squad.', keywords: ['uptime'] },
            { id: 'all-boons', label: 'All Boons', icon: Gw2BoonIcon, description: 'Every boon in one combined table.', keywords: ['boon table'] },
            { id: 'boon-timeline', label: 'Boon Timeline', icon: Gw2AegisIcon, description: 'Boon coverage over the course of each fight.', keywords: ['timeline', 'coverage'] },
            { id: 'stab-performance', label: 'Stab Performance', icon: Shield, description: 'Stability coverage in the moments it matters.', keywords: ['stability', 'stab'] },
            { id: 'boon-strip-comparison', label: 'Boon Strips', icon: Eraser, description: 'Strips and corrupts — squad versus enemy.', keywords: ['strips', 'corrupts', 'removal'] },
            { id: 'strip-spikes', label: 'Strip Spikes', icon: Eraser, description: 'Strip burst windows and down contribution from strips.', keywords: ['strip burst'] },
        ],
    },
    {
        id: 'support-healing', label: 'Support & Healing', icon: SupportPlusIcon,
        description: 'Cleanses, stun breaks, resurrects, healing, and barrier.',
        keywords: ['support', 'healer'],
        sections: [
            { id: 'support-detailed', label: 'Support Detailed', icon: SupportPlusIcon, description: 'Cleanses, strips, stun breaks, and resurrects per player.', keywords: ['cleanses', 'condition cleanse', 'stun breaks', 'resurrects', 'res'] },
            { id: 'healing-stats', label: 'Healing Stats', icon: HeartPulse, description: 'Healing and barrier output per player.', keywords: ['healing', 'hps', 'barrier'] },
            { id: 'healing-breakdown', label: 'Healing Breakdown', icon: ListTree, description: 'Healing split by skill for each player.', keywords: ['healing skills'] },
            { id: 'heal-effectiveness', label: 'Heal Effectiveness', icon: Waves, description: 'How much healing landed versus was wasted.', keywords: ['effective healing', 'overheal'] },
        ],
    },
    {
        id: 'squad-cohesion', label: 'Squad Cohesion', icon: Users,
        description: 'How tightly the squad moved and fought together around the tag.',
        keywords: ['cohesion', 'positioning', 'together'],
        sections: [
            { id: 'on-tag-review', label: 'On Tag Review', icon: Skull, description: 'Death classification: on tag, off tag, and why.', keywords: ['deaths on tag', 'off tag', 'death review'] },
            { id: 'squad-distance-to-tag', label: 'Distance to Tag', icon: Crosshair, description: 'Average distance from the commander per player.', keywords: ['range from tag', 'closest to tag'] },
            { id: 'squad-distance-to-tag-visual', label: 'Distance to Tag Visual', icon: Crosshair, description: 'Visualized tag-distance distributions.', keywords: ['distance chart'] },
            { id: 'squad-tag-distance-deaths', label: 'Tag Distance Deaths', icon: Crosshair, description: 'Deaths correlated with distance from tag.', keywords: ['died far', 'range deaths'] },
            { id: 'squad-kill-pressure', label: 'Kill Pressure', icon: Target, description: 'How well the squad converts pressure into kills.', keywords: ['focus', 'conversion'] },
            { id: 'squad-damage-comparison', label: 'Damage Comparison', icon: ArrowUpDown, description: 'Squad versus enemy damage exchanged per fight.', keywords: ['squad vs enemy damage'] },
        ],
    },
    {
        id: 'commander', label: 'Commander', icon: CommanderTagIcon,
        description: 'Tag-centric performance: pushes, conversions, movement, responses.',
        keywords: ['tag', 'driver', 'com'],
        sections: [
            { id: 'commander-stats', label: 'Commander Stats', icon: CommanderTagIcon, description: 'Core stats for each commander session.', keywords: ['commander'] },
            { id: 'commander-push-timing', label: 'Push Timing', icon: Clock3, description: 'How quickly pushes were called and executed.', keywords: ['engage', 'push'] },
            { id: 'commander-target-conversion', label: 'Target Conversion', icon: Target, description: 'Called targets converted into downs and kills.', keywords: ['calls', 'target calls'] },
            { id: 'commander-tag-movement', label: 'Tag Movement', icon: Route, description: 'Movement patterns of the tag across fights.', keywords: ['kiting', 'pathing'] },
            { id: 'commander-tag-death-response', label: 'Tag Death Response', icon: Skull, description: 'What the squad did when the tag went down.', keywords: ['tag died', 'response'] },
        ],
    },
    {
        id: 'players', label: 'Players', icon: Users,
        description: 'Individual performance: drilldowns, comparisons, APM, and gear.',
        keywords: ['player', 'individual', 'me'],
        sections: [
            { id: 'player-breakdown', label: 'Player Breakdown', icon: ListTree, description: 'Per-player skill damage drilldown.', keywords: ['per player', 'drilldown', 'my stats'] },
            { id: 'player-comparison', label: 'Player Comparison', icon: Users, description: 'Compare two players side by side.', keywords: ['compare players', 'versus'] },
            { id: 'apm-stats', label: 'APM Breakdown', icon: Gw2ApmIcon, description: 'Actions per minute with and without autos/procs.', keywords: ['actions per minute', 'casts', 'apm'] },
            { id: 'skill-usage', label: 'Skill Usage', icon: Keyboard, description: 'Cast counts per skill per player.', keywords: ['rotations', 'casts', 'skill counts'] },
            { id: 'sigil-relic-uptime', label: 'Sigil/Relic Uptime', icon: Gw2SigilIcon, description: 'Gear proc and sigil/relic uptimes.', keywords: ['gear', 'sigils', 'relics'] },
            { id: 'special-buffs', label: 'Special Buffs', icon: Star, description: 'Food, utilities, and special buff coverage.', keywords: ['food', 'utility', 'consumables'] },
        ],
    },
    {
        id: 'roster', label: 'Roster', icon: FileText,
        description: 'Who showed up, on what class, and how composition shifted.',
        keywords: ['attendance', 'composition', 'squad'],
        sections: [
            { id: 'attendance-ledger', label: 'Attendance Ledger', icon: FileText, description: 'Participation ledger across the session.', keywords: ['attendance', 'showed up', 'participation'] },
            { id: 'squad-composition', label: 'Classes', icon: Users, description: 'Profession distribution of the squad.', keywords: ['professions', 'classes', 'comp'] },
            { id: 'squad-comp-fight', label: 'Squad Comp by Fight', icon: Users, description: 'Composition fight by fight.', keywords: ['comp per fight'] },
            { id: 'fight-comp', label: 'Fight Comp', icon: Swords, description: 'Squad and enemy composition for each fight.', keywords: ['enemy comp'] },
        ],
    },
    {
        id: 'replay', label: 'Replay', icon: Play,
        description: 'Animated map replay of every fight with positions and events.',
        keywords: ['map', 'positions', 'playback'],
        sections: [
            { id: 'replay', label: 'Replay', icon: Play, description: 'Fight-by-fight animated positional replay.', keywords: ['replay', 'movie', 'movement'] },
        ],
    },
];

export const ALL_SECTION_IDS: readonly string[] = STATS_CATEGORIES.flatMap((c) => c.sections.map((s) => s.id));

export const SECTION_TO_CATEGORY: ReadonlyMap<string, string> = new Map(
    STATS_CATEGORIES.flatMap((c) => c.sections.map((s) => [s.id, c.id] as const))
);

// Anchors that are not (or are no longer) real section ids.
// Old group anchors point at the first section of the nearest new home.
export const LEGACY_ALIASES: ReadonlyMap<string, string> = new Map([
    ['kdr', 'overview'],
    ['report-top', 'overview'],
    ['commanders', 'commander-stats'],
    ['squad-stats', 'squad-damage-comparison'],
    ['roster', 'attendance-ledger'],
    ['other', 'fight-diff-mode'],
    ['map', 'replay'],
]);

export function getCategory(categoryId: string): StatsCategory | undefined {
    return STATS_CATEGORIES.find((c) => c.id === categoryId);
}

export function resolveSectionTarget(anchor: string): { categoryId: string; sectionId: string } | null {
    let raw = (anchor || '').replace(/^#/, '').trim();
    if (!raw) return null;
    try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
    const normalized = raw.toLowerCase();

    const aliased = LEGACY_ALIASES.get(normalized);
    const sectionId = aliased ?? normalized;

    const categoryId = SECTION_TO_CATEGORY.get(sectionId);
    if (categoryId) return { categoryId, sectionId };

    // Category anchors (e.g. '#offense') land on the category's first real section
    // ('data-map' is skipped so '#overview'-adjacent anchors go to actual content).
    const category = getCategory(normalized);
    if (category) {
        const first = category.sections.find((s) => s.id !== 'data-map') ?? category.sections[0];
        if (first) return { categoryId: category.id, sectionId: first.id };
    }
    return null;
}
```

Note: `roster` appears in `LEGACY_ALIASES` **and** is a category id — the alias wins (checked first), and both resolve into the `roster` category, so behavior is identical; the alias entry documents the old group anchor explicitly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/__tests__/statsTaxonomy.test.ts --maxWorkers=2`
Expected: PASS (all 9 tests).

- [ ] **Step 5: Validate and commit**

Run: `npm run validate`
Expected: clean.

```bash
git add src/renderer/stats/statsTaxonomy.ts src/renderer/stats/__tests__/statsTaxonomy.test.ts
git commit -m "feat: add stats taxonomy module with section resolver"
```

---

### Task 2: Store rename (`activeCategory`) + delete dead lazy-group machinery

**Files:**
- Modify: `src/renderer/stats/statsStore.ts` (lines 20-21, 43-44, 70-71, 97-102)
- Delete: `src/renderer/stats/hooks/useLazyGroups.ts`, `src/renderer/stats/__tests__/useLazyGroups.test.ts`
- Modify: `src/renderer/StatsView.tsx` (lines 17, 263-265, 504, 526, 538, 2792-2795, 4238, 4258 — all `activeNavGroup`/`useLazyGroups`/`groupResizeRef` usages)
- Modify: `src/renderer/stats/StatsNavSidebar.tsx` (lines 27-28)
- Modify: `src/renderer/stats/__tests__/statsStore.test.ts`

**Interfaces:**
- Produces: `useStatsStore` state `activeCategory: string` (default `'overview'`) and `setActiveCategory(categoryId: string): void`. `groupHeights`/`setGroupHeight` are **gone**. All later tasks use these names.
- Consumes: nothing new. Old group ids (`'commanders'`, `'map'`, …) are still the live values in the store until Task 5 — this task is a rename, not a regrouping.

- [ ] **Step 1: Update the store test**

In `src/renderer/stats/__tests__/statsStore.test.ts`: rename every `activeNavGroup` → `activeCategory`, `setActiveNavGroup` → `setActiveCategory`; delete any test cases covering `groupHeights`/`setGroupHeight`. Add (if not present after rename):

```ts
it('defaults activeCategory to overview and updates it', () => {
    expect(useStatsStore.getState().activeCategory).toBe('overview');
    useStatsStore.getState().setActiveCategory('defense');
    expect(useStatsStore.getState().activeCategory).toBe('defense');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/statsStore.test.ts --maxWorkers=2`
Expected: FAIL — `activeCategory` undefined.

- [ ] **Step 3: Apply the store change**

In `statsStore.ts`: rename `activeNavGroup` → `activeCategory` and `setActiveNavGroup` → `setActiveCategory` (interface, initial state, implementation). Delete `groupHeights` from state/interface/initialState and delete `setGroupHeight` entirely.

- [ ] **Step 4: Remove `useLazyGroups` and fix consumers**

1. Delete `src/renderer/stats/hooks/useLazyGroups.ts` and `src/renderer/stats/__tests__/useLazyGroups.test.ts`.
2. In `StatsView.tsx`:
   - Remove the import (line 17) and the hook call (lines 262-265). Replace with a direct store read next to the other store reads (~line 278): `const activeCategory = useStatsStore((s) => s.activeCategory);`
   - Rename all other `activeNavGroup` reads (2792-2795, 4238, 4258, and the group-render function around 526) to `activeCategory`.
   - Remove `ref={groupResizeRef(groupId)}` from the two wrapper divs (lines 504, 538) — keep the divs and `key`.
3. In `StatsNavSidebar.tsx` lines 27-28: `s.activeNavGroup` → `s.activeCategory`, `s.setActiveNavGroup` → `s.setActiveCategory`.
4. Search for stragglers: `grep -rn "activeNavGroup\|setActiveNavGroup\|useLazyGroups\|setGroupHeight\|groupHeights" src/` — must return nothing.

- [ ] **Step 5: Run tests + validate**

Run: `npx vitest run src/renderer/stats --maxWorkers=2` then `npm run validate`
Expected: PASS / clean. (App behavior unchanged: same grouping, same rendering.)

- [ ] **Step 6: Commit**

```bash
git add -A src/renderer/stats src/renderer/StatsView.tsx
git commit -m "refactor: rename activeNavGroup to activeCategory, drop dead group-height machinery"
```

---

### Task 3: Search index builder + matcher

**Files:**
- Create: `src/renderer/stats/search/searchIndex.ts`
- Test: `src/renderer/stats/search/__tests__/searchIndex.test.ts`

**Interfaces:**
- Consumes: `STATS_CATEGORIES`, `SECTION_TO_CATEGORY` from `../statsTaxonomy`; metric arrays from `../statsMetrics` (the re-export barrel).
- Produces (used by Task 6's palette):
  - `type SearchEntryType = 'section' | 'metric' | 'player'`
  - `interface SearchEntry { type: SearchEntryType; label: string; sublabel: string; categoryId: string; sectionId: string; metricId?: string; account?: string }`
  - `interface SearchIndexInput { players?: Array<{ account: string; displayName?: string; profession?: string }>; isSectionAllowed?: (sectionId: string) => boolean }`
  - `function buildSearchIndex(input?: SearchIndexInput): SearchEntry[]`
  - `function matchSearchIndex(index: SearchEntry[], query: string, limit?: number): SearchEntry[]` (default limit 12)

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/search/__tests__/searchIndex.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSearchIndex, matchSearchIndex } from '../searchIndex';

const PLAYERS = [
    { account: 'Ravi.1234', displayName: 'Ravi', profession: 'Firebrand' },
    { account: 'Bulwark.5678', displayName: 'Bulwark', profession: 'Spellbreaker' },
];

describe('buildSearchIndex', () => {
    it('indexes every taxonomy section except data-map', () => {
        const index = buildSearchIndex();
        const sections = index.filter((e) => e.type === 'section');
        expect(sections.some((e) => e.sectionId === 'on-tag-review')).toBe(true);
        expect(sections.some((e) => e.sectionId === 'data-map')).toBe(false);
    });

    it('indexes metrics with their home section', () => {
        const index = buildSearchIndex();
        const cleanses = index.find((e) => e.type === 'metric' && e.metricId === 'condiCleanse');
        expect(cleanses).toMatchObject({ sectionId: 'support-detailed', categoryId: 'support-healing' });
        const mitigation = index.find((e) => e.type === 'metric' && e.metricId === 'totalMitigation');
        expect(mitigation).toMatchObject({ sectionId: 'defense-mitigation', categoryId: 'defense' });
    });

    it('indexes players pointing at player-breakdown', () => {
        const index = buildSearchIndex({ players: PLAYERS });
        const ravi = index.find((e) => e.type === 'player' && e.account === 'Ravi.1234');
        expect(ravi).toMatchObject({ sectionId: 'player-breakdown', categoryId: 'players', label: 'Ravi' });
        expect(ravi!.sublabel).toContain('Firebrand');
    });

    it('filters everything by isSectionAllowed', () => {
        const index = buildSearchIndex({
            players: PLAYERS,
            isSectionAllowed: (id) => id !== 'support-detailed' && id !== 'player-breakdown',
        });
        expect(index.some((e) => e.sectionId === 'support-detailed')).toBe(false);
        expect(index.some((e) => e.type === 'player')).toBe(false);
    });

    it('omits players when none are provided', () => {
        expect(buildSearchIndex().some((e) => e.type === 'player')).toBe(false);
    });
});

describe('matchSearchIndex', () => {
    const index = buildSearchIndex({ players: PLAYERS });

    it('finds sections by keyword', () => {
        const results = matchSearchIndex(index, 'stab');
        expect(results[0]).toMatchObject({ type: 'section', sectionId: 'stab-performance' });
    });

    it('finds metrics by label', () => {
        const results = matchSearchIndex(index, 'cleanse');
        expect(results.some((e) => e.type === 'metric' && e.metricId === 'condiCleanse')).toBe(true);
    });

    it('finds players by account and display name, case-insensitive', () => {
        expect(matchSearchIndex(index, 'ravi')[0]).toMatchObject({ type: 'player', account: 'Ravi.1234' });
        expect(matchSearchIndex(index, 'bulwark.5')[0]).toMatchObject({ type: 'player', account: 'Bulwark.5678' });
    });

    it('ranks label prefix matches above substring matches', () => {
        const results = matchSearchIndex(index, 'boon');
        const first = results[0];
        expect(first.label.toLowerCase().startsWith('boon')).toBe(true);
    });

    it('returns [] for empty or whitespace queries and respects the limit', () => {
        expect(matchSearchIndex(index, '   ')).toEqual([]);
        expect(matchSearchIndex(index, 'a', 5).length).toBeLessThanOrEqual(5);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/renderer/stats/search/__tests__/searchIndex.test.ts --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `searchIndex.ts`**

```ts
import { STATS_CATEGORIES, SECTION_TO_CATEGORY } from '../statsTaxonomy';
import {
    OFFENSE_METRICS, DEFENSE_METRICS, DAMAGE_MITIGATION_METRICS,
    SUPPORT_METRICS, HEALING_METRICS,
} from '../statsMetrics';

export type SearchEntryType = 'section' | 'metric' | 'player';

export interface SearchEntry {
    type: SearchEntryType;
    label: string;
    sublabel: string;
    categoryId: string;
    sectionId: string;
    metricId?: string;
    account?: string;
    /** lowercase strings this entry is findable by */
    haystack: string[];
}

export interface SearchIndexInput {
    players?: Array<{ account: string; displayName?: string; profession?: string }>;
    isSectionAllowed?: (sectionId: string) => boolean;
}

const METRIC_HOMES: Array<{ metrics: Array<{ id: string; label: string }>; sectionId: string }> = [
    { metrics: OFFENSE_METRICS, sectionId: 'offense-detailed' },
    { metrics: DEFENSE_METRICS, sectionId: 'defense-detailed' },
    { metrics: DAMAGE_MITIGATION_METRICS, sectionId: 'defense-mitigation' },
    { metrics: SUPPORT_METRICS, sectionId: 'support-detailed' },
    { metrics: HEALING_METRICS, sectionId: 'healing-stats' },
];

export function buildSearchIndex(input: SearchIndexInput = {}): SearchEntry[] {
    const allowed = input.isSectionAllowed ?? (() => true);
    const entries: SearchEntry[] = [];

    for (const category of STATS_CATEGORIES) {
        for (const section of category.sections) {
            if (section.id === 'data-map') continue; // the data map is chrome, not content
            if (!allowed(section.id)) continue;
            entries.push({
                type: 'section',
                label: section.label,
                sublabel: category.label,
                categoryId: category.id,
                sectionId: section.id,
                haystack: [section.label, ...section.keywords, category.label, ...category.keywords]
                    .map((s) => s.toLowerCase()),
            });
        }
    }

    for (const { metrics, sectionId } of METRIC_HOMES) {
        if (!allowed(sectionId)) continue;
        const categoryId = SECTION_TO_CATEGORY.get(sectionId)!;
        const home = STATS_CATEGORIES.find((c) => c.id === categoryId)!
            .sections.find((s) => s.id === sectionId)!;
        for (const metric of metrics) {
            entries.push({
                type: 'metric',
                label: metric.label,
                sublabel: home.label,
                categoryId,
                sectionId,
                metricId: metric.id,
                haystack: [metric.label.toLowerCase(), metric.id.toLowerCase()],
            });
        }
    }

    if (input.players?.length && allowed('player-breakdown')) {
        const categoryId = SECTION_TO_CATEGORY.get('player-breakdown')!;
        const seen = new Set<string>();
        for (const p of input.players) {
            if (!p.account || seen.has(p.account)) continue;
            seen.add(p.account);
            const name = p.displayName || p.account;
            entries.push({
                type: 'player',
                label: name,
                sublabel: [p.account, p.profession].filter(Boolean).join(' · '),
                categoryId,
                sectionId: 'player-breakdown',
                account: p.account,
                haystack: [name.toLowerCase(), p.account.toLowerCase(), (p.profession || '').toLowerCase()].filter(Boolean),
            });
        }
    }

    return entries;
}

const TYPE_ORDER: Record<SearchEntryType, number> = { section: 0, metric: 1, player: 2 };

export function matchSearchIndex(index: SearchEntry[], query: string, limit = 12): SearchEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored: Array<{ entry: SearchEntry; score: number }> = [];
    for (const entry of index) {
        let score = Infinity;
        if (entry.label.toLowerCase().startsWith(q)) score = 0;
        else if (entry.haystack.some((h) => h.startsWith(q))) score = 1;
        else if (entry.haystack.some((h) => h.includes(q))) score = 2;
        if (score !== Infinity) scored.push({ entry, score });
    }
    scored.sort((a, b) =>
        a.score - b.score
        || TYPE_ORDER[a.entry.type] - TYPE_ORDER[b.entry.type]
        || a.entry.label.localeCompare(b.entry.label)
    );
    return scored.slice(0, limit).map((s) => s.entry);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/renderer/stats/search/__tests__/searchIndex.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/search
git commit -m "feat: universal search index builder and matcher"
```

---

### Task 4: DataMapSection component

**Files:**
- Create: `src/renderer/stats/sections/DataMapSection.tsx`
- Test: `src/renderer/stats/sections/__tests__/DataMapSection.test.tsx`

**Interfaces:**
- Consumes: `STATS_CATEGORIES` from `../statsTaxonomy`.
- Produces: `DataMapSection({ onNavigate, isSectionAllowed }: { onNavigate: (categoryId: string, sectionId: string) => void; isSectionAllowed?: (id: string) => boolean })` — mounted by Task 5. It renders a card per category (skipping categories with no allowed sections and never listing `data-map` itself).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/sections/__tests__/DataMapSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataMapSection } from '../DataMapSection';
import { STATS_CATEGORIES } from '../../statsTaxonomy';

describe('DataMapSection', () => {
    it('renders one card per category with its description', () => {
        render(<DataMapSection onNavigate={() => {}} />);
        for (const category of STATS_CATEGORIES) {
            expect(screen.getByText(category.description)).toBeTruthy();
        }
    });

    it('lists section labels and navigates on click', () => {
        const onNavigate = vi.fn();
        render(<DataMapSection onNavigate={onNavigate} />);
        fireEvent.click(screen.getByRole('button', { name: /On Tag Review/i }));
        expect(onNavigate).toHaveBeenCalledWith('squad-cohesion', 'on-tag-review');
    });

    it('does not list the data map itself', () => {
        render(<DataMapSection onNavigate={() => {}} />);
        expect(screen.queryByRole('button', { name: /^Data Map$/i })).toBeNull();
    });

    it('hides categories whose sections are all disallowed', () => {
        render(
            <DataMapSection
                onNavigate={() => {}}
                isSectionAllowed={(id) => !id.startsWith('commander')}
            />
        );
        expect(screen.queryByText(STATS_CATEGORIES.find((c) => c.id === 'commander')!.description)).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/renderer/stats/sections/__tests__/DataMapSection.test.tsx --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/renderer/stats/sections/DataMapSection.tsx`. Style with the same CSS-variable idiom the section components use (`var(--bg-card)`, `var(--border-default)`, `var(--text-secondary)`, `var(--brand-primary)`) — check `AttendanceSection.tsx` for the local card conventions before writing markup:

```tsx
import { STATS_CATEGORIES } from '../statsTaxonomy';

export interface DataMapSectionProps {
    onNavigate: (categoryId: string, sectionId: string) => void;
    isSectionAllowed?: (id: string) => boolean;
}

export function DataMapSection({ onNavigate, isSectionAllowed }: DataMapSectionProps) {
    const allowed = isSectionAllowed ?? (() => true);
    return (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {STATS_CATEGORIES.map((category) => {
                const sections = category.sections.filter((s) => s.id !== 'data-map' && allowed(s.id));
                if (sections.length === 0) return null;
                const CategoryIcon = category.icon;
                return (
                    <div
                        key={category.id}
                        className="rounded-[4px] border p-3 flex flex-col gap-2"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}
                    >
                        <div className="flex items-center gap-2">
                            <CategoryIcon className="w-4 h-4 text-[color:var(--brand-primary)]" />
                            <span className="text-xs font-semibold uppercase tracking-[0.18em]">{category.label}</span>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{category.description}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {sections.map((section) => (
                                <button
                                    key={section.id}
                                    type="button"
                                    title={section.description}
                                    onClick={() => onNavigate(category.id, section.id)}
                                    className="text-[11px] px-2 py-1 rounded-sm border hover:bg-[var(--bg-hover)]"
                                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                                >
                                    {section.label}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 4: Run to verify it passes, validate, commit**

Run: `npx vitest run src/renderer/stats/sections/__tests__/DataMapSection.test.tsx --maxWorkers=2` then `npm run validate`

```bash
git add src/renderer/stats/sections/DataMapSection.tsx src/renderer/stats/sections/__tests__/DataMapSection.test.tsx
git commit -m "feat: data map landing section listing every category"
```

---

### Task 5: Switch StatsView + navigation hook to the taxonomy

This is the regrouping task. After it, the desktop app shows the 10 new categories.

**Files:**
- Modify: `src/renderer/stats/hooks/useStatsNavigation.ts` (replace `STATS_TOC_GROUPS` with a taxonomy adapter; delete the wheel-hijack)
- Modify: `src/renderer/StatsView.tsx` (re-slot the per-group section-element arrays to the new category ids; mount `DataMapSection`; rename the `'map'` special case to `'replay'`)
- Modify: `src/renderer/stats/StatsNavSidebar.tsx` (no code change expected — it reads `STATS_TOC_GROUPS`, which this task redefines; verify only)
- Test: `src/renderer/__tests__/StatsViewTaxonomy.integration.test.tsx` (new)

**Interfaces:**
- Consumes: `STATS_CATEGORIES`, `getCategory` (Task 1); `activeCategory`/`setActiveCategory` (Task 2); `DataMapSection` (Task 4).
- Produces: `STATS_TOC_GROUPS` remains exported from `useStatsNavigation.ts` but is now **derived**: `StatsTocGroup[]` built from `STATS_CATEGORIES` (`sectionIds` = section ids, `items` = `{id, label, icon}`). `useStatsNavigation` keeps its return shape but drops the wheel handler and gains `activateCategory(categoryId: string): void` and `jumpToSection(sectionId: string): void` (resolve category via `SECTION_TO_CATEGORY`, activate, then retry-scroll). Web/History pick up the new grouping automatically wherever they consume `STATS_TOC_GROUPS`.

- [ ] **Step 1: Write the failing integration test**

Create `src/renderer/__tests__/StatsViewTaxonomy.integration.test.tsx`. Model setup on the existing `src/renderer/__tests__/StatsView.integration.test.tsx` (reuse its fixture/props scaffolding — read it first and copy its mock/log setup verbatim). The new assertions:

```tsx
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useStatsStore } from '../stats/statsStore';
import { STATS_CATEGORIES } from '../stats/statsTaxonomy';
// + the same StatsView render helper/fixtures as StatsView.integration.test.tsx

describe('StatsView taxonomy integrity', () => {
    it('renders every taxonomy section id in its category (desktop mode)', async () => {
        const { container } = renderStatsViewWithFixtures(); // helper copied from existing integration test
        for (const category of STATS_CATEGORIES) {
            useStatsStore.getState().setActiveCategory(category.id);
            await waitFor(() => {
                for (const section of category.sections) {
                    expect(
                        container.querySelector(`#${CSS.escape(section.id)}`),
                        `missing #${section.id} in category ${category.id}`
                    ).toBeTruthy();
                }
            });
        }
    });
});
```

If the existing integration test's fixture path makes full rendering impractical for some sections (e.g. replay needs replay data), the test may assert `id` presence on the section *anchor* elements (`SectionPanel` renders `id={s.id}` wrappers) rather than section content — anchors must exist regardless of data.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/renderer/__tests__/StatsViewTaxonomy.integration.test.tsx --maxWorkers=2`
Expected: FAIL — categories like `boons-strips` don't exist yet, `data-map` isn't rendered.

- [ ] **Step 3: Rewrite `useStatsNavigation.ts`**

1. Delete the hand-written `STATS_TOC_GROUPS` literal (lines 29-153) and the icon imports it needed. Replace with:

```ts
import { STATS_CATEGORIES, SECTION_TO_CATEGORY } from '../statsTaxonomy';

export type StatsTocIcon = ComponentType<{ className?: string }>;
export interface StatsTocItem { id: string; label: string; icon: StatsTocIcon }
export interface StatsTocGroup { id: string; label: string; icon: StatsTocIcon; sectionIds: readonly string[]; items: readonly StatsTocItem[] }

export const STATS_TOC_GROUPS: readonly StatsTocGroup[] = STATS_CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    icon: c.icon,
    sectionIds: c.sections.map((s) => s.id),
    items: c.sections.map((s) => ({ id: s.id, label: s.label, icon: s.icon })),
}));
```

2. Delete the wheel-hijack effect (`useStatsNavigation.ts:187-226`) and its refs (`scrollRafRef`, `scrollDeltaRef`).
3. Keep `scrollToSection`, `stepSection`, and the within-container scroll tracking effect (lines 235-265) — but scope `tocItems` for tracking to the **active category only**: read `activeCategory` from `useStatsStore` inside the hook and compute `const activeItems = tocGroups.find((g) => g.id === activeCategory)?.items ?? []`, using `activeItems` in the tracking effect and `stepSection`.
4. Add and export from the hook's return:

```ts
const activateCategory = (categoryId: string) => {
    useStatsStore.getState().setActiveCategory(categoryId);
};

const jumpToSection = (sectionId: string) => {
    const categoryId = SECTION_TO_CATEGORY.get(sectionId);
    if (categoryId) activateCategory(categoryId);
    // Retry loop: the category's sections may not be committed yet.
    let attempts = 0;
    const tryScroll = () => {
        const node = document.getElementById(sectionId);
        if (node) { scrollToSection(sectionId); return; }
        if (attempts++ < 20) window.setTimeout(() => requestAnimationFrame(tryScroll), 40);
    };
    requestAnimationFrame(tryScroll);
};
```

5. `stepSection` at a category boundary moves to the adjacent category: if `nextIndex` runs past `activeItems`, call `activateCategory` on the previous/next group id and `jumpToSection` on its last/first item.

- [ ] **Step 4: Re-slot StatsView's section elements to the new category ids**

In `StatsView.tsx`, the per-group render arrays start at ~line 4725 (`{ id: 'overview', element: <OverviewSection ... /> }` and onward, grouped under the old group keys). Re-key the group containers to the ten new category ids and move each `{ id, element }` entry to its spec home. Exact target layout (every entry, by category key):

- `overview`: `data-map` (new — see below), `overview`, `fight-breakdown`, `fight-diff-mode`, `timeline`, `map-distribution`, `top-players`, `top-skills-outgoing` (keep its `!noEgoMode` guard), `top-skills-incoming`
- `offense`: `offense-detailed`, `damage-breakdown`, `all-damage`, `spike-damage`, `damage-modifiers`, `conditions-outgoing`
- `defense`: `defense-detailed`, `incoming-strike-damage`, `incoming-damage-modifiers`, `defense-mitigation`
- `boons-strips`: `boon-output`, `boon-uptime`, `all-boons`, `boon-timeline`, `stab-performance`, `boon-strip-comparison`, `strip-spikes`
- `support-healing`: `support-detailed`, `healing-stats`, `healing-breakdown`, `heal-effectiveness`
- `squad-cohesion`: `on-tag-review`, `squad-distance-to-tag`, `squad-distance-to-tag-visual`, `squad-tag-distance-deaths`, `squad-kill-pressure`, `squad-damage-comparison`
- `commander`: `commander-stats`, `commander-push-timing`, `commander-target-conversion`, `commander-tag-movement`, `commander-tag-death-response`
- `players`: `player-breakdown`, `player-comparison` (keep its `!noEgoMode` guard), `apm-stats`, `skill-usage`, `sigil-relic-uptime`, `special-buffs`
- `roster`: `attendance-ledger`, `squad-composition`, `squad-comp-fight`, `fight-comp`
- `replay`: `replay`

The `data-map` entry:

```tsx
{ id: 'data-map', element: <DataMapSection
    onNavigate={(categoryId, sectionId) => { useStatsStore.getState().setActiveCategory(categoryId); jumpToSection(sectionId); }}
    isSectionAllowed={isSectionVisible}
/> },
```

(`jumpToSection` comes from the `useStatsNavigation` destructure at line ~764 — extend that destructure.)

Also in this step:
- Rename the full-bleed special case `activeCategory === 'map'` (lines 4238, 4258) to `activeCategory === 'replay'`.
- Confirm nothing else keys off old group ids: `grep -n "'commanders'\|'squad-stats'\|'other'\|'map'" src/renderer/StatsView.tsx src/renderer/stats/` — fix any straggler (expect the two renamed lines only).

- [ ] **Step 5: Run the new integration test + full stats suite**

Run: `npx vitest run src/renderer/__tests__/StatsViewTaxonomy.integration.test.tsx src/renderer/__tests__/StatsView.integration.test.tsx src/renderer/stats --maxWorkers=2`
Expected: PASS. If the old integration test asserts old group names/ids, update those assertions to the new taxonomy (that is expected fallout, not a regression).

- [ ] **Step 6: Manual smoke check (desktop)**

Run: `npm run dev` briefly — confirm: 10 groups in the sidebar, Data Map cards render at the top of Overview and clicking a card chip switches category and scrolls, Replay still gets its full-height page.

- [ ] **Step 7: Validate and commit**

```bash
npm run validate
git add -A src/renderer
git commit -m "feat: regroup stats into 10-category taxonomy with data map landing"
```

---

### Task 6: SearchPalette + jump/highlight behavior

**Files:**
- Create: `src/renderer/stats/search/SearchPalette.tsx`
- Create: `src/renderer/stats/search/useSearchJump.ts`
- Modify: `src/renderer/StatsView.tsx` (mount palette; build index inputs)
- Test: `src/renderer/stats/search/__tests__/SearchPalette.test.tsx`

**Interfaces:**
- Consumes: `buildSearchIndex`/`matchSearchIndex`/`SearchEntry` (Task 3); `SECTION_TO_CATEGORY` (Task 1).
- Produces:
  - `SearchPalette({ open, onClose, index, onSelect }: { open: boolean; onClose: () => void; index: SearchEntry[]; onSelect: (entry: SearchEntry) => void })` — pure presentational + keyboard handling; hosts decide state.
  - `useSearchJump({ onRequestCategory }: { onRequestCategory: (categoryId: string) => void }): { jumpToEntry: (entry: SearchEntry) => void }` — activates the category, retry-scrolls to the target element, applies a flash highlight.
  - Flash CSS class name: `axi-search-flash` (keyframed style injected by the palette via a `<style>` tag so it works in web builds without css-import archaeology).
  - Target element conventions (Task 7 adds the attributes): metric → `[data-metric-key="<metricId>"]` inside `#<sectionId>`; player → `[data-player-account="<account>"]`; fallback for both → the `#<sectionId>` element.

- [ ] **Step 1: Write the failing component test**

Create `src/renderer/stats/search/__tests__/SearchPalette.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchPalette } from '../SearchPalette';
import { buildSearchIndex } from '../searchIndex';

const INDEX = buildSearchIndex({ players: [{ account: 'Ravi.1234', displayName: 'Ravi', profession: 'Firebrand' }] });

describe('SearchPalette', () => {
    it('renders nothing when closed', () => {
        const { container } = render(<SearchPalette open={false} onClose={() => {}} index={INDEX} onSelect={() => {}} />);
        expect(container.querySelector('input')).toBeNull();
    });

    it('shows grouped results as the user types', () => {
        render(<SearchPalette open onClose={() => {}} index={INDEX} onSelect={() => {}} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'stab' } });
        expect(screen.getByText('Stab Performance')).toBeTruthy();
    });

    it('selects with Enter and arrow keys', () => {
        const onSelect = vi.fn();
        render(<SearchPalette open onClose={() => {}} index={INDEX} onSelect={onSelect} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'ravi' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ account: 'Ravi.1234' }));
    });

    it('closes on Escape', () => {
        const onClose = vi.fn();
        render(<SearchPalette open onClose={onClose} index={INDEX} onSelect={() => {}} />);
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/renderer/stats/search/__tests__/SearchPalette.test.tsx --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SearchPalette.tsx`**

Overlay palette (fixed, centered, max-w-lg, backdrop). Controlled input; `matchSearchIndex(index, query)`; results grouped by type with headers "Sections" / "Metrics" / "Players"; arrow keys move an `activeIdx`, Enter fires `onSelect(results[activeIdx])` then `onClose()`, Escape fires `onClose()`. Result rows show `entry.label` + `entry.sublabel` and the section icon for section entries. Style with existing CSS variables (`var(--bg-card)`, `var(--border-default)`, `var(--bg-hover)` for the active row background is fine — it's a hover/active state, not a resting background). Include the flash CSS in the component:

```tsx
const FLASH_STYLE = `
@keyframes axiSearchFlash {
  0% { box-shadow: 0 0 0 3px var(--brand-primary); }
  100% { box-shadow: 0 0 0 3px transparent; }
}
.axi-search-flash { animation: axiSearchFlash 1.6s ease-out 2; border-radius: 4px; }
`;
// rendered once when open: <style>{FLASH_STYLE}</style>
```

- [ ] **Step 4: Implement `useSearchJump.ts`**

```ts
import type { SearchEntry } from './searchIndex';

export function useSearchJump({ onRequestCategory }: { onRequestCategory: (categoryId: string) => void }) {
    const jumpToEntry = (entry: SearchEntry) => {
        onRequestCategory(entry.categoryId);
        let attempts = 0;
        const tick = () => {
            const sectionEl = document.getElementById(entry.sectionId);
            if (!sectionEl) {
                if (attempts++ < 20) window.setTimeout(() => requestAnimationFrame(tick), 40);
                return;
            }
            let target: Element = sectionEl;
            if (entry.type === 'metric' && entry.metricId) {
                target = sectionEl.querySelector(`[data-metric-key="${CSS.escape(entry.metricId)}"]`) ?? sectionEl;
            } else if (entry.type === 'player' && entry.account) {
                target = sectionEl.querySelector(`[data-player-account="${CSS.escape(entry.account)}"]`) ?? sectionEl;
            }
            target.scrollIntoView({ behavior: 'smooth', block: entry.type === 'section' ? 'start' : 'center' });
            target.classList.remove('axi-search-flash');
            // reflow so re-adding restarts the animation
            void (target as HTMLElement).offsetWidth;
            target.classList.add('axi-search-flash');
            window.setTimeout(() => target.classList.remove('axi-search-flash'), 3400);
        };
        requestAnimationFrame(tick);
    };
    return { jumpToEntry };
}
```

- [ ] **Step 5: Mount in StatsView (all modes — desktop, embedded History, embedded web)**

In `StatsView.tsx`:

1. Add an optional prop to `StatsViewProps`: `onRequestCategory?: (categoryId: string) => void;` — default behavior (desktop) is `useStatsStore.getState().setActiveCategory`.
2. Palette state + shortcut + index (place near the other hook wiring ~line 764):

```tsx
const [searchOpen, setSearchOpen] = useState(false);
const searchExcluded = useMemo(() => new Set(noEgoMode ? ['top-skills-outgoing', 'player-comparison'] : []), [noEgoMode]);
const searchIndex = useMemo(() => buildSearchIndex({
    players: safeStats.playerSkillBreakdowns ?? [],
    // Filtered ONLY by noEgo exclusions — deliberately NOT by the embedded
    // sectionVisibility fn, which is "active group only" (jumping changes the group).
    isSectionAllowed: (id) => !searchExcluded.has(id),
}), [safeStats.playerSkillBreakdowns, searchExcluded]);
const requestCategory = onRequestCategory ?? ((categoryId: string) => useStatsStore.getState().setActiveCategory(categoryId));
const { jumpToEntry } = useSearchJump({ onRequestCategory: requestCategory });

useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
}, []);
```

Important: the embedded index must NOT be filtered to the currently-active group (`sectionVisibility` in embedded mode is "active group only" — jumping changes the group). It is filtered only by `noEgoMode` exclusions; hosts that genuinely hide sections pass their own palette index later (web report task). Render `<SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} index={searchIndex} onSelect={jumpToEntry} />` near the root of StatsView's JSX, plus a small search button (magnifier icon, `title="Search (Ctrl+K)"`) in the dashboard header area toggling `searchOpen`.
3. For History: in `FightReportHistoryView.tsx`, pass `onRequestCategory={(id) => useStatsStore.getState().setActiveCategory(id)}` to the embedded StatsView — the sidebar it renders reads the same store, so its visibility follows.

- [ ] **Step 6: Run tests, validate, commit**

Run: `npx vitest run src/renderer/stats/search --maxWorkers=2 && npm run validate`

```bash
git add -A src/renderer
git commit -m "feat: universal search palette with jump-and-flash navigation"
```

---

### Task 7: Search target attributes (`data-metric-key`, `data-player-account`)

**Files:**
- Modify: `src/renderer/stats/sections/OffenseSection.tsx`, `DefenseSection.tsx`, `DamageMitigationSection.tsx`, `SupportSection.tsx`, `HealingSection.tsx`, `NoEgoMetricSection.tsx`, `PlayerBreakdownSection.tsx`
- Test: extend `src/renderer/stats/search/__tests__/SearchPalette.test.tsx` is NOT needed; instead add DOM assertions to the Task 5 integration test file.

**Interfaces:**
- Consumes: nothing new. Produces: DOM attributes matching Task 6's selector conventions.

- [ ] **Step 1: Write the failing integration assertions**

Append to `StatsViewTaxonomy.integration.test.tsx`:

```tsx
it('exposes data-metric-key targets in the five metric-home sections', async () => {
    const { container } = renderStatsViewWithFixtures();
    const cases: Array<[string, string, string]> = [
        ['offense', 'offense-detailed', 'downContribution'],
        ['defense', 'defense-detailed', 'damageTaken'],
        ['defense', 'defense-mitigation', 'totalMitigation'],
        ['support-healing', 'support-detailed', 'condiCleanse'],
        ['support-healing', 'healing-stats', 'healing'],
    ];
    for (const [categoryId, sectionId, metricId] of cases) {
        useStatsStore.getState().setActiveCategory(categoryId);
        await waitFor(() => {
            const section = container.querySelector(`#${CSS.escape(sectionId)}`);
            expect(section?.querySelector(`[data-metric-key="${metricId}"]`),
                `missing data-metric-key=${metricId} in #${sectionId}`).toBeTruthy();
        });
    }
});

it('exposes data-player-account rows in player breakdown', async () => {
    const { container } = renderStatsViewWithFixtures();
    useStatsStore.getState().setActiveCategory('players');
    await waitFor(() => {
        expect(container.querySelector('#player-breakdown [data-player-account]')).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run to verify the new assertions fail**

Run: `npx vitest run src/renderer/__tests__/StatsViewTaxonomy.integration.test.tsx --maxWorkers=2`
Expected: the two new tests FAIL.

- [ ] **Step 3: Add the attributes**

For each of the five metric-home sections, find where metric entries render as interactive elements (tabs/rows/headers). Locate render sites with: `grep -n "filteredMetrics.map\|selectedMetrics.map\|metrics.map" src/renderer/stats/sections/<File>.tsx` (also check `NoEgoMetricSection.tsx`, which renders the tab list for noEgo mode — its tab buttons get the attribute too). On the element rendered per metric, add `data-metric-key={metric.id}` (use whatever the map variable is named at that site). Multiple render modes may exist per section (dense table header, tab list, noEgo sidebar) — attribute **every** per-metric element; duplicate attributes across modes are fine since only one mode renders at a time.

In `PlayerBreakdownSection.tsx`, find the per-player row/card render (`grep -n "\.map((player\|\.map((row\|account" src/renderer/stats/sections/PlayerBreakdownSection.tsx`) and add `data-player-account={<rowVar>.account}` to the row container element.

- [ ] **Step 4: Run to verify green, validate, commit**

Run: `npx vitest run src/renderer/__tests__/StatsViewTaxonomy.integration.test.tsx --maxWorkers=2 && npm run validate`

```bash
git add src/renderer/stats/sections src/renderer/__tests__
git commit -m "feat: search jump targets on metric tabs and player rows"
```

---

### Task 8: CategoryBar + SectionSubnav replace StatsNavSidebar

**Files:**
- Create: `src/renderer/stats/CategoryBar.tsx`
- Create: `src/renderer/stats/SectionSubnav.tsx`
- Modify: `src/renderer/app/AppLayout.tsx:404` (swap mount)
- Modify: `src/renderer/FightReportHistoryView.tsx:450` (swap mount, keep visibility contract)
- Delete: `src/renderer/stats/StatsNavSidebar.tsx`
- Test: `src/renderer/stats/__tests__/CategoryBar.test.tsx`

**Interfaces:**
- Consumes: `STATS_CATEGORIES` (Task 1), `useStatsStore.activeCategory`/`setActiveCategory` (Task 2), `jumpToSection` convention (scroll handled by the component via `document.getElementById` + retry, same pattern as `StatsNavSidebar.tsx:56-73`).
- Produces:
  - `CategoryBar({ onSectionVisibilityChange, isSectionAllowed }: { onSectionVisibilityChange?: (fn: (id: string) => boolean) => void; isSectionAllowed?: (id: string) => boolean })` — the primary category nav, replacing the sidebar 1:1 in both mounts. It renders in each surface's **existing nav rail position** (vertical rail on desktop/History, existing sidebar/sheet on web) — the spec's "category bar" refers to categories being the first-class nav level, not to forcing a horizontal strip into shells built around a rail. Renders the 10 categories; the active category expands to show its `SectionSubnav`. Categories whose sections are all disallowed by `isSectionAllowed` are hidden.
  - `SectionSubnav({ category, activeSectionId, onSelect }: { category: StatsCategory; activeSectionId: string; onSelect: (sectionId: string) => void })`.
  - The `onSectionVisibilityChange` contract is preserved exactly (History's embedded StatsView depends on it): whenever the active category changes, push up `(id) => activeCategory.sectionIds.includes(id)`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/__tests__/CategoryBar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategoryBar } from '../CategoryBar';
import { useStatsStore } from '../statsStore';

beforeEach(() => {
    useStatsStore.setState({ activeCategory: 'overview' });
});

describe('CategoryBar', () => {
    it('renders all ten categories', () => {
        render(<CategoryBar />);
        for (const label of ['Overview', 'Offense', 'Defense', 'Boons & Strips', 'Support & Healing', 'Squad Cohesion', 'Commander', 'Players', 'Roster', 'Replay']) {
            expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeTruthy();
        }
    });

    it('activates a category on click and pushes visibility up', () => {
        const onVisibility = vi.fn();
        render(<CategoryBar onSectionVisibilityChange={onVisibility} />);
        fireEvent.click(screen.getByRole('button', { name: /Boons & Strips/i }));
        expect(useStatsStore.getState().activeCategory).toBe('boons-strips');
        const lastFn = onVisibility.mock.calls.at(-1)![0] as (id: string) => boolean;
        expect(lastFn('boon-uptime')).toBe(true);
        expect(lastFn('offense-detailed')).toBe(false);
    });

    it('shows the active category subnav sections', () => {
        useStatsStore.setState({ activeCategory: 'squad-cohesion' });
        render(<CategoryBar />);
        expect(screen.getByRole('button', { name: /On Tag Review/i })).toBeTruthy();
    });

    it('hides categories with no allowed sections', () => {
        render(<CategoryBar isSectionAllowed={(id) => !id.startsWith('commander')} />);
        expect(screen.queryByRole('button', { name: /Commander/i })).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/CategoryBar.test.tsx --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`CategoryBar.tsx`: structurally a rewrite of `StatsNavSidebar` (copy its shell: the hover-expand rail, motion config, CSS-variable styling, wheel `stopPropagation`) but data-driven from `STATS_CATEGORIES` with the active category's `SectionSubnav` always expanded (replacing the old openGroup accordion). Category click: `setActiveCategory(category.id)` + scroll to the category's first section (retry pattern copied from `StatsNavSidebar.tsx:56-73`). Section click: scroll to that id. Push visibility in an effect identical in shape to `StatsNavSidebar.tsx:47-54` but reading the active category from the store. `SectionSubnav.tsx` renders `category.sections` as the item buttons (same styling as the old subnav items block, `StatsNavSidebar.tsx:215-251`).

- [ ] **Step 4: Swap mounts and delete the old sidebar**

- `AppLayout.tsx:404`: `<StatsNavSidebar />` → `<CategoryBar />` (update import at line 10).
- `FightReportHistoryView.tsx:450`: `<StatsNavSidebar onSectionVisibilityChange={handleSectionVisibilityChange} />` → `<CategoryBar onSectionVisibilityChange={handleSectionVisibilityChange} />` (update import at line 8).
- Delete `src/renderer/stats/StatsNavSidebar.tsx`. Then `grep -rn "StatsNavSidebar" src/` — must be empty.

- [ ] **Step 5: Run tests + smoke + validate + commit**

Run: `npx vitest run src/renderer/stats --maxWorkers=2 && npm run validate`
Smoke (`npm run dev`): sidebar shows 10 categories; History view still filters its embedded report by the selected category.

```bash
git add -A src/renderer
git commit -m "feat: category bar + section subnav replace the stats sidebar"
```

---

### Task 9: Web report adoption (taxonomy nav, shared resolver, palette)

**Files:**
- Modify: `src/web/reportApp.tsx`:
  - Delete the hardcoded `navGroups` literal (line 681 through its closing `]), [...])` — verify the full extent before deleting) and derive from `STATS_TOC_GROUPS` (which is taxonomy-derived after Task 5).
  - Replace the hash resolution in `syncFromHash` (lines 905-940) with `resolveSectionTarget`.
  - Mount `SearchPalette` with a web-built index; wire `onRequestCategory` into the existing `setActiveGroup` + `startTransition` flow.
- Test: `src/web/__tests__/reportNavResolver.test.ts` (new — the pure parts)

**Interfaces:**
- Consumes: `resolveSectionTarget`, `STATS_CATEGORIES` (Task 1), `STATS_TOC_GROUPS` (Task 5), `buildSearchIndex`/`matchSearchIndex`/`SearchPalette`/`useSearchJump` (Tasks 3/6). All are imported today via relative paths like `../renderer/stats/...` (the web target already imports renderer stats modules — follow the existing import style in `reportApp.tsx`).
- Produces: web report navigation driven by the same taxonomy; `#<any historical anchor>` keeps working (`kdr`, `report-top`, old group ids, all section ids).

- [ ] **Step 1: Write the failing resolver-behavior test**

Create `src/web/__tests__/reportNavResolver.test.ts` — this pins the *web-specific* hash contract (`kdr`, `report-top`) through the shared resolver:

```ts
import { describe, it, expect } from 'vitest';
import { resolveSectionTarget } from '../../renderer/stats/statsTaxonomy';

describe('web report hash contract', () => {
    it('keeps historical web anchors working', () => {
        for (const [anchor, expected] of [
            ['kdr', 'overview'],
            ['report-top', 'overview'],
            ['on-tag-review', 'on-tag-review'],
            ['boon-uptime', 'boon-uptime'],
            ['squad-stats', 'squad-damage-comparison'],
        ] as const) {
            const target = resolveSectionTarget(anchor);
            expect(target?.sectionId, `anchor ${anchor}`).toBe(expected);
        }
    });
});
```

Run: `npx vitest run src/web/__tests__/reportNavResolver.test.ts --maxWorkers=2` — this passes already (Task 1 built it); it exists to freeze the web contract. The *failing* part of this task is manual/e2e (Step 4-5); the refactor below is behavior-preserving.

- [ ] **Step 2: Replace `navGroups` and `syncFromHash`**

1. `navGroups`: replace the literal with a memo over the taxonomy adapter, preserving the web-only KDR entry position (the web overview items historically start with KDR → the resolver alias covers the anchor; the visible item is no longer needed — drop it and let the first Overview item be `data-map`… **no**: web report should not show `data-map` as its first landing since `report-top` is the web landing; keep `data-map` in the list like any section). Concretely:

```tsx
const navGroups = useMemo(() => STATS_TOC_GROUPS.map((g) => ({ ...g, sectionIds: [...g.sectionIds], items: [...g.items] })), []);
```

Remove now-unused icon imports that only served the old literal (lint will flag them).
2. `syncFromHash` (905-940): replace the `navGroupByAnchor` lookup with:

```tsx
const target = resolveSectionTarget(raw);
if (!target) return;
setActiveGroup(target.categoryId);
setExpandedGroups(() => {
    const next: Record<string, boolean> = {};
    navGroups.forEach((group) => { next[group.id] = group.id === target.categoryId; });
    return next;
});
setActiveSectionId(target.sectionId);
pendingScrollIdRef.current = (raw.toLowerCase().replace(/^#/, '') === 'report-top') ? 'report-top' : target.sectionId;
```

Keep the `report-top` scroll-to-top special case in `scrollToSection`. Delete `navGroupByAnchor` (lines ~810-817) if nothing else consumes it (grep first).
3. Search: build the index from the report payload's players + the report's section-visibility settings (the web report renders all sections the publisher enabled; find the publisher's enabled-section config if one exists — if none, pass no `isSectionAllowed`). Players come from the same aggregation payload passed into the embedded StatsView (`precomputedStats.playerSkillBreakdowns` — follow the prop at `reportApp.tsx:1935` to its source variable). Mount:

```tsx
const { jumpToEntry } = useSearchJump({ onRequestCategory: (categoryId) => startTransition(() => setActiveGroup(categoryId)) });
// + Ctrl/⌘+K listener (same pattern as StatsView) + a magnifier button in the report header and in the mobile nav bar
<SearchPalette open={webSearchOpen} onClose={() => setWebSearchOpen(false)} index={webSearchIndex} onSelect={jumpToEntry} />
```

Note: StatsView also mounts a palette when embedded (Task 6). Two Ctrl+K listeners would double-toggle — in `reportApp.tsx` pass a new StatsView prop `disableSearchShortcut` (add it in this task: `StatsViewProps.disableSearchShortcut?: boolean`, guard the keydown effect) OR simpler: do NOT mount a second palette in reportApp and instead pass `onRequestCategory={(id) => startTransition(() => setActiveGroup(id))}` to the embedded StatsView, letting StatsView's own palette serve the web report. **Choose the second option** — one palette, one listener, and the web header/mobile magnifier buttons call a new optional StatsView prop `searchOpenRef`-free approach: add `StatsViewProps.onSearchAvailable?: (open: () => void) => void` so the host can register an opener (StatsView calls it once with `() => setSearchOpen(true)`).
4. Update the two sidebar render sites (desktop ~1675, mobile ~1764) only if they referenced fields dropped from the derived `navGroups` shape (they consume `id/label/icon/items` — unchanged).

- [ ] **Step 3: Unit-run + validate**

Run: `npx vitest run src/web src/renderer/stats --maxWorkers=2 && npm run validate`
Expected: PASS/clean. Fix any web test that asserted old group names.

- [ ] **Step 4: Manual web smoke**

Run: `npm run dev:web` with a dev dataset (`useDevDatasets` flow). Verify: 10 groups in the web sidebar; `#on-tag-review` and `#kdr` deep links resolve; Ctrl+K opens the palette; selecting "Stab Performance" switches group, scrolls, flashes; a player result lands on their Player Breakdown row; mobile viewport (narrow window) still navigates.

- [ ] **Step 5: Commit**

```bash
git add -A src/web src/renderer
git commit -m "feat: web report adopts taxonomy nav, shared hash resolver, and search palette"
```

---

### Task 10: Playwright e2e for the web report + final sweep

**Files:**
- Create: `tests/e2e-web/navigation-search.spec.ts` (place alongside existing web e2e specs — check `playwright.config` for the web test dir before creating; follow the existing spec file naming there)
- Modify: none expected

**Interfaces:** Consumes the running web report dev server (`npm run dev:web`, port 4173) exactly like existing `test:e2e:web` specs — copy the fixture/report bootstrap from an existing spec in that directory.

- [ ] **Step 1: Write the e2e spec**

```ts
import { test, expect } from '@playwright/test';

// Bootstrap: copy the report-loading setup from the existing web e2e specs verbatim.

test('legacy section deep link activates its new category', async ({ page }) => {
    await page.goto('/#boon-uptime');
    await expect(page.locator('#boon-uptime')).toBeVisible();
});

test('legacy kdr anchor still lands on overview', async ({ page }) => {
    await page.goto('/#kdr');
    await expect(page.locator('#overview')).toBeVisible();
});

test('search palette jumps to a section and flashes it', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await page.getByRole('textbox').fill('stab');
    await page.keyboard.press('Enter');
    await expect(page.locator('#stab-performance')).toBeVisible();
    await expect(page.locator('.axi-search-flash')).toHaveCount(1);
});

test('player search lands on their breakdown row', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const input = page.getByRole('textbox');
    await input.fill('.1'); // account names contain ".NNNN" — matches first player
    await page.keyboard.press('Enter');
    await expect(page.locator('#player-breakdown [data-player-account]').first()).toBeVisible();
});

test('mobile nav lists the ten categories', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    // Open the mobile nav via its existing toggle (copy the selector from the
    // current mobile e2e/web spec if one exists; otherwise locate the hamburger button).
    await page.getByRole('button', { name: /menu|sections|navigation/i }).first().click();
    for (const label of ['Overview', 'Boons & Strips', 'Squad Cohesion', 'Replay']) {
        await expect(page.getByRole('button', { name: new RegExp(label, 'i') }).first()).toBeVisible();
    }
});
```

Adjust the player-search query to a real account in the e2e fixture dataset (read the fixture to pick one; obfuscated fixture accounts are fine).

- [ ] **Step 2: Run the web e2e suite**

Run: `npm run test:e2e:web`
Expected: new spec PASSES alongside existing specs. Fix any existing e2e spec that asserted old group labels/anchors (expected fallout of the regrouping — update assertions, don't weaken them).

- [ ] **Step 3: Full verification sweep**

```bash
npx vitest run --maxWorkers=2
npm run validate
npm run audit:metrics   # must be unaffected — proves no metric-value changes
```
Expected: all green. If `npm run test:e2e:electron` is runnable in this environment, run it too; otherwise note it for CI.

- [ ] **Step 4: Update CLAUDE.md architecture notes + commit**

In the repo `CLAUDE.md` Source Layout section: replace the `StatsView.tsx  # Multi-section stats dashboard` line's description with `# Category-paged stats dashboard (10-category taxonomy)`, add `statsTaxonomy.ts` and `search/` to the stats listing, and remove the `useLazyGroups` mention if present.

```bash
git add -A
git commit -m "test: e2e coverage for taxonomy navigation and search; docs sync"
```

---

## Deliberately Out of Scope (do not build)

- Metric **tab activation** on search jump (v1 flashes the metric element only; activating section tab state needs per-section plumbing — future work).
- Fuzzy matching, search history, or definition (`metrics-spec`) results in the palette.
- Any change to which sections a published report includes, or to `report.json`.
- Re-theming of the nav chrome beyond structural replacement.

## Self-Review Notes (already applied)

- Old anchors `#commanders/#squad-stats/#other/#map` are covered by `LEGACY_ALIASES`; `#roster/#offense/#defense/#overview/#replay` resolve via category-id fallback; all current section ids resolve unchanged.
- `stepSection` boundary behavior is specified (Task 5 Step 3.5).
- Embedded-mode search index deliberately ignores the active-group visibility fn (Task 6 Step 5) — otherwise search could only find the open page.
- One palette instance serves the web report (Task 9 Step 2.3 chooses the embedded-palette option) to avoid double Ctrl+K listeners.
