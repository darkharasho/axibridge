# axi-design override census

**Date:** 2026-09-28
**Subject:** `src/renderer/axi-design.css` — 2806 lines, 337 rules, 852 declarations, 68 `!important`
**Premise:** axi-design is the source of truth. Anything the app restates locally is drift waiting to happen; changes belong in the package.

## Method

Rules parsed from the stylesheet with comments stripped and line numbers preserved.
Each rule's selectors were decomposed into the classes and data-attributes they
target. Every target was then cross-referenced against (a) upstream's component
inventory at 1.15.0 and (b) actual usage in `src/**/*.tsx`. Nothing was left
unclassified — the unmapped set is empty.

## Totals

| Verdict | Rules | What it means |
|---|---:|---|
| **ADOPT** | 237 | Restates a component upstream already ships. Delete the rule, change the markup. |
| **DELETE** | 313 | Tailwind palette utilities repainted into axi tokens. Not upstream's problem — fix the JSX. |
| **EXTEND** | 59 | No upstream equivalent. Either add a component to axi-design or compose from primitives. |
| **KEEP** | 52 | recharts internals. Third-party DOM we don't author; has to be styled from outside. |
| **APP** | 13 | GW2 domain semantics. Legitimately app-side. |
| **(global)** | 28 | `:root` token remap, focus ring, scrollbars. The supported `tokens.css` mode. |

Upstream ships **52 component families** at 1.15.0. The app's markup uses **none**
of them.

## ADOPT — 237 rules across 13 families

Ordered by markup cost, since that is what the work actually is.

| Family | Rules | JSX sites | Files | Upstream target |
|---|---:|---:|---:|---|
| Modals & menus | 13 | 87 | 21 | `.axi-modal` `.axi-scrim` `.axi-menu` `.axi-drawer` |
| Tables | 44 | 64 | 13 | `.axi-table` |
| Cards | 21 | 42 | 12 | `.axi-card` `.axi-panel` |
| Shell & page | 27 | 37 | 13 | `.axi-window` `.axi-titlebar` `.axi-page` `.axi-mast` `.axi-eyebrow` |
| Switches | 15 | 19 | 5 | `.axi-switch` `.axi-pill` |
| Meters & bars | 16 | 13 | 6 | `.axi-meter` `.axi-bars` |
| Nav & tabs | 29 | 12 | 3 | `.axi-tabs` `.axi-accordion` |
| Buttons | 16 | 11 | 5 | `.axi-btn` |
| Tooltips | 5 | 10 | 7 | `.axi-tooltip` |
| Chips & badges | 13 | 9 | 3 | `.axi-chip` `.axi-pill` `.axi-sigil` |
| Search palette | 24 | 8 | 1 | `.axi-search` `.axi-menu` |
| Spinners | 4 | 2 | 2 | `.axi-spinner` |
| Checkboxes | 10 | 1 | 1 | `.axi-check` |

Note the inversion: **Nav & tabs and Search palette are 53 rules against 20 call
sites.** Highest CSS-per-component ratio in the file — the most reskin for the
least markup. They are the cheapest real wins.

Three of these are keyed on data-attributes rather than classes and so are
invisible to a class-name grep: `[data-nav-strip]` / `[data-nav-tab]` (4 rules),
`[data-search-pill]` / `[data-search-row]` / `[data-search-count]` (6 rules), and
bare `input[type=checkbox]` (7 rules).

## DELETE — 313 rules, 4568 JSX sites, 77 files

The largest bucket, and the one the "source of truth" principle does not reach:
the markup hardcodes palette colours as Tailwind utilities, and this file
translates them back into semantic tokens.

```
.bg-red-400,   .bg-red-500,   …  →  var(--axi-danger)
.bg-emerald-400, .bg-emerald-500  →  var(--axi-ok)
.bg-amber-400, .bg-amber-500, …  →  var(--axi-warn)
.bg-cyan-300, .bg-blue-400/90, … →  var(--axi-meta)
.bg-white,   .bg-slate-200/70    →  var(--axi-text)
.bg-black/60, .bg-black/70       →  var(--axi-scrim)
```

311 distinct utilities. The distribution is extremely skewed: **10 utilities
account for 2596 of the 4568 sites** (`.border` alone is 749, `.rounded-*` 426,
`.border-white` 292), while **178 utilities appear twice or less**. That shape is
good news — the bulk is a mechanical codemod against a mapping this file already
states, and the long tail is hand work.

This is not a migration to upstream. It is deleting a translation layer by
saying the semantic thing in the markup in the first place.

## EXTEND — 59 rules, no upstream equivalent

Each needs a ruling: does it belong in axi-design, or is it composed app-side
from primitives?

| Family | Rules | Classes | Question |
|---|---:|---|---|
| Bucket grid | 21 | `.bucket-grid*` | Pinned-column grid. General enough for the language? |
| Rail | 15 | `.dashboard-rail` `.bridge-rail*` | A sidebar/rail primitive — the most obviously reusable of the four. |
| Split layout | 13 | `.stats-table-layout*` | Split-pane. Arguably `.axi-page` + `.axi-grid`. |
| Mobile bar | 10 | `.mobile-action-bar` `.mobile-jump-chip*` | Responsive action bar. |

The rail is also the one that has already bitten us twice this week (the black
column, and `.stats-sections` still outstanding) — precisely because it is an
app-local restatement of "a raised surface" with no upstream contract behind it.

## KEEP — 52 rules

recharts generates its own DOM; `.recharts-*` never appears in our source. These
rules must live in a consumer stylesheet. They are the one bucket where an
app-side override is correct rather than tolerated.

## Recommended sequencing

1. **Switches** (15 rules / 19 sites / 5 files). Pilot. Needs **zero upstream
   change** — `.axi-switch` already parameterises width, height and knob through
   `--axi-switch-*`, so the half-size one is a variable, and `--axi-switch-fill`
   buys the danger state we currently cannot express.
2. **Tooltips, Spinners, Checkboxes** (19 rules / 13 sites). Small, isolated,
   proves the pattern across three more component kinds.
3. **Nav & tabs + Search palette** (53 rules / 20 sites). Best ratio in the file.
4. **Tables** (44 rules / 64 sites). Largest single ADOPT family.
5. **Tailwind codemod** (top 10 utilities first — 2596 of 4568 sites).
6. **Cards, Modals, Buttons, Chips, Meters, Shell** — the remaining ADOPT mass.
7. **EXTEND rulings** — four design decisions, upstream-side.

## What the census got wrong

Kept here rather than corrected in place, because the errors are the useful part.

**Tables (step 4).** Both numbers and the verdict. "64 JSX sites / 13 files" counted
consumers: every table in the app is one 140-line component, and the 13 files pass
props to it. And ADOPT was wrong — `.axi-table` described a leaderboard, with no
scroll, nothing to keep in place. The app needed twenty numeric columns against
forty players scrolled both ways, which is why it had built a grid of divs with no
`<table>`, no `<th>` and no `scope` at all. Reclassified EXTEND; the shape went
upstream in 1.21.0.

**The Tailwind bucket (step 5).** Called DELETE — "not upstream's problem — fix the
JSX." Half right. The markup does have to say the meaning, but until 1.22.0 the
language had no way to say it outside a component: rules 5 and 6 draw a
status/commentary distinction that only a chip or a card could express. So the
bucket was really EXTEND then DELETE, and it split three ways rather than one:

- *Colour* (1445 sites, 55 files) — `text-*` and `border-*`, a pure substitution
  once `.axi-ink-*` and `.axi-edge-*` existed. Done.
- *Surfaces* (578 sites, counted properly) — and this one was not a slice at all.
  See "There is no surfaces slice" below.
- *Geometry* (`.border`, `.rounded-*`, 1175 sites) — never colour, never bridged.
  It belongs to the component-adoption slices.

**And a fourth group nobody counted: 293 variant-prefixed palette utilities that
the bridge never reached.** Tailwind emits `hover:text-white` as the class
`hover\:text-white`, which the bridge's `.text-white` does not match — so every
hover, focus and placeholder colour in the app has been raw Tailwind palette since
the theme landed, in both themes. Most sit on things that want to be `.axi-btn` or
`.axi-menu`, which carry their own hover, so they are absorbed by the component
slices rather than by a parallel hover vocabulary.

Also outstanding, independent of all of the above: we are pinned at **1.13.0**
and upstream is at **1.15.0**. *(Both stale: 1.22.0 as of 2026-09-28.)*


## There is no surfaces slice

The colour slice deferred "the `bg-*` half" to a surfaces slice. Counted
properly that is 578 sites, and it does not hold together as one piece of work.
It splits by *what the language says about each kind*, and the three answers are
different in kind:

- **312 neutral surfaces** — `bg-white/5` (128 on its own), `bg-white/10`,
  `bg-black/2x–4x`, `bg-slate-900`, and the arbitrary `bg-white/[0.0x]` forms.
  The bridge already lands these on the ramp correctly: `/5` → ground, `/10` →
  raised, `slate-900` → surface. The language's answer is *name the object* —
  `.axi-well`, `.axi-panel`, `.axi-scrim` — and naming the object is what the
  component-adoption slices already do. This third has no separate existence; it
  dissolves into Cards, Modals, Shell & page. This slice took the first bite of
  it.

- **156 status tints** — `bg-red-500/15`, `bg-emerald-500/20` and their kin. The
  language's answer is that **the tint is wrong**, and it says so twice
  independently. `.axi-notice--danger` does not tint its background at any
  status: the surface stays `--axi-surface` and the status lives in an opaque
  26px icon square, because (upstream's words) "a whole paragraph in the danger
  ink is the tinted-everything failure rule 2 exists to prevent." `.axi-meter`
  says the same thing about bars: "a tinted or faded bar is the same lie as a
  tinted surface." So these 156 are not a substitution and not an upstream gap —
  they are a visual change the app owes, per site, and they need reviewing rather
  than codemodding.

- **103 opaque colour fills** — `bg-emerald-500` on a bar, `bg-white` on a dot.
  The language does have a mechanism, and it is a custom property rather than a
  class: `.axi-meter__fill` and `.axi-bars__part` both paint
  `var(--axi-series, var(--axi-accent))`. That is deliberate — `src/utilities.css`
  explains why there is no `.axi-fill-*` family to match the inks. These belong
  to the Meters & bars slice.

The lesson is the same one the Tailwind bucket taught: a bucket named after a CSS
property is not a unit of work. `bg-*` is a property; "a well", "a status panel"
and "a bar segment" are three different questions with three different answers.

## What the tile slice found

Migrating the MVP and commander cards (2026-09-28, axi-design 1.23.0) turned up
two things worth recording:

- **Half the MVP colour scheme was inert.** `TopPlayersSection` built a
  sixteen-key style object per group — `accentBg`, `accentBlob`, `goldCardBorder`,
  `goldIconWrap`, `goldStatRow` and so on. Eight of the sixteen were fully
  overruled by the theme and had been since it landed: the app computed them, React
  wrote them into the DOM, and no pixel ever changed. Deleting an override *and*
  the thing it overrides is the safest edit in this whole programme, and it is
  worth looking for the pattern deliberately in the remaining slices.

- **The language had no second step for a raised thing.** `.axi-panel` was the
  only one, so a grid of six panels read as six page regions, and an app that
  wanted to rank them had exactly one tool: spend a hue. That is why the MVP cards
  were gold/silver/bronze-tinted in the first place. `.axi-panel--tile` gives the
  ramp its second step, and rank becomes a form question instead of a colour one.

## What the second cards slice found

The five remaining card families — the dashboard rail's cards, the Overview
scoreboard, the Settings sections, the History report cards, the Replay fight
picker — turned out to be one rule wearing five names.

Every one of them wrote its frame as an **inline literal** in the markup
(`border: 1px solid`, `borderRadius: 8`, `padding: 8`, `rounded-[4px] p-3`),
and an inline shorthand beats any selector. So the override layer could not
restate the frame; it could only reach *through* the literal by re-resolving a
variable the literal happened to read — `--panel-border-w`, `--history-edge-w`.
That is why these five rules looked so unlike the rest of the layer: they set
almost no properties. They were levers, not descriptions.

**A lever is a reskin that has run out of room.** Naming the object deletes the
lever and the literal together. Every one of these sites lost its inline frame
entirely; four of the five override rules went with it, and the fifth
(`.overview-card`) kept only the knobs that describe what is *inside* it.

Two rulings the slice had to make:

- **The History cards stay panels, not tiles.** A report is a page's worth of
  content, and the chrome around them — source bar, search field, filter — sits
  at the control step. That one step of difference is what makes the cards read
  as the thing you are meant to click. Tiles would have flattened them into
  their own chrome.
- **Picked is an edge, never a fill.** The picker's active fight was
  `--accent-bg-strong` *and* an accent border. The fill goes; `.axi-edge-accent`
  alone says it, which is rule 2 and is also what the leader tile and the
  delete-marked History card now say. `whileHover={{ borderColor }}` went with
  it — a rule-coloured hover is invisible against a 4px ink edge, and the
  language's hover is the block lifting, not the edge changing.

The slice also found a latent bug in `.axi-panel--tile` as shipped in 1.23.0:
it took the control border and the control block but inherited the panel's
`--axi-radius`. `--axi-radius`'s own note says control-sized surfaces read
`--axi-radius-sm`. Both are 0 in every theme this app uses, so nothing on
screen could have revealed it — fixed in 1.23.1 by reading the token rather
than by looking at the result.

**Still deferred, and now deliberately:** `.app-modal-card` (12 sites, three
different radii, some with inline frames) belongs to the Modals & menus slice,
and `.report-shell-card` is drawn by `src/web/reportShell.css` before the
viewer bundle loads, so it cannot assume `axi.css` is present. Neither is a
card problem.

## What the modals and dropdowns slice found

**The lever pattern held for a third family.** All thirteen `.app-modal-card`
sites wrote their frame as an inline `border: 1px solid ...` literal, so the
override layer could not restate it and instead re-resolved `--panel-border-w`,
which the literals happened to read. Same for the dropdowns, via
`--panel-border-w` and `--history-edge-w`. Naming the object deletes the lever
and the literal together, exactly as the cards slices predicted.

**Upstream had wired `--axi-surface-float` into two of its own floating
surfaces and missed five.** The token's own comment in `tokens.css` names its
consumers — "a command palette, a menu popover, a modal" — and only the palette
had it. `.axi-modal`, `.axi-menu__pop`, `.axi-picker__pop`, `.axi-toast` and
`.axi-drawer` all still read a translucent fill, so under glass they showed the
page through their own text. Shipped as **1.24.0**.

The three that read `--axi-surface-raised` were not asking for height. That
token is the chip-and-hover tint; height is carried by the border and the block,
and the proof is that `.axi-modal` — the highest surface in the language — sits
on the plain fill. What `raised` was lending a popover was *opacity*, which is
the one thing a translucent theme takes away. `.axi-tooltip` was checked and
left alone: it reads `--axi-ground-deep`, which glass restates opaque on purpose.

### Two rulings

**A modal and a padded box are different objects.** `.axi-modal` owns
`padding: 0` because its head, body and foot bring their own. Three of the
thirteen cards are a single padded box (the mobile Jump-to sheet, the
web-reports manager, the proof-of-work panel); calling those `.axi-modal` would
have meant re-adding the padding it deliberately drops, so they are
`.axi-panel--float` with `--axi-panel-pad`. Both paths get the float surface,
which was the point.

**`.app-dropdown` was serving two unrelated populations.** Ten sites hang off a
trigger and are now `.axi-panel--tile --float` — the tile is the control step
the override reached for, the float is the opaque fill `index.css` pinned with
`!important`. The rest is chrome that draws its own frame inline and only wants
the entrance animation: the replay map's bars, legends and two 28px spine
strips, plus the fight-slice tray. Those keep `.app-dropdown` for the animation
and gained `.app-opaque-float`, which the glass rule now targets instead.

That split was not cosmetic. Glass restates `--axi-surface-float` as a 145deg
gradient at `.97`, while the old `!important` was a flat `rgba(15,18,25,.97)` —
leaving the migrated dropdowns in that rule would have cost them the tilt that
makes a pane read as glass at all.

**Not adopted: `.axi-menu__pop`.** It bakes in `position: absolute`,
`top: calc(100% + 9px)`, `left: 0` and `z-index: 41`. This app positions its own
dropdowns and runs a z-index stack up to 74, so `left: 0` would fight `right-0`
and the z-index would lose to `axi.css` load order. `.axi-panel--tile --float` is
the adapter for a consumer that owns its positioning, and upstream's modal entry
now documents the parallel case: `.axi-modal` on a `<div>` beside `.axi-scrim`,
with the cost — no focus trap, no inertness, no top layer — named rather than
left to be discovered.

**The `.axi-scrim` z-index trap.** Tailwind's utilities layer is imported at
`index.css:2-4` and `axi.css` at `:12`, so `.axi-scrim`'s own `z-index: 50`
outranks a `z-[60]` utility. The app's four-deep modal stack had to move to
inline `zIndex`, and every `max-w-*` on a modal card had to become
`--axi-modal-width` for the same reason — left in place they would have sat in
the bundle and silently lost.

### Still deferred

`.report-shell-card` keeps the last `--panel-border-w` lever in the file, and
this is now the documented reason rather than an omission: `src/web/reportShell.css`
is loaded before the viewer bundle, so it cannot assume `axi.css` is present and
cannot name an upstream object. The replay chrome's own geometry — eight sites
of inline `borderRadius: 7/8/10` and `border: 1px solid` — is the next slice,
and two of those sites are 28px strips with a single border down one side, which
an `.axi-panel` would wrongly wrap in a full outline.

## What the replay chrome slice found

Ten sites, and the useful thing they turned up is that **a deferral note is a
guess until you read the markup again.** The modals slice ended by recording
that two of these sites were 28px strips "with a single border down one side,
which an `.axi-panel` would wrongly wrap in a full outline," and deferred them
on that basis. Reading them properly: both are `<button>`s whose only job is to
reopen the panel they collapse into, and both already carry `borderRadius: 8`
on all four corners. A rounded box with one border is not a seam — it is a box
missing three borders. `.axi-panel--tile` on a button gives the control border,
the control radius, the control block, **and** `button.axi-panel--tile:hover`,
which is the hover affordance these two strips have never had despite being the
only way back into the panel. The earlier note was wrong and the strips took the
tile.

### The toolbar was the container left out of the set

Upstream 1.25.0. `.axi-panel` has `--axi-panel-pad` and `--float`; `.axi-rail`
has `--axi-rail-pad` and `--float`; `.axi-toolbar` had a hardcoded `padding:
14px` and no float. That is the same omission 1.24.0 fixed for the modal and the
popovers: `--axi-surface-float`'s own comment lists the surfaces that need it and
the toolbar was missing from the list.

- `--axi-toolbar-pad` — a transport bar over a map is a toolbar at a third of
  the height of a strip above a list, and its only way to say so was to write its
  own padding and stop being a toolbar.
- `.axi-toolbar--float` — third `--float`, completing the set.
- `.axi-toolbar--nowrap` — the default wrap is right when losing a filter off the
  edge beats a second line, and wrong when other things are positioned against the
  bar's height. `TransportBar`'s own doc comment says the whole point of its
  single-row collapse is that the bar has one height; the default wrap would have
  silently undone that at narrow widths.

**The test that would have caught both.** 1.24.0's bug survived four releases
because the token's consumer list was prose. `tests/tokens.test.mjs` now asserts,
per floating surface, that its own rule body reads `--axi-surface-float`, plus
that the token's comment and the test's list still name the same modifiers.
Mutation-checked: flipping `.axi-toolbar--float` to `--axi-surface` fails exactly
one test.

`.axi-rail--flush` also drew its seam with `border-right`, which is "the border
facing the content" only in LTR; it is `border-inline-end` now. It still assumes
the *leading* edge — a rail pinned to the trailing edge of its content has no way
to ask for the other border — and the manifest says so rather than promising a
generality the code does not have. No consumer here needs it, so no API was
invented for it.

### The rulings

| Shape | Object | Why |
|---|---|---|
| `TransportBar`, `FightIdentityPill` | `.axi-toolbar --float --nowrap` | A row of controls on a raised surface, pinned over a map that moves. |
| `MapLegend`, `DeathTallyCard`, the speed ladder, both 28px strips | `.axi-panel--tile --float` | Control-sized readouts and presses, not page regions. |
| Both 216px side panels | `.axi-panel--float`, pad `0` | A head pinned above a body that scrolls under it — the modal's split, not a rail's single scrolling column. |

`.axi-menu__pop` was rejected again for the speed ladder, for the same reason as
in the dropdowns slice: it bakes in `position: absolute; left: 0; z-index: 41`,
and the bridging span above the ladder owns both.

**The pill loses its capsule under the default theme.** Its inline
`borderRadius: 16` happens to be exactly glass's `--axi-radius`, so under glass
nothing moves; under the default theme, whose radius is 0, it squares off with
every other migrated card. The language has one radius scale and no capsule in
it, and a component keeping its own corner is the reskin being removed — so the
name stays historical and the shape follows the theme. The transport bar goes
10 → 16 under glass and the ladder 7 → 10, both toward the scale.

### `.app-opaque-float` does not retire here

One consumer survives: `FightSliceTray`. It is a different shape from everything
above — full width, flush left and right, one border along the bottom, and the
content scrolls *under* it. That is the same object as `.app-sticky-bar`, and the
language has no word for it: a rail is vertical, a toolbar stands in the layout
with space around it, and `.axi-rail--flush` is the vertical case of exactly this
idea. Two consumers in one app is the threshold for asking upstream for a
horizontal one. Until then the fill stays in `index.css`, narrowed to say so, and
the contract test keeps pinning it.

Eight unit tests asserted `style.background` was non-empty on these elements —
they were pinning the reskin. Repointed to assert the class that carries the
float token, which is what jsdom can see.

## What the docked-bar slice found

The threshold set in the section above was met, so the question went upstream
and came back with a new object rather than a modifier.

### One shape, two names, no word for it

`.app-opaque-float` and `.app-sticky-bar` were the same thing described twice: a
full-width bar that IS one edge of its scroll container — flush at both ends,
one border facing the content, the content travelling under it. Each had a flat
fill and a glass `!important` fill, four rules for one idea, and neither could be
named in the design language: a rail is vertical, a toolbar stands in the layout
with space around it, and `.axi-rail--flush` is the vertical case of exactly this
idea and nothing else.

`.axi-dock` (axi-design 1.26.0) is the horizontal case. It drops the radius,
because its two ends are the container's own edges and a corner there is a corner
cut out of the page, and the offset block, because a block needs somewhere to
fall and a dock has content on one side and the container's edges on the other
three.

**The surface is not a modifier.** Every other surface upstream can go either
way — a panel may sit still on the page or be pinned over a scrolling table — so
each needs a `--float` to say which. A dock does not: *"the content scrolls under
it"* is the definition of docking rather than a variant of it. So `.axi-dock`
reads `--axi-surface-float` unconditionally, with no modifier for a consumer to
forget. This is the first surface in the language where the float is structural.

**It can say which edge it is on.** `.axi-dock` draws the seam on its block-end
side, facing the content below; `.axi-dock--end` flips it for a bar pinned
beneath its list. Both are logical properties. This is the pair `.axi-rail--flush`
still lacks — it assumes the leading edge, documented as a limitation last slice
— and the difference is only that the rail grew from one consumer and the dock
from two arriving together. A speculative API for the rail was declined again.

**What a dock deliberately does not say** is how its contents are arranged or how
it is pinned. `FightSliceTray` puts a head above a scrolling body inside one at
`--axi-dock-pad: 0`; the history bar puts a flex row inside one and keeps its own
`sticky bottom-0 -mx-4`. A dock that answered either would be two objects under
one name.

### Rulings

| Site | Ruling |
| --- | --- |
| `FightSliceTray` | `.axi-dock`, pad 0. Keeps `.app-dropdown` for the entrance only. |
| History bulk-delete bar | `.axi-dock--end`. Its `px-4 py-3` was exactly `--axi-dock-pad`'s default, so it is not restated. |
| The tray's `shadow-[var(--shadow-dropdown)]` | **Dropped.** The seam is how this language says one surface is above another, and the entrance animation still says the tray arrives. Keeping a hand-written drop shadow would be the lever this exercise removes. |
| `.axi-rail--flush` trailing-edge API | **Declined again.** No consumer. The dock's pair is the shape it should grow into. |

### The bulk-upload blur-off had been quietly shrinking

`body.bulk-uploading` turned `backdrop-filter` off for frame rate by naming each
surface: `.app-opaque-float`, `.app-sticky-bar`, `.stats-dashboard-nav-panel`.
Every surface that migrated upstream fell off that list without a word — the
modal, the palette, the popovers, the drawer and now both docks read their blur
from `--axi-surface-filter`, which no selector there was naming. The enumeration
is replaced by nulling the token under `body.bulk-uploading`, which reaches all of
them at once and every surface added later. That is the point of the token: the
theme declares the capability, so the theme is where it gets switched off. The
nav panel's rule survives only because it still writes its own blur literal.

### The published viewer bundle had been stale for two slices

`docs/view/viewer.js` is a build artifact committed to the repo and served from
GitHub Pages, and it is produced by its *own* vite config (`npm run build:viewer`)
— not by `npm run build`, and **not** by `scripts/copy-viewer-assets.mjs`, which
copies static files beside it and never touches the bundle. The replay-chrome
slice ran the copy script, saw a clean `git status docs/`, and concluded the
bundle was current. It proved nothing: the committed bundle carried zero
occurrences of `axi-toolbar--float` and twelve of the classes this slice deleted.

Rebuilt here, which catches up both slices. A guard now lives in
`themeCssContract.test.ts`: a list of retired class names that must be absent from
the bundle, plus a list of adopted ones that must be present — the second half
catching a bundle that predates an adoption while happening to carry none of the
retired names. Mutation-checked against the previously committed bundle: 3 of 25
tests fail. The fix when it fails is `npm run build:viewer`, never an edit to the
list.

### What this leaves

`index.css` loses three rules and gains one. `axi-design.css` is untouched at 214
rules — the deletions this slice were never in that file. The remaining
hand-written `rgba(15, 18, 25, .97)` float is `.stats-dashboard-nav-panel`, now
the last one, and it is the next obvious candidate for `.axi-panel--float`.

## What the stats nav panel slice found

### It was a rail, not a panel

The previous section named `.axi-panel--float` as this surface's destination,
and that was the wrong object — reached for because the panel is where the
float modifier was first noticed, not because the surface is a panel. It is the
stats category navigation: a vertical list of eleven categories and their
sections, the same thing `AxiRail` renders for the app and the report renders
for itself. The language already has the word. Calling it a panel to get at a
float would have been the near-miss this exercise exists to remove.

So: `.axi-rail axi-rail--float`, and no upstream change at all. This is the
first slice in the run that needed none. `--axi-rail-w` is the hook the rail
already publishes for a consumer that has to drive its own width, so the
hover-expand between 72px and 248px is a token flip now; the `width` transition
still interpolates across it (measured mid-flight at 202.95px, so the
custom-property substitution does not break the animation the way an
unregistered property's own discrete flip would).

With the object come the fill, the edge, the corner and the raise. The
hand-written `--bg-card` background, the `--shadow-card` block, the Tailwind
`border` and the `rounded-[4px]` all go. The rail squares off under the default
theme and rounds to 16px under glass, like every other migrated surface.

**One line stays inline, and it is honest:** `overflow: hidden`. `.axi-rail`
sets `overflow-y: auto` and `axi.css` loads after Tailwind's utilities, so the
`overflow-hidden` class would lose the cascade at equal specificity. It is also
a fact about this layout rather than about rails — a rail that collapses to an
icon strip has to clip its labels on the way in, and the scrolling happens on
the container inside it.

### The float list is empty

`[data-axi-accent][data-axi-theme="glass"] .stats-dashboard-nav-panel` was the
last hand-written `rgba(15, 18, 25, .97) !important` in `index.css`. Nothing in
that file pins a floating surface opaque any more: the modals, the palette, both
docks and now this rail are all upstream objects reading `--axi-surface-float`.

The `themeCssContract.test.ts` assertion that enumerated those surfaces had run
out of selectors, so it is retired and replaced by its inverse, which is the more
useful shape:

- **`hand-writes no floating surface fill any more`** — no `background`
  declaration carrying `rgba(15, 18, 25, .97)`. That opacity is what every one of
  the deleted rules used, so a reintroduced float would almost certainly carry it.
  Scoped to a declaration rather than the bare literal, because the paragraphs in
  that file explaining what was deleted quote the value, and a substring match
  fails on its own history note (it did, first run).
- **`turns the bulk-upload blur off through the token, not a list of surfaces`** —
  pins the `--axi-surface-filter: none` form, so the fix cannot decay back into
  the enumeration that had been silently losing a surface per slice.

Both mutation-checked: reinstating a `.97` fill and changing the token's value
each fail their own guard and nothing else.

### The viewer bundle did need rebuilding

Worth recording because the reasoning is not obvious: `CategoryBar` is not in
the web report at all, so nothing about this slice's markup reaches the viewer.
But `docs/view/viewer.js` inlines `index.css`, and this slice deletes two rules
from it. The bundle diff is exactly those two rules and nothing else. The guard
added last slice is what makes that check a habit rather than a thing to
remember.

### What this leaves

`index.css` loses two rules. `axi-design.css` holds at 214 rules; the one edit
there is a comment, recording that `[data-axi-accent] body .axi-rail
{ margin-bottom: var(--axi-offset-panel) }` now reaches two rails, and why it is
right for both — the collapsing one is pinned `inset-y-0`, so its floor is the
row's floor unless something hands the offset block its 6px back.

The remaining `rgba(15, 18, 25, …)` literals in `index.css` are not floats and
should not be migrated as if they were: the native `<select>` popup fill (`.9`),
which exists because Chromium on Linux paints the OS option list from the
control's own background and no filter applies to an OS-drawn popup, and three
Fight Comp density fills (`.62`, `.72`, `.58`), which are legibility for compact
labels rather than a surface standing over content. Neither has an upstream word
yet, and neither is asking for one.

The next candidates are unchanged: `.stats-dashboard-nav-panel` is done, so the
largest remaining blocks are recharts (~40 selectors, third-party DOM with no
upstream chart vocabulary), the Tailwind palette neutering (~50), and the
`.modal-pane` fullscreen body.

## What the expanded-pane slice found

### The two stylesheets were arguing, and both were wrong

`index.css` drew a modal's chrome on `.modal-pane` — a 1px outline, a
`--radius-md` corner and a `--shadow-card` block — and `axi-design.css` then
spent five declarations taking all three back off. That pair had been sitting
there through every slice of this exercise. Reading them together is what named
the object: rule 3 outlines a raised element and rule 5 gives it a block, and
both are claims about an **edge**. A pane pinned to all four sides has no edge on
screen to outline and nothing behind it this language is entitled to cast on. So
the cancelling block was right about the design and wrong about where to say it,
and the drawing block was simply wrong.

Upstream had no word for the object. Three were close and all three miss, which
is the test for whether a new one is earned:

- **Not `.axi-modal`.** A `<dialog>` in the top layer, with a scrim and the page
  inert behind it. A sheet is *in* the page, and what it replaces is the view,
  not the reader's attention.
- **Not `.axi-drawer--full`.** A drawer is pinned to three edges with the page
  live beside it, and that live strip is what pays for its float fill, its
  leading outline and its scrim. Widen it to the fourth edge and all three go
  away — a different object wearing a modifier, not a wider drawer.
- **Not `.axi-panel`.** See above: no edge, so no outline and no block.

So `.axi-sheet`, released as axi-design 1.27.0, on its own rung in the layer
stack (45: above the masthead and the popovers, because a sheet covers the view
and those are part of the view; below the scrim, because a modal opened *from* a
sheet has to land on top of it).

### The app had a real glass bug, and the naming exposed it

`axi-design.css` set `--pane-bg: var(--axi-ground)` — a flat colour. Under glass
the page's light is `--axi-ground-image`, three radial gradients on `body`. So
expanding a stats section switched the page light **off**, and closing it
switched the light back on. Nobody had reported it; it took writing down what a
sheet *is* to see it. A sheet is the page for as long as it is open, so it paints
the ground's image as well as the ground's colour.

### The shorthand trap, which shipped broken

1.27.0's sheet read the ground as `background: var(--axi-ground)
var(--axi-ground-image)`, and **painted nothing at all, in either theme**. The
`background` shorthand only accepts a colour in its *final* layer;
`--axi-ground-image` is a comma-separated list of three gradients under glass, so
the colour lands in the first layer, the whole declaration is invalid, and it
drops. A sheet with no fill over a live page.

Nothing in 423 upstream tests noticed, and nothing could have: the CSS parses and
the tokens resolve. Only a browser computing the value shows the loss, which is
what found it — the in-browser probe reported `backgroundColor: rgba(0, 0, 0, 0)`
and `backgroundImage: none`. Fixed in 1.27.1 with the two longhands `base.css`
already uses for `body`, plus a text-level guard with the same reach as the bug:
`--axi-ground-image` is only ever read through `background-image`, asserted
across every source file, both polarities pinned.

**The lesson generalises past this token.** A design language that hands consumers
a token whose value may be a multi-layer image cannot also let them reach for the
shorthand. The two-token split the token block already documents
(`--axi-ground` stays a colour because the plot and the select read it as
`background-color`) has a second half nobody had written down: the *image* half
has a property it must be read by, too.

### Thirty copies of one string

Every one of the 30 expanded stats sections spelled the pane out by hand:

```
fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 …
```

plus an inline `style` shim threaded through all thirty, because when the fill
moved to a custom property there was no single place to change. `expandedPane.ts`
is that place now; the call sites are one spread each, and the slice is −99 lines
net across the thirty files.

None of those utilities could have survived even if we had wanted them: `axi.css`
is imported *after* Tailwind's utilities, so at equal specificity `.axi-sheet`
wins every property they set. A `p-4` left on the element would silently do
nothing — which is why the three sections that want 16px pass it through
`--axi-sheet-pad` instead of a class.

### What stays app-side, and why

- **`.modal-pane`** stays on the element. It is not chrome any more; it is the
  hook the grow/shrink animation, the horizontal-scrollbar rules for dense tables
  inside a pane, and three test locators all key on. It must not go on the
  viewer guard's `RETIRED` list.
- **The motion.** A pane grows out of the card it replaced and shrinks back into
  it. The language rations that kind of thing rather than shipping it.
- **Two structural aliases.** Upstream ships `.axi-sheet__head` and
  `.axi-sheet__body`, and the app cannot use either class: both elements are the
  section's own heading row and content block in the *collapsed* state too, so
  each is only a sheet part while the sheet is open, and no static class can say
  that. `> :first-child` and `> :last-child` alias them, matching the upstream
  rules property for property.
- **The two knobs.** `--axi-sheet-top` (the app has a custom title bar above the
  pane; the web report does not) and `--axi-sheet-pad` (the web report runs on
  phones, where the bottom of the viewport can sit under a home indicator).

### What this leaves

`index.css` loses roughly 30 lines of pane geometry and gains two knob rules.
`axi-design.css` drops to 213 rules — the whole cancelling block is gone and only
the heading alias survives. Two new contract guards, both mutation-checked: the
pane rule may draw no chrome for anything to cancel, and the pane's position must
come through the sheet knobs rather than its own `top`/`height` pair. The second
one had to be narrowed once: scoped to selectors that *end* at `.modal-pane`,
because the dense tables inside a pane legitimately set their own height.

Still open, and now the largest blocks: recharts (~40 selectors, third-party DOM
with no upstream chart vocabulary), the Tailwind palette neutering (~50, a
codemod rather than an adoption), and `.report-shell-card`, which holds the last
`--panel-border-w` lever deliberately — `src/web/reportShell.css` loads before the
viewer bundle, so it cannot assume `axi.css` is present.

One thing this slice noticed and did not do: the pane's close button
(`[aria-label^="Close "]`) is still reskinned in `axi-design.css` and written with
inline styles at each site. It is a control, and it belongs to the Buttons family
slice along with the other 16 — not here.

## What the palette-neutering slice found: it is not a palette

This census scoped the Tailwind palette block as "~50 selectors, a codemod rather
than an adoption". That was wrong, and the way it was wrong is worth recording,
because it changes the order of everything left.

Classifying all 426 `bg-*` sites by the element they actually sit on:

| count | what it is on | the word it wants |
|---|---|---|
| 216 | a box with a fill | `.axi-well` / `.axi-panel` |
| 121 | button / toggle | `.axi-btn` |
| 32 | hover affordance | the component's own hover |
| 27 | dot / bar fill | `--axi-series`, `.axi-meter` |
| 13 | field | `.axi-input` |
| 9 | table cell | `.axi-table` |
| 6 | inline badge | `.axi-chip` |
| 2 | a 1px line | a rule |

Not one is a palette decision. `bg-white/5` is not a colour anybody chose; it is
what an unadopted button looks like. Substituting a token for it would swap one
literal for another, gain no word, and leave the bridge exactly where it is. **The
bridge cannot come down ahead of the component slices — it is their scaffolding,
and it is the last thing to go, not the next.** Upstream had already written the
same conclusion into `src/utilities.css`: *"there is no fill family. Under rule 2
colour at partial opacity over the ground is not available, and an opaque status
fill behind arbitrary text is a chip - which the language already ships."*

### The neutering did not destroy meaning, which was worth checking

The bridge maps every fractional status tint to one neutral `--axi-surface-raised`,
so a "bad" wash and a "good" wash come out identical. That is rule 2 being obeyed,
not a bug — but only if each site still says its verdict some other way. Of 47
status tints, 43 carry a status ink or edge within their own element. The 4 that do
not are selected-row highlights in Commander Stats, where the hue was matching the
table it sat in rather than reporting a verdict, and a neutral raised fill still
reads as selected. Nothing to fix.

### The one group no theme had ever reached

Chart tooltips were drawn three different ways: ten sections passed
`content={...}` and hand-spelled `bg-slate-900 border axi-edge-rule rounded-lg
px-3 py-2 text-xs shadow-xl`; seven passed `contentStyle={{ backgroundColor:
'#1e293b', ... color: '#fff' }}` and let recharts draw it; two of those seven used
`#161c24` instead, for no recorded reason.

The second group is the one that mattered. **An inline style cannot be reached by a
stylesheet**, so those seven were the only surfaces in the app no theme ever
touched — a slate-800 box with pure white text, identical in the default theme and
under glass, while everything around them moved. No bridge rule could have fixed
them; no contract test was looking at inline props.

All 17 now render `src/renderer/stats/ui/ChartTooltip.tsx`, which is upstream's
`.axi-tooltip`. The seven kept their `formatter`/`labelFormatter` unchanged at the
call site, because recharts spreads every `Tooltip` prop onto custom content — which
is what let them move onto the class without rewriting any number formatting. One
of the seven turned out to have a dead `contentStyle` alongside a real `content`
prop, so it had been styling nothing at all.

### Two upstream words this slice earned

**`.axi-tooltip--flow` (1.28.0)** — the third placement. recharts renders custom
content inside a wrapper it has already positioned and transformed, so neither the
base class's `fixed` (a box appended to `<body>`) nor `--anchored`'s `absolute` (a
box inside its own trigger) is true. The base class *appears* to work: a `fixed` box
with every inset auto resolves to its static position, measured at zero drift on
both axes. It then scrolls with the chart only because that wrapper carries a
transform — the exact containment the `<body>` contract exists to escape. Two of
someone else's facts hold it up, and recharts drops both when its `portal` prop is
set, silently. Upstream's own gallery had already found this: its "the box itself"
example carried `style="position: static"` inline because there was no way to say
it. `layers.test.mjs` now requires a placement modifier to answer every placement
property its base declares, so a layer cannot be left behind on a static box.

**`--axi-input-pad` / `--axi-input-size` (1.29.0)** — `.axi-input` had one fixed
size, and upstream had already worked around it once in a context selector
(`.axi-palette__bar .axi-input`) with a comment saying a palette's field is a row in
a bar rather than a form control standing on a page. That argument is not about
palettes: a filter in a section header beside 11px type is the same object at the
same second scale. The palette bar now spends the knobs instead of redeclaring the
properties. The two knobs travel together because a field whose type shrinks and
whose padding does not is not the small size, it is the large one with smaller
words in it.

### What actually came down

Eleven fields onto `.axi-input` — which also retired eleven literal placeholder
colours (`placeholder-slate-500`, `placeholder-gray-600`) and five hand-rolled focus
rings, since `[data-axi-accent] body :focus-visible` already draws the accent one.
Two `h-px bg-white/5` spans became `border-t axi-edge-rule`, which is the word for a
neutral separator.

And **29 dead bridge selectors**. The palette and form bridges are written blind —
nothing tells you when the last site spelling `bg-orange-500/25` stops spelling it,
so the rule sits there looking load-bearing forever. Twenty-nine had rotted that way
by the time anyone counted, including all three arbitrary-value glow-killers whose
comment still described "the gold and cyan MVP icon wells". 135 bridged selectors
→ 106, none dead. `themeCssContract.test.ts` now decides liveness from the markup on
every run, both polarities pinned — this is the only kind of rule in that file whose
liveness is decidable, so it is decided.

### What this leaves, in the order it now has to happen

The bridge's remaining 106 selectors are held up by the component slices, not by
the palette:

- **Buttons (121 sites)** — the largest single block in the app, and now the
  unblocker for the whole `bg-white/*` arm. It also owns the expanded pane's close
  button and the ~400 variant-prefixed hover utilities (`hover:bg-white/10`,
  `hover:text-white`) the bridge never matched, since Tailwind emits those as
  `hover\:bg-white\/10` and `.bg-white\/10` does not match it.
- **Wells and panels (216 sites)** — the `.axi-well` adoption proper.
- **Meters and bars (27 sites)** — including four progress troughs left here
  deliberately: fitting a 4px bar to `.axi-meter`, which carries a control border
  and a radius, is that slice's decision and not a fill substitution.
- **Chips and badges (6 sites)**, **tables (9)**.

recharts is smaller than it looked: its tooltips were the largest themeable part of
it, and they are done. What is left is axis ticks and grid strokes, which are SVG
attributes on recharts' own elements — a props problem, not a CSS one.

## What the buttons slice found: the `<button>` tag is not a unit of the language

The previous section named Buttons as 121 sites. There are 446 `<button>` tags in
the app, and counting them was never the question. Classifying each by what it
actually is gives five different words, only one of which is the button:

| What it is | Tags | Upstream word |
|---|---|---|
| A padded box with chrome, one state | 113 | `.axi-btn` |
| The same, with a pressed state | 25 | `.axi-pill`, which has `aria-pressed` |
| A bare text link or glyph, no chrome at all | 122 | none yet — a link layer |
| A full-width row in a list or menu | 51 | `.axi-rail__item`, `.axi-menu` |
| Already named, or a shape with no chrome | 135 | — |

Only the first group is this slice. The second is deferred on purpose rather than
on convenience: a control with a pressed state is a thing the language already has
a word for, and it is not this one. Adopting `.axi-btn` there would have spelled
"pressed" in a ternary for the twenty-sixth time.

### The language shipped one button size, and the app has three

`.axi-btn` is 12px/20px at 13px type. Not one of the 113 sites was that size. They
cluster into exactly three steps — 27 at 14px type, 32 at 12px, 26 at 10–11px — plus
26 icon-only. Every one of them spelled its own padding and font-size in utilities,
which is what "borrowing the border" looks like: the class was doing a quarter of
its job and Tailwind was doing the rest.

So `.axi-btn--sm`, `--xs` and `--icon` upstream (1.30.0), written in two new knobs
so a size the steps do not cover is still sayable. `--icon` is the one that was
wrong rather than missing: an icon-only button has no label to pad around, so the
20px sides meant for one produced a wide rectangle around a single glyph — which
upstream's own gallery has shown, uncommented, in its example titled "Alone in a
button", for as long as that example has existed.

### The ink layer has been unreachable on hover since it shipped

Found while checking whether a danger button survives adoption. It did not.

`.axi-btn:hover` weighs two classes and `.axi-ink-danger` weighs one, so a button
written `class="axi-btn axi-ink-danger"` measures `#ff5252` at rest and `#f4f6f9`
under the cursor — the verdict disappearing at the moment a reader reaches for it.
Measured in a browser, not inferred. 21 of the 25 status-inked buttons in this app
rely on the ink alone, so all 21 would have lost their meaning on hover.

This is rule 6's own addendum — *a component's base rules may not out-rank its own
modifiers* — with a pseudo-class doing the out-ranking instead of an element. The
rule named `:where()` as the fix and was applied only to base rules; state rules do
the same arithmetic and were never checked. Nothing said so, because both rules are
correct in isolation and the failure exists only while the pointer is over the
element.

`:where()` around the two generic pressables' hover states, the rule extended to
state rules, and a guard that computes the class column for every same-element
inked rule on `.axi-btn` and `.axi-pill`. It found `.axi-pill:hover` on its first
run — a second live instance nobody had looked for. Not applied where the state's
colour *is* the meaning (a selected rail item, a palette's cursor row, a pressed
pill) or where it is a fill's contrast pair; both are now written down as the
exceptions they are rather than left as the absence of a fix.

### Two rules in the bridge turned out to be upstream components, spelled out

`.file-picker-confirm` set an accent fill, accent ink, the control border, radius
and block, and a brightness hover. That is `.axi-btn--primary`, written by hand
against an app class name. `.log-card-share-link-btn` was three custom properties
cancelling a `color-mix` the site declared inline. Both are gone; what is left of
the first is its disabled state, which `--primary` genuinely has no word for.

Adopting the first exposed one more gap: `.axi-badge-count` fills with the accent,
and inside `.axi-btn--primary` — also the accent — the count was **invisible, not
dim**. The bridge had already discovered this and inverted the badge by hand. The
inversion is upstream now (1.30.1); the gallery never showed it because its only
badge example pairs it with `--dashed`, which is transparent.

### A third surface no theme had ever reached

The expanded log card's DPS-report button painted `color-mix(in srgb,
var(--brand-primary) 70%, transparent)` inline, with **no bridge rule over it at
all** — the same shape as the chart tooltips one slice ago. It is that card's one
primary action, so it says `.axi-btn--primary` and takes the accent outright. Three
more legacy custom properties left with it, and four more from the stats header's
split upload button, which was drawing `--accent-bg-strong`, `--accent-border`,
`--brand-primary` and `--panel-border-w` inline.

Deliberately not migrated here: **App.tsx's webhook trigger** and
**CommanderHeader's commander trigger**, which show the value they picked and are
`.axi-picker__btn`'s word, not the button's; and **SettingsNav's category rows**,
which are `.axi-rail__item`'s. All three still carry legacy `--bg-input` /
`--border-default` / `--accent-bg` inline, and are the picker slice's to collect.

**A split button is a shape this language has no word for.** The stats header's
upload control squares its join with an inline `borderRadius`, because a radius
utility there loses to `.axi-btn`'s shorthand. One site, recorded rather than
invented around.

### What came down

17 more dead bridge selectors, found by the liveness guard added in the previous
slice on its first run after a migration — which is the whole point of it. Plus the
two hand-drawn components above. 106 bridged selectors → 91.

### What this leaves

- **Pills (81 sites)** — now the largest block, and the one that unblocks the rest
  of `bg-white/*`. `.axi-pill` already exists with `aria-pressed` and
  `--axi-pill-fill`, so it is an adoption. `PillToggleGroup.tsx` is a segmented
  control with a sliding indicator and six legacy custom properties in inline
  styles; whether that is `.axi-tabs` or a word the language lacks is that slice's
  question.
- **Wells and panels (216 sites)** — the `.axi-well` adoption proper.
- **Links and bare glyphs (122 sites)** — no upstream word yet. A `<button>` with
  no chrome, `axi-ink-meta` and an underline is a link, and the language has
  `.axi-prose a` but nothing standalone.
- **List and menu rows (51 sites)**, **meters and bars (27)**, **chips (6)**,
  **tables (9)**.

## What the pills slice found

### The census was counting corners

"Pills (81 sites)" came from the shape. Classifying all 102 `rounded-full`
sites by what each one *is* gives five different objects, and only a handful of
them are pills:

| What it is | Sites | Object |
|---|---|---|
| A row of filters the reader picked, each dismissable | 38 | `.axi-chip --accent --action`, plus one `.axi-btn--xs` per row |
| A one-state action in a banner | 12 | `.axi-btn--xs` - the button slice could not take these, and the capsule was the only reason |
| A press that holds a state | 4 | `.axi-pill` with `aria-pressed` |
| A legend swatch, a status dot | ~12 | Not a control at all |
| A progress trough and its fill | ~10 | The meters slice |
| A calendar's day cells and month arrows | ~14 | A date picker, which the language has no word for |

The corner told us nothing: a 2px legend dot, a progress bar and a filter token
are all `rounded-full`, and none of them is the same object as the other two.

### One row, written four different ways, in inline styles

The filter row above a table - `[Clear all] [Damage x] [Boon uptime x]` - is
rendered by 14 stats sections, and every one of them spells it out by hand. The
25 tokens carry **no colour in any class**: border, fill and label are an inline
`style` object reading `--accent-border`, `--accent-bg` and `--button-label`.
That is why no sweep over Tailwind utilities ever found them, and why this block
holds more legacy custom properties than anything else the census had listed.

The dismiss glyph inside them is spelled three ways across those same 25 sites -
`style` with a literal `x`, `style` with `&times;`, and a `text-[color:...]`
utility - and a fourth copy of the whole row lives in `SkillUsageSection` as a
`<span>` with a nested icon button. Four spellings, one object.

### The glyph a reader clicks was the least visible thing in the token

Measured in the app's own cascade: the dismiss glyph at
`rgb(167, 176, 190)` on the accent fill `rgb(255, 197, 61)` is **1.39:1**. The
label beside it is **12.24:1**. A neutral from the ramp inside a fill is not
quieter, it is gone - and it is the part you are meant to aim at.

This is the second slice running to trip over the same thing; `.axi-badge-count`
inside `.axi-btn--primary` was the accent on the accent until 1.30.1. So rule 5
now states it generally - **inside a fill, the only inks are that fill's own
pair** - and the fix in both cases is to say nothing at all, because
`currentColor` already *is* the pair. The trap is that saying nothing looks like
an omission while `--axi-text-dim` looks like a decision. After adoption the
glyph measures 5.25:1 under this app's electric-blue accent.

**Recorded as a non-fix, with the reason.** The obvious static guard - no
descendant rule inside a fillable component may set a neutral `color` - was
written and then discarded, because it flags `.axi-tabs .axi-tabs__close`, which
is correct. Measured: every ancestor of that control is transparent down to
`body`, since the tab's fill sits on its *sibling* anchor. Whether a nested
element is on a fill is a fact about the paint chain, and a stylesheet does not
contain it. This one is checked by eye on purpose.

### A chip may be a press (1.31.0)

A chip is a mark - it states a value about the thing it sits on - and a mark has
no cursor and does not move. The filter token is still a chip, because "DAMAGE"
is data and "Clear all" is an action, which is exactly the distinction rule 5
exists to let a reader make. So `.axi-chip--action` adds the hand and the block
and **nothing else**: `--accent` and the three status fills each weigh one class
and set their own contrast pair, so a hover brighten would tie with them and win
on source order, putting a neutral back over a saturated ground. Guarded in both
directions - no colour on any `--action` rule, and the affordances it exists for
must still be there.

### The pill was not on its own scale (1.32.0)

The same finding as 1.30.0's, one component over. That release gave the button
three sizes because the app had three and the language had one. Here the language
had one size that was not on the scale at all: measured, `.axi-btn` at
`12px 20px` and 43px tall against `.axi-pill` at `10px 9px` and 39px - the pill's
sides less than half the button's. The only thing a pill has that a button does
not is a state, so two of them carrying the same label being different shapes is
just drift.

`--axi-pill-pad` and `--axi-pill-size`, and `--sm` / `--xs` with the button's
numbers verbatim. Nothing in either rule had ever said the two were meant to
match, which is how they drifted, so a test holds them in step now.

### PillToggleGroup is a row of pills, which is what its name says

50 call sites, a sliding indicator positioned by reading `offsetLeft` in a layout
effect, an enclosing bordered trough, and seven custom properties in inline
styles. Three things came out of reading it:

- **`activeClassName` was dead.** The component destructured it to `_` and never
  used it. All 50 call sites passed the same string.
- **`inactiveClassName` was three spellings of "dim text"** - which is what an
  unpressed pill already is.
- **The trough and the indicator were a second frame** drawn around controls that
  carry their own edge, and a fill whose position had to be measured because it
  was not attached to the thing it marked.

`.axi-pill --xs` with `aria-pressed` says all of it, and the appearance and the
accessibility tree can no longer disagree. `.axi-tabs` was considered and
rejected: it is the app's primary nav strip, and a four-option selector inside a
card is not that. The language's own comment says the two share a grammar - the
current tab is filled and blocked "the same treatment a pressed pill gets" - so
picking the pill costs nothing and keeps the hierarchy.

100 dead prop lines across 26 files, the whole `--pill-group-*` /
`--pill-indicator-*` bridge block, the ref, the state and the effect.

### What came down

Five more dead bridge selectors, again surfaced by the liveness guard on its
first run after the migration - `bg-white/[0.05]`, `bg-white/[0.08]`,
`bg-cyan-500/15`, `bg-cyan-500/[0.08]`, `bg-white/20`. The whole
`--pill-group-*` / `--pill-indicator-*` block and its two ink rules went with the
component. Counting the way the guard itself counts - distinct Tailwind
utilities bridged under `[data-axi-accent] body` - that is **89 -> 84**.

And the number that matters most for the remaining distance: **references to
legacy custom properties in the markup went 2,614 -> 2,214**. 400 in one slice,
because this is where they were living - not in class names any sweep could see,
but in inline `style` objects on 38 filter tokens, 50 toggle groups and the
seven levers the group's trough needed.

### What this leaves

- ~~**Wells and panels (216 sites)**~~ - done; the count was a fill, and the
  160 tags under it were ten different objects. See the wells section below.
- **Links and bare glyphs (122 sites)** - still no upstream word. A `<button>`
  with no chrome, `axi-ink-meta` and an underline is a link; the language has
  `.axi-prose a` and nothing standalone.
- **The metric picker list (~30 sites)** - found while censusing this slice, and
  not on the census before. Every stats section renders the same
  `w-full text-left px-3 py-1.5` row with an active state of
  `bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)]`. That is
  `.axi-rail__item`'s word, and it is where `--accent-bg-strong` and
  `--brand-primary` actually live.
- **A calendar (~14 sites)** - `FilePickerModal`'s day grid and month arrows. A
  date picker is a shape the language has no word for, and inventing one for a
  single consumer is not obviously right.
- **List and menu rows (51)**, **meters and bars (27)**, **chips (6)**,
  **tables (9)**.


## What the wells slice found: one colour name, ten objects

The previous section named **Wells and panels (216 sites)**, the largest block
left. The number came from a fill — every site painting `--bg-card-inner`,
`--bg-input` or a `bg-black/N`. Parsing whole JSX opening tags rather than lines
(the same `tagEnd` walker the buttons and pills slices needed, because
`onClick={() => …}` contains a `>`) finds **160 such tags**, and the tag name
alone splits most of them:

| what it is | sites | the word it wanted |
|---|---|---|
| a well | 50 | `.axi-well` (+ the new `--sm`) |
| a press with a resting fill | 35 | `.axi-btn` / `.axi-pill` |
| a text field or a select | 28 | `.axi-input` / `.axi-select` |
| rendered markdown | 4 maps | `.axi-prose` |
| a quoted literal | 7 | `.axi-code` (new) |
| a trough a bar fills | 7 | `.axi-meter` |
| a chip | 8 | `.axi-chip` |
| a band cut into a surface | 4 | *no word yet* |
| a modal scrim | 2 | `.axi-scrim` — but see below |
| a table header row, an SVG stroke | 2 | neither is a surface |

Then the "well" column split again on reading. A modal scrim, a status banner,
five inline annotations, two joined control groups and a checkbox were all in
it, because all six painted a container-scale neutral fill. **The fill is not
the unit.** This is the third slice running where the census's own count came
from a property rather than an object, after the corner (pills) and the tag
(buttons).

### Four copies of a typography layer that was never installed

`HowToModal`, `WhatsNewModal`, `SettingsView` and `reportApp` each passed
ReactMarkdown a `components` map spelling out `h1 h2 h3 p ul ol li blockquote
table th td pre code` by hand — three of them with the identical element set.
`.axi-prose` covers every one of those elements, including `ol`, which a first
pass over the selector list appeared to show missing and which a second pass
found declared in a comma form.

The container of one of them asked for `prose prose-invert prose-p:my-3
prose-li:my-1`. **`@tailwindcss/typography` is not a dependency of this app.**
Those four classes emit nothing, and the hand-written map below them was the
only typography there had ever been.

What survives the migration is only what prose cannot know: the heading ids the
metrics-spec table of contents scrolls to, an `img` implementing the how-to's
own `icon:` protocol, an `a` that has to be a `<button>` calling `openExternal`
because an `<a href>` in Electron navigates the renderer, and a table wrapper
carrying nothing but a scroll. With prose owning the type, the three heading
factories in each of two files stopped differing by anything but their tag, and
collapsed to one.

### A measured bug, found by counting spellings

The three surviving `code` overrides tested "is this inline" three ways:
`inline ?? !className` twice, and `inline === true` once. **react-markdown
removed the `inline` prop in v9**, and this app is on 9.1.0. Rendering a
document with both forms and logging the props:

```
inline span:  {}                          inline===true => false   inline ?? !className => true
fenced block: {"className":"language-js"} inline===true => false   inline ?? !className => false
```

So `reportApp`'s copy — the published web report — rendered **every inline code
span through the fenced-block branch**: no box, no mono, just wrapped text. The
other two stayed correct only via a fallback written for a prop that no longer
exists. Prose fixes it by asking the DOM instead: `code` styles every literal,
`pre code` unstyles the one inside a block. There is no prop to go stale.

### Upstream: axi-design 1.33.0 and 1.34.0

**1.33.0 — `.axi-code`.** The language's only word for a quoted literal was
`.axi-prose code`, reachable only by adopting a whole typography layer for a
document. A consumer naming one slash command inside a sentence of interface
copy cannot do that without restyling the sentence, so it draws its own box:
this app had **three spellings across six spans, and the sixth had given up and
drawn no box at all**. Shipped as ONE rule carrying both selectors
(`.axi-code, .axi-prose code`), not two rules that agree, with a test that
asserts they are in the same rule — because only that assertion fails when
someone splits them. Sized in `em` so a literal tracks the text around it; on
`--axi-ground` where `.axi-kbd` is on `--axi-surface`, for the reason already
written beside the key. RULES.md states the general form: *a style only
reachable through a layer will be re-invented*.

**1.34.0 — `.axi-well--sm`.** `.axi-well`'s comment has always said a well is
used at two scales and that reading-scale instances "say `--axi-radius-sm` here
rather than reaching for a modifier". That is right for the handful it imagined;
this consumer has fifty, and fifty inline style attributes is what a class
exists to prevent — the same argument that produced `.axi-btn--sm` one release
earlier. The modifier sets the radius and nothing else, pinned by a test to
exactly one declaration. Measured under glass: well 16px / `--sm` 10px, pad
10px on both.

### The trap this slice had to measure first

**axi.css loads after Tailwind** (`index.css` imports utilities at line 4 and
axi.css at line 12; in the built bundle `.p-3` is at byte 20,588 and `.axi-well`
at 51,703). So adding `axi-well` to a `p-3 rounded-[4px]` div silently resets
both its padding and its radius. Every adoption site in this slice states its
pad through `--axi-well-pad` or deliberately takes the well's own.

### A regression caught before it shipped

Two modal scrims looked like an easy `.axi-scrim` adoption. **`.axi-scrim` is
`z-index: 50` and `.axi-sheet` is `z-index: 45`** — the scrim would have landed
*above* the pane it exists to dim. `.axi-scrim`'s z is tuned for the drawer
(z-51) and is not a knob, so no consumer stacking it under anything below 50 can
use it. Left unmigrated; `z-index: var(--axi-scrim-z, 50)` is the one-line
upstream fix and is not yet made.

### What this slice changed

- The **four markdown maps** collapsed onto `.axi-prose`, and with them the
  broken `inline === true` branch in the published report.
- **31 wells** onto `.axi-well --sm`; the **8 expanded-card tiles** onto
  `.axi-panel--tile`, which deleted the `--detail-tile-*` reskin entirely — three
  indirection variables carrying two facts — and with it the dead
  `log-detail-tile` class, which by then styled nothing and located nothing.
- **6 code spans** onto `.axi-code`, **4 inline annotations** onto `.axi-chip`.
- The Cloudflare connect panel's three tones became a well wearing a status
  edge, deleting `bg-emerald-400/5` and `bg-amber-400/5` — **rule 2 exactly**: a
  colour at partial opacity over the ground.
- The liveness guard fired a **fourth** time, on `shadow-inner`, whose last two
  users were the tiles. Bridged utilities **84 -> 83**.
- Legacy custom-property references in `.tsx`: **2,537 -> 2,410** (measured with
  one method against both trees, rather than reusing a figure a different method
  produced).

### Still open after this slice

- **The presses (35) and the fields (28)** found by this census — the two
  largest blocks the fill was hiding. `.axi-input` sets `width: 100%`, which
  outranks a Tailwind width for the same reason `.axi-well` outranks `p-3`, so
  the narrow fields need the wrapper the manifest's own search example
  prescribes.
- **The band** (4 sites, plus the expanded log card's drawer): a region flush
  inside its container, cut from it by one line, with no radius. Not a well — a
  well is free-standing, edged all the way round and cornered. The drawer's fill
  and cut stay in `axi-design.css` with that reason written down.
- `.axi-scrim`'s fixed z-index, above.

## The fields the fill was hiding (28 sites)

`.axi-input`, `.axi-select` and `.axi-search` all existed upstream and none was
in use. What the 28 sites had instead:

**Nine different focus treatments.** `focus:border-white/30`,
`focus:border-cyan-400/50`, `focus:border-blue-500/50`, `focus:border-blue-500`,
`focus:border-purple-500/50`, `focus:border-rose-500/80`,
`focus:ring-sky-500/60`, `focus:ring-emerald-500/60`, `focus:ring-cyan-500/30` —
and `focus:ring-[color:var(--brand-primary)]`, the only one that followed
anything. Every one of them sat behind a `focus:outline-none`, and axi.css
carries a global `:focus-visible { outline: 1px solid var(--axi-accent);
outline-offset: 2px }`. So each field was switching off an accent ring at
control weight, 2px clear of the box, and substituting a border tint — several
of them at low alpha, all of them a fixed hue. `focus:outline-none` in the
renderer went **50 -> 23**, and none of the remaining 23 is on a field.

**Two hand-drawn selects.** `.stats-view .fight-diff-select` and the unscoped
`.app-native-select` did the same job — strip the native chrome, supply a
chevron — with SVG data URLs whose strokes were hard-coded `#cbd5e1` and
`#8d95a0`. `.axi-select` draws its caret as two gradients in `var(--axi-accent)`:
no image, and it follows the accent.

**A deliberate non-migration that stopped being necessary.** The census recorded
the native `<select>` popup fill as something to leave alone: Chromium on Linux
paints the OS option popup from the control's own background, so a translucent
control gives an unreadable list, and the app pinned both selects to
`rgba(15,18,25,.9) !important` with ten
`<option className="bg-slate-900">` in the web report to match. **`.axi-select`
fills with `--axi-ground`, which is `#0a0c10` under glass — fully opaque.** The
workaround had nothing left to work around; the override and all ten option
literals are gone. (Upstream's own `option` styling is real but sits behind
`@supports (appearance: base-select)`, which this Electron does not have, so the
list is still native — the control's opacity is what makes it readable.)

**The width trap.** `.axi-input` declares `width: 100%`, which outranks a
Tailwind `w-32` for the same reason `.axi-well` outranks `p-3`. Five narrow
fields state a width; one turned out to already sit in a `w-52` rail, where full
width was the right answer all along.

Four web-report selects also lost `bg-white/5` — rule 2 again.

Liveness guard, **fifth** catch: `bg-black/50` died with the GitHub owner
select. Bridged utilities **83 -> 82**. Legacy custom-property references
**2,410 -> 2,324**.

*Not* claimed: that the focus ring renders. `:focus-visible` does not match on
programmatic focus in a headless render, so the probe written for it proved
nothing either way. What is checked is the source fact — the rule exists in
axi.css and no migrated field suppresses it.

## The presses (35 sites)

The last block the fill was hiding, and the one where the most upstream
vocabulary already existed unused.

**`--axi-pill-fill` was built for the case the app hand-wrote.** The pill's own
comment says its pressed state "fills with whatever colour the consumer has put
on it, so the control reads as the thing it filters to rather than as a generic
selected", set through `--axi-pill-fill`. The top-stat toggles in Settings did
exactly that by hand: `${meta.color}1f` over the ground with a `${meta.color}66`
edge — a colour at partial opacity over the ground, which is rule 2.

Inside it was the same defect this migration keeps finding. The on-state swatch
was painted `meta.color` on a pill about to be filled `meta.color` — invisible —
and its check was stroked `#0f1115`, a near-black hand-picked to read against one
of the two states. Both are `currentColor` now, which is rule 5's *inside a fill,
the only inks are that fill's own pair*, written upstream two releases ago.

**A selected card takes the accent edge, not the accent fill.** Five option
cards (three metric choices, two close-behaviour choices) are `.axi-card`, which
was already a pressable card — `cursor: pointer`, `text-align: left`,
`width: 100%` — and had no consumer. Their selected state does *not* reuse
`.axi-pill[aria-pressed]`'s accent fill: a reading-sized card filled accent puts
a summary paragraph inside a fill, which is the trap above. `.axi-edge-accent`
already exists in the ink layer, so this needed no upstream change. Same ruling
as the Cloudflare panel earlier in this slice.

**Three dropdown triggers, deferred since the buttons slice, are closed.**
`.axi-picker__btn` shares every declaration with `.axi-select` — the same box
worn by a button instead of a `<select>` — so the caret comes with it and each
site's hand-placed `ChevronDown` was deleted as a second arrow.

Also: eight round calendar arrows onto `.axi-btn--icon` (adopting the language
means taking its corner, so they are control-radius now, not circles); the
how-to tree's two levels onto `.axi-rail__item` with `aria-current`; four more
two-state controls onto `.axi-pill[aria-pressed]`.

**Three tests were asserting a hue, not a state.** `expect(quitBtn.className)
.toMatch(/red/)` passed because the markup happened to spell `bg-red-500/20`. It
tested which Tailwind colour was written, not which option is chosen. All three
now assert `aria-pressed`, which the markup did not previously carry and which
is the thing those tests were always about; the status edge is checked
separately.

Liveness guard, **sixth** catch: `bg-black/20`. Bridged utilities **82 -> 81**.
Legacy custom-property references **2,335 -> 2,278**.

Left deliberately: `RotationTrack`'s cast blocks, which are data marks in a
timeline rather than controls, and the five replay-map controls written entirely
in inline style objects — those belong with the replay chrome, not here.
