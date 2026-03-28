# SkillUsageSection Visual Restyling

**Date:** 2026-03-28
**Origin:** User request to unify chart section UIs
**Status:** Design
**Sub-project:** 3 of 3 (previous: SpikeDamage conversion, Boon sections conversion)

## Summary

Update SkillUsageSection's CSS/classNames to match the flat design language used by FightMetricSection. No structural refactoring — the component keeps its own layout, state management, and multi-player selection logic. Purely visual alignment.

## Motivation

SkillUsageSection uses the older CSS-variable-based styling (`var(--border-default)`, `var(--bg-card-inner)`, `modal-pane`) while all other chart sections now use FightMetricSection's flat Tailwind design. This update brings visual consistency without forcing SkillUsage into FightMetricSection's single-player layout pattern.

## Design

### Container

Replace the old `modal-pane` expansion pattern:
```
className={`${isExpanded ? 'fixed inset-0 z-50 overflow-y-auto h-screen modal-pane ...' : ''}`}
style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
```

With FightMetricSection's flat container:
```
className={`rounded-xl overflow-hidden ${isExpanded ? 'h-full flex flex-col' : ''}`}
style={{ scrollMarginTop: '80px' }}
```

### Header

Replace the old icon + title + expand button:
```
<div className="flex items-center gap-2 mb-3.5">
    <Keyboard ... style={{ color: 'var(--section-offense)' }} />
    <h3 className="text-[11px] font-semibold uppercase ..." style={{ color: 'var(--text-primary)' }}>...</h3>
    <button ... style={{ background: 'transparent', border: '1px solid var(--border-default)', ... }}>
```

With FightMetricSection's header bar:
```
<div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
    <div className="flex items-center gap-2">
        <Keyboard className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-200">Skill Usage</span>
    </div>
    <div className="flex items-center gap-2">
        {/* pill toggles */}
        {/* expand button */}
    </div>
</div>
```

### Player List and Selection

Replace CSS-variable borders/backgrounds with Tailwind flat equivalents:
- `border-[color:var(--border-default)]` → `border-white/5`
- `bg-[var(--bg-card-inner)]` → `bg-white/5`
- `text-[color:var(--text-primary)]` → `text-slate-300`
- `text-[color:var(--text-secondary)]` → `text-slate-500`
- `text-[color:var(--text-muted)]` → `text-slate-600`
- `focus:border-rose-400` → `focus:ring-1 focus:ring-indigo-500/50`
- Selected player buttons: `bg-indigo-500/15 ring-1 ring-indigo-500/30` instead of rose/accent variable styles
- Selection chips: update to match flat palette

### Chart and Tooltip

- Chart grid: `stroke="rgba(255,255,255,0.08)"` (already used)
- XAxis/YAxis tick fill: `#64748b` instead of `#e2e8f0`
- Tooltip: `bg-slate-900/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl` instead of `contentStyle={{ backgroundColor: '#161c24', ... }}`

### Skill Bar

- Replace `var(--border-default)` borders with `border-white/5`
- Replace `var(--bg-card-inner)` backgrounds with `bg-white/5`
- Update hover styles to `hover:bg-white/[0.03]`

### What Changes

- `src/renderer/stats/sections/SkillUsageSection.tsx` — className updates throughout, no logic changes

### What Stays the Same

- All props, state, data flow, and component structure
- Multi-player selection logic
- Collapsible profession groups
- Skill bar chart and multi-line chart
- Hover-based line styling
- StatsView.tsx — no changes needed
