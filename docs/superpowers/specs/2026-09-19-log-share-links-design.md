# Log Share Links — replacing the dps.report permalink

**Date:** 2026-09-19
**Status:** Design approved, ready for planning

## Problem

AxiBridge uploads every parsed log to `dps.report/uploadContent` for one reason:
to get a shareable permalink. Parsing moved in-process to axilog long ago, and
`dps.report/getJson` is dead. The dependency now buys exactly one replaceable
feature, and it costs us:

- Log sharing lives outside our control — uptime, retention, rate limits, link format.
- Every log is uploaded whether or not anyone will ever open it, because upload
  used to be how you got your stats at all.
- `permalinkWait.ts` makes the local parse path wait on a network round trip that
  no longer has anything to do with parsing.

We want our own short, shareable link — `axibridge.gg/r/k3Xm9qR2` — without
taking on a storage bill that compounds with our own success.

## Measured baselines

All figures measured 2026-09-19 against a real 4434-log arcdps folder and repo
fixtures. These drive every sizing decision below; do not re-derive them from
estimates.

| Quantity | Value |
|---|---|
| Real log folder | 4434 logs / 246 days / 13.72 GiB |
| Accumulation rate | 18 logs/day, **1.70 GiB/month** (one heavy user) |
| `.zevtc` size | mean 3.2 MiB, p50 2.4, p90 6.1, p99 19, max 55 MiB |
| `.zevtc` compressibility | **none** — magic `504b0304`, already a zip |
| EI-shaped JSON | 22.5 MB raw → 1.5 MB gzip (14.6x) |
| Native axilog JSON, typical (42p) | 5.6 MB raw → **0.78 MB gzip** |
| Native axilog JSON, large | 30.8 MB raw → **4.2 MB gzip** |

Native axilog is ~2–3x the EI tier gzipped. We store native anyway: it is the
source of truth, carries fields the EI compat shape drops, and avoids compat-shim
drift. Going native costs storage; it does not save it.

## Architecture

### Link format

`axibridge.gg/r/<code>` where `<code>` is 8 base62 characters (~2.2x10^14 space,
random, collision-safe). Short and tidy, comparable to a dps.report link.

### Three storage tiers

| Tier | Contents | Who pays | Size |
|---|---|---|---|
| 0 — Pointer | id → location + OG summary | **Us** (Cloudflare KV) | ~300 B/link |
| 1 — Report | native axilog JSON, brotli | **User** (their R2, else their Pages) | 0.8–4 MB |
| 2 — Raw | original `.zevtc`, opt-in | **User** | ~3 MB |

Tier 0 is our entire permanent footprint: 1M links ≈ 300 MB, within Cloudflare
KV's 1 GB free tier. Our cost scales with the number of distinct links, not with
how much anyone plays.

Tier 1 reuses the existing `planSidecarHosting()` ladder verbatim — user's R2 if
connected, else their Pages repo if it fits, else refuse with a stated reason. No
new hosting logic; the existing logic gains a new artifact kind.

Tier 2 is opt-in and exists for one reason: native output shape changes on axilog
bumps and the standing remedy is re-parse. With the raw log retained, a stale
report is regenerable. Without it, a link is frozen at whatever axilog version
wrote it.

### Why the pointer tier exists

Encoding the location directly in the URL would remove Tier 0 entirely, but it
hardcodes storage location into every link ever published. A user who moves off
GitHub, rotates a repo, or hits a quota breaks their whole history. With
indirection, relocation is a KV rewrite and every old link keeps working.

The pointer tier buys three things for its 300 bytes:

1. **Relocation** — links survive a user changing where their bytes live.
2. **Discord unfurls** — the KV value holds a ~200 B summary (fight name,
   duration, squad size, map). The Worker emits real OG meta tags from it, so
   Discord renders a rich preview while the heavy JSON still loads client-side
   from the user's storage.
3. **Real LRU** — GitHub Pages cannot report whether anyone opened a report. The
   Worker resolves every link, so it stamps `lastSeen` in KV for free. Eviction
   becomes genuine least-recently-used instead of blind age-sorting.

## Retention

The binding constraint is that GitHub Pages is a **~1 GB ceiling**, not a monthly
bill. At 0.8–4 MB per native report that is roughly 250–1250 reports before a
user hits a wall. Retention is therefore **budget-driven, not age-driven** — a
fixed "delete after 90 days" evicts too early for a casual player and far too
late for a raid commander.

### Demote, never delete

Eviction proceeds in stages:

| Stage | Kept | Size |
|---|---|---|
| Full | native JSON + replay | 0.8–4 MB |
| Demoted | stats tables, replay dropped | ~0.3–1.4 MB |
| Tombstone | KV summary card only | ~300 B |

The demote step reclaims roughly two-thirds of a report's bytes because replay
data is ~66% of it, while keeping every stat table. The tombstone *is* the Tier 0
OG summary we already store, so the floor costs nothing extra and **a link never
404s**. A two-year-old AxiBridge link in a Discord scrollback still renders its
result card — an advantage over dps.report, whose links eventually die.

### Enforcement

Runs at publish time, when we already hold the token, the repo and
`reports/index.json`:

1. Extend each `reports/index.json` entry with `bytes` and `stage`.
2. Compare total against a high-water mark, default **80% of 1 GB**.
3. Demote oldest-unseen-first (by KV `lastSeen`) until under the mark.
4. Pinned reports are exempt at every stage.

Plus a manual "Reclaim space" action in Settings. No cron, no background service.

R2-backed users get a different default: their ceiling is a dollar figure, not a
gigabyte one, so no automatic eviction — a configurable budget with a warning
instead. Retention protects Pages users from a wall; R2 users only face a slope.

### Known limitation

GitHub Pages also has a ~100 GB/month bandwidth soft limit. A link that goes
viral in a large WvW Discord is a bandwidth problem, not a storage one, and
retention does not help. R2's free egress does. For v1 this is a documented
limitation and a reason to steer heavy users toward connecting Cloudflare.

## Ingest and publish flow

### Sharing decouples from parsing

Today every log auto-uploads and `permalinkWait.ts` blocks the local parse path
on the result. That coupling existed only because dps.report was the parser. The
new path never blocks on the network; `permalinkWait` has no role in it.

Sharing becomes an explicit user action rather than a side effect of parsing.
This is also the single largest cost lever in the design: an unshared log costs
nothing because it is never uploaded.

### ShareService

New `src/main/shareService.ts`, composing existing parts:

1. Take the already-parsed native block from cache — no re-parse, no re-read of
   the `.zevtc`.
2. Brotli-compress it.
3. Write Tier 1 through the existing ladder (`cloudflare/uploader.ts` for R2,
   else the Pages blob path).
4. `POST /r` to the Worker with `{location, summary}`; receive the code.
5. Stamp `shareUrl` on the log.

### Worker

Three routes:

- `POST /r` — create pointer. Authenticated with the GitHub token the app already
  holds; rate-limited per GitHub identity.
- `GET /r/<code>` — emit OG meta from the KV summary, serve the viewer, stamp
  `lastSeen`.
- `PATCH /r/<code>` — demote/tombstone, called by retention at publish time.

No new identity system.

### Viewer

`dist-web/` already loads a `report.json` and renders `StatsView` plus the
rollup. Pointing it at a Tier 1 URL instead of a bundled file makes the existing
third Vite target the share viewer. We do not build a viewer.

### Identity

Add `shareId` and `shareUrl` as fields distinct from `permalink`.

`statsLogKey` keys on `filePath || id`, so squad stats, the worker payload store
and the fight slicer are unaffected. Three places treat the permalink as an
identity and read `shareUrl || permalink` during transition:

- `src/renderer/stats/hooks/useStatsUploads.ts:290` — `logs.map(l => l.permalink)` as logIds
- `src/renderer/stats/incrementalAggregation.ts:562` and `:571` — fight-level keying

Old logs keep working untouched.

### Coexistence, not cutover

`uploader.ts` stays as-is for v1 and dps.report links keep being generated. Share
links land alongside them. Removing the dps.report path is a separate decision
made only after share links prove out in the wild.

## Testing

The valuable surface is pure logic and needs no network:

- **Retention ladder** — synthetic `index.json` plus a budget; assert demote
  order, pinning exemption, and that a tombstone never deletes the pointer.
- **Brotli round-trip** and pointer-shape validation.
- **Worker routes** under vitest/miniflare.
- **Identity transition** — a log with only `permalink`, one with only
  `shareUrl`, one with both, through the three identity call sites.

Nothing tests against live GitHub or live R2.

## Risks

| Risk | Response |
|---|---|
| Abuse of `POST /r` | Rate-limit per GitHub identity in v1; revisit if the service gets popular. |
| Pages bandwidth on a viral link | Documented limitation; steer heavy users to R2. |
| axilog shape drift staling Tier 1 | Tier 2 raw retention makes reports regenerable. |
| Pages 1 GB ceiling | Budget-driven retention, enforced at publish time. |

## Out of scope

- Removing `uploader.ts` / the dps.report path.
- A custom compression format — deliberately deferred; v1 uses brotli. See the
  post-v1 follow-up, which carries the baselines to beat.
- Accounts, leaderboards, or any identity system beyond the existing GitHub token.
- Server-side parsing. Tier 1 is written by the client from an already-parsed
  native block.
