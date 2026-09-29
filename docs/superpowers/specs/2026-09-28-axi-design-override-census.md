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
