# Stats Section Redesign

## Summary

Redesign the stats dashboard sections to match the unified theme redesign. The sections currently use hardcoded Tailwind colors (`bg-white/5`, `border-white/10`, `rounded-2xl`, `text-gray-*`, per-section color classes) that diverge from the new CSS variable-based design system. This spec covers both the visual reskin and a structural change to group sections into connected panel containers.

## Design Decisions

1. **Color strategy: Hybrid** — All interactive elements (active tabs, toggles, pill groups, buttons) use the brand palette (`var(--brand-primary)`, `var(--accent-bg-strong)`, etc.). Section identity is conveyed through a subtle left-edge accent line on the group container and colored dots on section headers.

2. **Section stacking: Connected panels** — Each of the 7 nav groups renders as a single card container. Sub-sections within a group are panels separated by thin dividers, not individual cards. One group = one visual unit.

3. **Internal section layout: Preserved** — The sidebar + content two-column layout within metric sections stays structurally unchanged. Only the visual tokens are updated.

## Specification

### 1. Group Container

Each nav group (Overview, Commander Stats, Squad Stats, Roster Intel, Offensive Stats, Defensive Stats, Other Metrics) gets a wrapper element.

**Styling:**
- `background: var(--bg-card)`
- `border: 1px solid var(--border-default)`
- `border-left: 2px solid <group-semantic-color>`
- `border-radius: var(--radius-md)` (4px)
- `box-shadow: var(--shadow-card)`

**Group header** (inside the container, above the first section):
- Icon tinted with the group's semantic color
- Group label: 12px, weight 700, uppercase, `letter-spacing: 0.08em`, `color: var(--text-primary)`
- Section count on the right: `color: var(--text-muted)`, 10px
- Bottom border: `1px solid var(--border-subtle)`
- Padding: `14px 18px`

**Implementation:** StatsView currently renders sections flat. A new wrapper component (or grouping logic in StatsView) needs to wrap each nav group's sections in a container `<div>`. The group definitions from `STATS_TOC_GROUPS` in `useStatsNavigation.ts` provide the grouping — each group's `sectionIds` array defines which sections belong to it.

### 2. Section Panels

Each sub-section within a group container:

**Structure:**
- No individual border, shadow, or border-radius — panels inherit from the group container
- Padding: `18px`
- Separated from siblings by `border-bottom: 1px solid var(--border-subtle)`
- Last panel in a group has no bottom border

**Section header:**
- Colored accent dot: 8px square, `border-radius: 2px`, filled with the section's semantic color
- Section label: 11px, weight 600, uppercase, `letter-spacing: 0.05em`, `color: var(--text-primary)`
- Expand button (right-aligned): `border: 1px solid var(--border-default)`, `border-radius: var(--radius-md)`, 26x26px, transparent background, `hover: var(--bg-hover)` + `var(--border-hover)`
- `margin-bottom: 14px`

**Empty state:** `color: var(--text-muted)`, italic, centered, `padding: 32px 0`

### 3. Section Internal Layout (Metric Sections)

The sidebar + content two-column grid is preserved and reskinned.

**Metric sidebar:**
- `background: var(--bg-card-inner)`
- `border: 1px solid var(--border-subtle)`
- `border-radius: var(--radius-md)`
- Padding: `8px`

**Search input:**
- `background: var(--bg-input)`
- `border: 1px solid var(--border-default)`
- `border-radius: var(--radius-md)`
- `color: var(--text-primary)`
- `placeholder-color: var(--text-muted)`
- Font size: 10px

**Metric tabs:**
- Inactive: `color: var(--text-secondary)`, transparent background, `border: 1px solid transparent`
- Hover: `background: var(--bg-hover)`, `color: var(--text-primary)`
- Active: `background: var(--accent-bg-strong)`, `border-color: var(--accent-border)`, `color: var(--brand-primary)`, `font-weight: 500`
- Border-radius: 3px, padding: `5px 8px`, font size: 10px

**Data area:**
- `background: var(--bg-card-inner)`
- `border: 1px solid var(--border-subtle)`
- `border-radius: var(--radius-md)`

**Pill toggle groups (Total/Per1s/Per60s):**
- Container: `background: rgba(255,255,255,0.03)`, `border: 1px solid var(--border-subtle)`, `border-radius: 3px`
- Inactive pill: `color: var(--text-secondary)`, transparent
- Active pill: `background: var(--accent-bg-strong)`, `color: var(--brand-primary)`
- Pill border-radius: 2px

**Data table:**
- Header: `color: var(--text-muted)`, 9px, weight 600, uppercase, `letter-spacing: 0.06em`, `border-bottom: 1px solid var(--border-subtle)`
- Rows: `border-bottom: 1px solid var(--border-subtle)`, `hover: var(--bg-hover)`
- Rank column: `color: var(--text-muted)`, 10px
- Player name: `color: var(--text-primary)`, 11px
- Numeric values: monospace font, `color: var(--text-primary)`, 11px, weight 500, right-aligned
- Time/secondary values: `color: var(--text-secondary)`, 10px

### 4. Semantic Section Color System

CSS variables defined in `index.css` under `:root`:

```css
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

**Group-to-color mapping:**

| Nav Group | Left-Edge Accent | Rationale |
|---|---|---|
| Overview | `var(--brand-primary)` | General — follows user palette |
| Commander Stats | `var(--brand-primary)` | General — follows user palette |
| Squad Stats | `var(--section-offense)` | Damage comparison, kill pressure |
| Roster Intel | `var(--brand-primary)` | General — follows user palette |
| Offensive Stats | `var(--section-offense)` | Offense category |
| Defensive Stats | `var(--section-defense)` | Defense category |
| Other Metrics | `var(--brand-primary)` | Misc — follows user palette |

Sub-section accent dots within a group use per-section semantic colors (e.g., within Defensive Stats: Defense Detailed uses `--section-defense`, Damage Mitigation uses `--section-mitigation`, Boon Output uses `--section-boon`, Support uses `--section-support`, Healing uses `--section-healing`).

**Where semantic colors appear:**
- Group container left-edge accent border
- Section header accent dots
- Section header icon tints

**Where semantic colors do NOT appear:**
- Active metric tabs (brand-colored)
- Pill toggles (brand-colored)
- Buttons (brand-colored)
- Table text or backgrounds

### 5. Overview Section

The green/red gradient overview cards are toned down:

**Allied card:**
- `background: var(--bg-card-inner)` (no gradient)
- `border-left: 2px solid #4ade80` (green accent)
- `border: 1px solid var(--border-default)` (other 3 sides)
- `border-radius: var(--radius-md)`
- Text values: `color: #a7f3d0` (muted green), labels: `color: rgba(167, 243, 208, 0.5)`

**Enemy card:**
- Same structure, `border-left: 2px solid #f87171` (red accent)
- Text values: `color: #fecaca` (muted red), labels: `color: rgba(254, 202, 202, 0.5)`

**Downs/Deaths summary card:**
- `background: var(--bg-card-inner)`
- `border: 1px solid var(--border-default)`
- `border-radius: var(--radius-md)`
- Allied numbers: muted cyan, Enemy numbers: muted rose (keep semantic meaning)

### 6. Expand-to-Modal

The fullscreen expand behavior is preserved and reskinned:

- Modal background: `var(--bg-elevated)`
- Border: none (fullscreen)
- Title bar: `border-bottom: 1px solid var(--border-subtle)`
- Close button: same styling as section expand button
- Dense table: `var(--bg-card-inner)` for alternating row areas, `var(--text-muted)` for column headers
- Control panel (search, filters, toggles): `background: var(--bg-card-inner)`, `border: 1px solid var(--border-subtle)`, `border-radius: var(--radius-md)`
- Animations: `modal-pane-enter` / `modal-pane-exit` keyframes unchanged
- Active filter chips: `background: var(--accent-bg)`, `border: 1px solid var(--accent-border)`, `color: var(--brand-primary)`

### 7. Glass Mode Compatibility

When `body.glass-surfaces` is active:
- Group container `--bg-card` becomes translucent (already handled by existing glass override)
- `backdrop-filter: blur(10px)` on group containers (existing `.stats-view .stats-section-wrap > div` rule can be repurposed)
- No additional glass-specific work needed — the CSS variable system handles it

### 8. Token Migration Reference

| Old (Tailwind hardcoded) | New (CSS variable) |
|---|---|
| `bg-white/5` | `var(--bg-card)` or `var(--bg-hover)` |
| `bg-black/20`, `bg-black/30` | `var(--bg-card-inner)` |
| `border-white/10` | `var(--border-default)` |
| `border-white/5` | `var(--border-subtle)` |
| `rounded-2xl` | `rounded-[var(--radius-md)]` or removed (panels) |
| `text-gray-200` | `var(--text-primary)` |
| `text-gray-300`, `text-gray-400` | `var(--text-secondary)` |
| `text-gray-500` | `var(--text-muted)` |
| `bg-rose-500/20`, `border-rose-500/40`, `text-rose-300` | `var(--section-offense)` / `var(--section-offense-bg)` |
| `bg-sky-500/20`, `border-sky-500/40`, `text-sky-200` | `var(--section-defense)` / `var(--section-defense-bg)` |
| `bg-emerald-500/20`, `text-emerald-200` | `var(--section-support)` / `var(--section-support-bg)` |
| `bg-indigo-500/20`, `text-indigo-200` | `var(--section-mitigation)` / `var(--section-mitigation-bg)` |
| `shadow-2xl` | `var(--shadow-card)` |

## Scope

### In scope
- All 34 section component files in `src/renderer/stats/sections/`
- StatsView.tsx (group wrapper structure)
- Stats UI components (`StatsTableLayout`, `StatsTableShell`, `StatsTableCard`, `DenseStatsTable`, `PillToggleGroup`, `SearchSelectDropdown`, `ColumnFilterDropdown`, `StatsViewShared` — tooltips/icons)
- `src/renderer/index.css` (add semantic section color variables)
- Overview section gradient removal

### Out of scope
- Nav sidebar (already uses CSS variables)
- Stats aggregation logic
- Section grouping/categorization changes (groupings stay as-is)
- Chart components (recharts) — separate effort if needed
- Web report theme files (they import `index.css` and inherit)
