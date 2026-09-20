# Share-link flow (`bridge.axi.link/r/<code>`)

Text companion to `share-link-flow.png`. Same content, written for machine
reading. If the two disagree, this file is the one to trust — regenerate the
PNG from it.

**Actors** (the PNG's colour legend):

| Tag | Actor |
|---|---|
| `APP` | AxiBridge desktop (Electron main + renderer) |
| `STORE` | The user's own storage — their R2 bucket, or their managed `<reports-repo>-fights` Pages repo |
| `CF` | Cloudflare — the `axibridge-share` Worker, its KV namespace, its Durable Object |
| `WEB` | The viewing browser (whoever clicked the link) |

**The one invariant:** the Worker is never in the data path. Report bytes are
written to `STORE` *before* the Worker is contacted, and the viewing browser
fetches them *directly* from `loc`. Nothing carrying a log ever passes through
Cloudflare. This is why our permanent cost is ~300 B/link regardless of how
much anyone plays.

---

## Band 1 — MINT: creating a share link

1. **`APP` — Parse.** The log is already parsed in-process by axilog. The
   native block is taken from cache: no re-parse, no re-read of the `.zevtc`.
2. **`APP` — Compress.** gzip the native axilog JSON. (Native, not EI-shaped —
   it is the source of truth and carries fields the compat shape drops. The
   spec says brotli; the implementation ships gzip.) Typical 42-player fight:
   5.6 MB → 0.78 MB. Large: 30.8 MB → 4.2 MB.
3. **`APP` → `STORE` — Write the bytes.** Through the existing
   `planSidecarHosting()` ladder: the user's R2 if connected, else their
   `<repo>-fights` Pages repo via the Contents API, else refuse with a stated
   reason. AxiBridge provisions and manages that fights repo separately from
   the aggregate reports repo.
4. **`APP` → `CF` — `POST /r`.** Body ≤ 4096 B: `{loc, sum, bytes?, raw?}`.
   `loc` must be `https:` and ≤ 512 B. `sum` is the ~200 B card:
   `f` fight name, `m` map, `d` duration ms, `t` start epoch ms, `sq` squad
   size, `en` enemy count — each field ≤ 128 B.
   `content-length` is absent on chunked requests, so `readBodyCapped` streams
   with cancellation as the real guard.
5. **`CF` — Authenticate + rate-limit.** `resolveOwner` does one
   `GET api.github.com/user` with the caller's token and keeps only `login`.
   The `RATE_LIMITER` Durable Object, `idFromName(owner)`, allows 120 writes
   per rolling hour. PATCH shares this budget; it gets none of its own.
6. **`CF` — Allocate + store.** 8-char base62 code, up to 5 check-then-set
   attempts (KV has no put-if-absent, and a collision would hand PATCH rights
   over someone else's record). Two keys are written:
   - `p:<code>` — the `PointerRecord` (`v`, `loc`, `stage`, `sum`, `created`,
     `seen`, `owner`, optional `bytes`, optional `raw`)
   - `s:<code>` — a bare last-seen timestamp string

   The app stamps `shareUrl` on the log. `permalink` (dps.report) is a
   separate field and old logs keep working untouched.

---

## Band 2 — OPEN: resolving a share link

1. **`WEB` → `CF` — `GET /r/<code>`.** Code shape is validated before any KV
   read; a bad shape is a 404.
2. **`CF` — Read `p:<code>`.** The read path must **never write `p:<code>`**.
   An earlier version wrote the whole record back from a pre-render snapshot,
   which let an unauthenticated GET clobber a concurrent owner PATCH and
   un-demote a tombstone. Only `s:<code>` is stamped, and only via
   `ctx.waitUntil`.
3. **`CF` — Render the shell.** `renderPointerHtml` emits og:title /
   og:description / og:url and a canonical link built from the KV summary — so
   Discord unfurls a rich card without touching the heavy JSON — plus
   `<script id="axibridge-share" type="application/json">` carrying
   `{loc, stage}` (or `null` for a tombstone). `embedJson` escapes `<` to
   `<` and U+2028/2029, because `JSON.stringify` does not and the HTML
   tokenizer ends `<script>` at a literal `</script`.
4. **`CF` — CSP.** `default-src 'none'`; `script-src 'self' <viewer origin>`;
   `worker-src … blob:`; `style-src 'unsafe-inline' https://fonts.googleapis.com`
   (the explicit fonts host is **not** redundant — `src/renderer/index.css`
   opens with a remote `@import` that survives into the bundle);
   `img-src https: data: blob:`; `font-src https: data:`;
   `connect-src https:`; `base-uri`/`form-action`/`frame-ancestors 'none'`.
5. **`WEB` → `CF` — Load the viewer.** `<script type="module"
   src="${VIEWER_URL}/viewer.js">`. This is the existing `dist-web/` target;
   we did not build a second viewer.
6. **`WEB` → `STORE` — Fetch and render.** The browser fetches the gzipped
   native JSON **directly from `loc`** and computes every stat client-side via
   `computeStatsSync`. The Worker never sees it.

   `loc` is deliberately **not** SSRF-filtered — no private/loopback blocklist
   — because the Worker never fetches it. Requiring `https:` is what removes
   `javascript:` and `file:`. **If anything ever makes the Worker fetch `loc`
   server-side, that reasoning stops holding.**

---

## Band 3 — RETAIN: staying under the ceiling

> **Built but not yet wired.** The route, the ladder and the `bytes` field all
> exist. Nothing calls PATCH yet.

The binding constraint is that GitHub Pages is a **~1 GB ceiling**, not a
monthly bill — roughly 250–1250 native reports. Retention is therefore
**budget-driven, not age-driven**: a flat "delete after 90 days" evicts far too
early for a casual player and far too late for a raid commander.

1. **Measure.** Each `reports/index.json` entry carries `bytes` and `stage`.
   Compare the total against a high-water mark, default 80% of 1 GB. Runs at
   publish time, when we already hold the token, the repo and the index — no
   cron, no background service. Plus a manual "Reclaim space" in Settings.
2. **Demote, oldest-unseen-first** by the KV `seen` stamp (real LRU: GitHub
   Pages cannot tell us whether anyone opened a report, but the Worker
   resolves every link, so it stamps `seen` for free). Pinned reports are
   exempt at every stage.
3. **`APP` → `CF` — `PATCH /r/<code>`.** Same owner check, same rate budget.

**The ladder is one-way.** `STAGE_RANK` is `full(0) → demoted(1) →
tombstone(2)`; a PATCH may only increase the rank.

| Stage | Kept | Size |
|---|---|---|
| `full` | native JSON + replay | 0.8–4 MB |
| `demoted` | stats tables, replay dropped | ~0.3–1.4 MB |
| `tombstone` | the KV summary card only | ~300 B |

Demoting reclaims roughly two-thirds of a report because replay data is ~66%
of it, while keeping every stat table. The tombstone *is* the Tier 0 summary we
already store, so the floor costs nothing extra and **a link never 404s** — a
two-year-old AxiBridge link in a Discord scrollback still renders its result
card. That is the specific advantage over dps.report, whose links eventually
die.

R2-backed users get a different default: their ceiling is a dollar figure, not
a gigabyte one, so no automatic eviction — a configurable budget with a warning
instead.

---

## Why it is shaped this way

- **Why a pointer at all, instead of encoding `loc` in the URL?** A
  self-describing URL hardcodes storage location into every link ever
  published; a user who moves off GitHub, rotates a repo or hits a quota breaks
  their whole history. With indirection, relocation is a KV rewrite and every
  old link keeps working. The 300 bytes also buy Discord unfurls and real LRU.
- **Why does the user pay for the bytes?** Our permanent footprint is Tier 0
  only: 1M links ≈ 300 MB, inside Cloudflare KV's 1 GB free tier. Cost scales
  with distinct links, not with how much anyone plays. An unshared log costs
  nothing because it is never uploaded — sharing is an explicit action, not a
  side effect of parsing.
- **Why axilog-native rather than the EI shape?** Source of truth, carries
  fields the compat shape drops, and avoids compat-shim drift. It costs ~2–3x
  the EI tier gzipped; going native costs storage, it does not save it.
- **Known limitation.** Pages also has a ~100 GB/month bandwidth soft limit. A
  link that goes viral in a large WvW Discord is a bandwidth problem, not a
  storage one, and retention does not help. R2's free egress does.

---

## Where the code lives

| Piece | Path |
|---|---|
| Worker entrypoint, routing, `createPointer` / `resolvePointer` / `patchPointer`, CSP | `worker/src/index.ts` |
| `PointerRecord`, `ShareSummary`, `generateCode`, `isValidCode`, `parsePointer` | `worker/src/pointer.ts` |
| `renderPointerHtml`, `embedJson` | `worker/src/og.ts` |
| `resolveOwner`, `checkRateLimit`, `RATE_LIMIT_PER_HOUR` | `worker/src/auth.ts` |
| `ShareRateLimiter` Durable Object | `worker/src/rateLimiter.ts` |
| Client side: compress, write Tier 1, `POST /r` | `src/main/shareService.ts` |
| Design doc | `docs/superpowers/specs/2026-09-19-log-share-links-design.md` |

Deploys go through the Cloudflare MCP (`execute` → multipart
`PUT /accounts/{id}/workers/scripts/axibridge-share`), never the wrangler CLI.
Always verify a sha256 of the bundle inside the call and abort on mismatch: a
hand-transcribed base64 payload once silently lost 376 bytes and the API still
returned 200.
