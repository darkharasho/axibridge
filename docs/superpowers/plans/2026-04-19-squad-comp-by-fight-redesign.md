# Squad Comp By Fight Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded emerald/cyan Tailwind color classes in `SquadCompByFightSection` with the app's CSS custom property design tokens, adding profession-colored left-border accents to player tiles.

**Architecture:** Single-file change to `src/renderer/stats/sections/SquadCompByFightSection.tsx`. Import the existing `PROFESSION_COLORS` map from `professionUtils.ts`, add a small `hexToRgba` helper inline, then replace className strings throughout. No data model, props, or behavior changes.

**Tech Stack:** React, TypeScript, Tailwind CSS, CSS custom properties (`--bg-card-inner`, `--brand-primary`, etc.)

---

## Files

- Modify: `src/renderer/stats/sections/SquadCompByFightSection.tsx`

---

### Task 1: Add hex-to-rgba helper and import PROFESSION_COLORS

**Files:**
- Modify: `src/renderer/stats/sections/SquadCompByFightSection.tsx`

- [ ] **Step 1: Add import at the top of the file**

Open `src/renderer/stats/sections/SquadCompByFightSection.tsx`. After the existing imports (lines 1–4), add:

```tsx
import { PROFESSION_COLORS } from '../../../shared/professionUtils';
```

- [ ] **Step 2: Add hexToRgba helper after the imports block**

After the import block and before the type declarations, add:

```tsx
const hexToRgba = (hex: string, alpha: number): string => {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
};
```

- [ ] **Step 3: Verify types check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/SquadCompByFightSection.tsx
git commit -m "refactor: import PROFESSION_COLORS and add hexToRgba helper for tile redesign"
```

---

### Task 2: Redesign player tiles

**Files:**
- Modify: `src/renderer/stats/sections/SquadCompByFightSection.tsx`

The player tile is currently rendered starting around line 132. The full `<div>` for each player tile (the outermost one with `squad-comp-player-tile` class) looks like:

```tsx
<div
    key={`${activeFight.id}-${party.party}-${player.account}-${index}`}
    className={`squad-comp-player-tile rounded-md border border-emerald-300/20 bg-gradient-to-b from-emerald-500/30 to-emerald-700/25 px-2 py-1.5 min-w-0 transition-all ${isMatch
        ? 'ring-2 ring-cyan-300/70 border-cyan-300/60 shadow-[0_0_20px_rgba(34,211,238,0.25)]'
        : ''
        } ${player.isCommander ? 'relative overflow-hidden' : ''}`}
>
```

- [ ] **Step 1: Replace the outer tile div className and add inline style for profession left-border**

Replace the outer tile `<div>` opening tag with:

```tsx
<div
    key={`${activeFight.id}-${party.party}-${player.account}-${index}`}
    className={`squad-comp-player-tile rounded-md border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-2 py-1.5 min-w-0 transition-all hover:border-[color:var(--border-hover)] ${isMatch
        ? 'ring-1 ring-[var(--brand-primary)]/50 border-[color:var(--brand-primary)]/40 bg-[var(--accent-bg)] shadow-[0_0_12px_rgba(59,130,246,0.15)]'
        : ''
        }`}
    style={{
        borderLeftWidth: '2px',
        borderLeftColor: PROFESSION_COLORS[player.profession] ?? 'rgba(255,255,255,0.14)',
    }}
>
```

Note: `relative overflow-hidden` is removed because the commander SVG watermark (which needed them) is being replaced in Task 3.

- [ ] **Step 2: Update the profession icon background**

The profession icon `<img>` and fallback `<span>` are inside a wrapper div with classes like `row-span-2 flex items-center justify-center`. Find the icon wrapper just below — it currently has no background. The `<img>` tag itself has class `squad-comp-player-icon w-5 h-5 object-contain shrink-0 opacity-95`.

Wrap the existing icon in a new container that provides the tinted background. Replace:

```tsx
<div className="row-span-2 flex items-center justify-center">
    {getProfessionIconPath(player.profession) ? (
        <img
            src={getProfessionIconPath(player.profession) as string}
            alt={player.profession}
            className="squad-comp-player-icon w-5 h-5 object-contain shrink-0 opacity-95"
        />
    ) : (
        <span className="squad-comp-player-icon inline-block w-5 h-5 rounded-sm border border-[color:var(--border-default)]" />
    )}
</div>
```

With:

```tsx
<div
    className="row-span-2 flex items-center justify-center w-5 h-5 rounded-sm flex-shrink-0"
    style={{
        backgroundColor: PROFESSION_COLORS[player.profession]
            ? hexToRgba(PROFESSION_COLORS[player.profession], 0.08)
            : 'rgba(255,255,255,0.05)',
    }}
>
    {getProfessionIconPath(player.profession) ? (
        <img
            src={getProfessionIconPath(player.profession) as string}
            alt={player.profession}
            className="squad-comp-player-icon w-5 h-5 object-contain shrink-0 opacity-95"
        />
    ) : (
        <span className="squad-comp-player-icon inline-block w-5 h-5 rounded-sm border border-[color:var(--border-default)]" />
    )}
</div>
```

- [ ] **Step 3: Verify types check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/SquadCompByFightSection.tsx
git commit -m "refactor: replace emerald gradient tiles with system-native cards and profession left-border"
```

---

### Task 3: Replace commander SVG watermark with inline badge

**Files:**
- Modify: `src/renderer/stats/sections/SquadCompByFightSection.tsx`

The current commander tag is a large absolute-positioned SVG overlay inside the tile. It looks like:

```tsx
{player.isCommander ? (
    <img
        src={commanderTagIcon}
        alt=""
        aria-hidden="true"
        className="absolute -right-2 -bottom-2 w-12 h-12 object-contain opacity-20 brightness-75 pointer-events-none"
    />
) : null}
```

And `commanderTagIcon` is defined at the top of the component:
```tsx
const commanderTagIcon = resolvePublicAssetPath('svg/commander_tag.svg');
```

- [ ] **Step 1: Remove the commanderTagIcon variable**

Delete this line from the component body:
```tsx
const commanderTagIcon = resolvePublicAssetPath('svg/commander_tag.svg');
```

- [ ] **Step 2: Remove the `resolvePublicAssetPath` import if it's now unused**

Check line 3: `import { resolvePublicAssetPath } from '../../ui/resolvePublicAssetPath';`

Run a quick check:
```bash
grep -n "resolvePublicAssetPath" src/renderer/stats/sections/SquadCompByFightSection.tsx
```

If `resolvePublicAssetPath` appears only in the import line after Step 1, remove that import line.

- [ ] **Step 3: Replace the SVG overlay with an inline badge**

Remove the entire `{player.isCommander ? (<img .../>) : null}` block and instead add a commander badge inside the account name `<div>`. 

Find the account name div:
```tsx
<div className="squad-comp-player-account text-[11px] font-semibold text-emerald-50 truncate min-w-0 flex items-center gap-1" title={player.account}>
    <span className="truncate min-w-0">{player.account}</span>
</div>
```

Replace it with:
```tsx
<div className="squad-comp-player-account text-[11px] font-semibold text-[color:var(--text-primary)] truncate min-w-0 flex items-center gap-1" title={player.account}>
    <span className="truncate min-w-0">{player.account}</span>
    {player.isCommander ? (
        <span
            className="inline-flex items-center justify-center w-3 h-3 rounded-full flex-shrink-0 text-[8px] leading-none"
            style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }}
            title="Commander"
        >★</span>
    ) : null}
</div>
```

Also update the character name div — it currently uses hardcoded `text-emerald-100/80`. Replace:
```tsx
<div className="squad-comp-player-character text-[10px] text-emerald-100/80 truncate min-w-0" title={player.characterName || 'Unknown'}>
```

With:
```tsx
<div className="squad-comp-player-character text-[10px] text-[color:var(--text-secondary)] truncate min-w-0" title={player.characterName || 'Unknown'}>
```

- [ ] **Step 4: Verify types check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/sections/SquadCompByFightSection.tsx
git commit -m "refactor: replace commander SVG watermark with inline badge, fix text colors"
```

---

### Task 4: Update fight nav active state

**Files:**
- Modify: `src/renderer/stats/sections/SquadCompByFightSection.tsx`

The fight nav button currently uses hardcoded cyan for active state. Find the `className` on the fight nav button (around line 102):

```tsx
className={`squad-comp-fight-nav-item w-full text-left px-3 py-2 rounded-[var(--radius-md)] text-xs font-semibold border transition-colors ${isActive
    ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100 squad-comp-fight-nav-item--active'
    : 'bg-[var(--bg-hover)] text-[color:var(--text-secondary)] border-[color:var(--border-default)] hover:text-[color:var(--text-primary)]'
    }`}
```

- [ ] **Step 1: Replace the active state classes**

Replace the entire `className` prop with:

```tsx
className={`squad-comp-fight-nav-item w-full text-left px-3 py-2 rounded-[var(--radius-md)] text-xs font-semibold border transition-colors ${isActive
    ? 'bg-[var(--accent-bg-strong)] border-[color:var(--accent-border)] text-[#93c5fd] squad-comp-fight-nav-item--active'
    : 'bg-[var(--bg-hover)] text-[color:var(--text-secondary)] border-[color:var(--border-default)] hover:text-[color:var(--text-primary)]'
    }`}
```

Also find the fight number label inside the button (the `<div>` with `text-[10px] uppercase`):
```tsx
<div className="text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)]">{fight.label}</div>
```

Make this dim the active color too by changing it to render differently when active. Since `isActive` is in scope at the button level, update it:

```tsx
<div className={`text-[10px] uppercase tracking-widest ${isActive ? 'text-[rgba(147,197,253,0.7)]' : 'text-[color:var(--text-secondary)]'}`}>{fight.label}</div>
```

- [ ] **Step 2: Verify types check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no warnings or errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/SquadCompByFightSection.tsx
git commit -m "refactor: update fight nav active state to use brand accent tokens"
```

---

### Task 5: Visual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to the Squad Comp By Fight section**

Open the Electron app, load some logs that have been processed, and navigate to the Stats view → Squad Comp By Fight section. Verify:

1. Player tiles show `--bg-card-inner` background (dark, no emerald gradient)
2. Each tile has a 2px left border colored by profession (Guardian = `#72C1D9` blue-teal, Revenant = `#D16E5A` orange-red, etc.)
3. Commander players show a small gold `★` badge next to their account name (no large watermark)
4. Typing in the search box highlights matching tiles with a blue glow (not cyan)
5. The active fight tab uses blue accent colors (not cyan)
6. No visual regressions in other stats sections

- [ ] **Step 3: Test across themes**

In app Settings, cycle through available UI themes (Classic, Modern, CRT, Matte, Kinetic) and confirm the section looks coherent in each — tiles should adapt via the CSS custom properties.
