# AxiTools Discord Bridge — Design

**Date:** 2026-09-17
**Status:** Approved design, not yet implemented
**Repos touched:** `axibridge` (Electron/TS), `axitools` (Python Discord bot)

## Problem

AxiBridge posts fight reports to Discord through user-supplied webhooks. Webhook
messages cannot render custom emoji that the webhook's guild does not own, so the
class and elite-spec indicators in embed mode fall back to Unicode glyphs from
`PROFESSION_EMOJI` (`packages/bridge-metrics/src/professionUtils.ts`). Those glyphs
carry no class identity, and there is no way to add custom emoji to a webhook.

Discord **application emoji** (app-owned, ~2000 per app) solve this: a bot can use
its own app emoji in any guild it is installed in, with no guild upload and no
external-emoji permission. The constraint that drives this whole design is that app
emoji render **only in messages sent with the bot token** — a webhook can never use
them.

AxiTools is an existing multi-guild Discord bot that already ships the icon set
(`media/gw2classicons/`, 43 PNGs) and already exposes an authenticated HTTP API with
per-guild keys (`axitools/api/server.py`) and a bot-executed `message.send` action
(`axitools/api/discord_actions.py`). So the work is largely to reuse the AxiVale
bridge pattern for a new, narrower purpose.

## Goal

Let an AxiBridge user link a Discord channel served by the hosted Axi bot and have
fight reports posted **by the bot**, with real class/elite-spec emoji, instead of by
a webhook.

## Non-goals

- Bridging `reportWebhooks[]` (the web-report-link announcements). They post a URL
  and contain no emoji; bridging them doubles the surface for no gain.
- Emoji beyond professions and elite specs. No boons, conditions, skills, or squad
  markers in v1. The registry is built so adding them is data-only.
- Discord OAuth sign-in. Considered and deferred; the channel-token model below is a
  strict subset of what OAuth would authorize, so OAuth can be layered on later
  without changing the transport.
- Moving embed formatting into the bot. AxiBridge stays the single formatter.

## Decisions made during design

| Decision | Chosen | Rejected |
|---|---|---|
| Audience | Hosted public Axi instance — anyone who invites the bot | Self-hosters only |
| Linking | Channel-scoped pairing token via `/bridge pair` | Discord OAuth; reusing guild-wide `axt1` keys |
| Message construction | AxiBridge renders, AxiTools relays + substitutes emoji | Bot formats from structured stats; AxiBridge substitutes locally |
| Emoji ownership | AxiTools owns registry, upload, and substitution | AxiBridge caches emoji ids |
| Emoji scope | Professions + elite specs (~43) | + metric icons; full catalog |

## Architecture

### Destinations

`IWebhook` (`src/renderer/global.d.ts:5`) becomes a tagged union:

```ts
export interface IWebhook {
    id: string;
    name: string;
    url?: string;                       // webhook destinations
    kind?: 'webhook' | 'bridge';        // absent === 'webhook'
    relayUrl?: string;                  // bridge: decoded from the key
    token?: string;                     // bridge: the axb1 key
    guildName?: string;                 // bridge: display only
    channelName?: string;               // bridge: display only
}
```

`kind` absent meaning `'webhook'` keeps every persisted destination working with no
migration.

`DiscordNotifier` (`src/main/discord.ts:278`) holds a destination object rather than
a `webhookUrl` string. `setWebhookUrl` is retained as a thin wrapper that builds a
webhook-kind destination, so the existing call sites in `src/main/index.ts`
(`:1246`, `:1641`, `:1680`, `:1683`) keep compiling while a `setDestination` is added
alongside.

Both existing send paths — `FormData` + PNG for image mode, embed JSON for embed
mode — are unchanged up to the final call, which branches:

- `webhook` → `axios.post(url, …)`, byte-identical to today.
- `bridge` → `POST {relayUrl}/bridge/report`, `Authorization: Bearer <axb1…>`, same
  payload object; PNGs as multipart parts when present.

### Emoji tokens

Bridged embeds carry semantic tokens, not emoji. A sibling to
`getProfessionEmoji()` — `getProfessionEmojiToken()` in
`packages/bridge-metrics/src/professionUtils.ts` — returns `{{spec:firebrand}}`:
the lowercased **elite spec** name (not the base profession, unlike
`getProfessionBase()`), so the token key space is the `gw2classicons` filenames
lowercased and minus extension — with one normalization: the assets are bare names
(`Guardian.png`, `Firebrand.png`) except `Revenant_icon.png`, so the registry strips a
trailing `_icon`. Core (no elite spec) players use the profession name itself, e.g.
`{{spec:guardian}}`.

Two renderers for one concept is deliberate: the webhook path must keep working for
every user who never pairs, and its output is pinned by the audit scripts.

AxiBridge never learns an emoji id. Substitution is entirely AxiTools'.

### Relay endpoint

`POST /bridge/report` does **not** forward raw Discord JSON. It validates against a
narrow whitelist — `content`, and per embed `title`, `description`, `color`,
`footer`, `fields[]{name,value,inline}` — rejecting any other key, and attachments
must be PNG. Anything else makes a public relay an open "post arbitrary JSON as the
Axi bot" proxy.

Order of operations on the relay:

1. Authenticate the key, resolve `{guild_id, channel_id}`.
2. Rate-limit per key.
3. Validate the payload against the whitelist.
4. Substitute `{{spec:*}}` tokens from the emoji registry.
5. Enforce Discord length limits **on the substituted text** (see below).
6. Enqueue for the send worker.

`GET /bridge/whoami` returns `{guild_name, channel_name}` for paste-time validation.

### Character budget — why truncation lives on the relay

Discord counts the **raw** markup against its limits (1024 per field value, 6000 per
embed). `<:firebrand:1234567890123456789>` is ~30 characters where `⚔️` was 1–2, and
the token `{{spec:firebrand}}` is 18 — so the payload **grows** during substitution,
after AxiBridge has already done its truncation math. A 20-row class summary spends
~600 characters on emoji markup alone.

Therefore **AxiTools owns limit enforcement**, measuring real substituted lengths and
truncating at row boundaries (never mid-`<:name:id>`). AxiBridge may keep a
conservative estimate for its own preview, but the relay owns correctness. Without
this, a report that fit before substitution returns `400 Invalid Form Body`.

### Send worker

Report sends are enqueued rather than sent inline on the HTTP request. A hosted bot
shares one **global** rate-limit bucket across all guilds, so a guild dumping 40 logs
must not make `/comp` signups or RSS posts feel laggy for everyone else.

### Performance notes

- Client rendering: app emoji are a single CDN image per id, cached by the client
  forever. A report references ≤43 distinct ids, so cost is a one-time fetch.
- Bot channel sends allow ~5/5s per channel, comparable to webhooks; attachment caps
  are identical.
- Image-mode PNGs now traverse the relay host, making them your egress rather than
  the user's.

## Pairing & token security

### Key format

`axb1.<base64url(public_url)>.<secret>` with `secrets.token_urlsafe(32)`, mirroring
`generate_app_key` (`axitools/api/server.py:90`). AxiBridge decodes segment 2 to get
`relayUrl`, so the user never types a URL and the relay can move hostnames by
reissuing keys.

Persist `sha256(key)` only (`hash_app_key`, `:99`), alongside
`{guild_id, channel_id, created_by, created_at, last_used}`.

### Scope isolation

The distinct `axb1` prefix is the security boundary:

- `axb1` keys authenticate **only** `/bridge/*` and carry a channel scope.
- `axb1` keys are rejected on every `/guilds/*` route.
- `axt1` keys are rejected on `/bridge/*`.

AxiBridge stores its credential in plaintext config on thousands of machines, so its
maximum blast radius must be "posts a fight report to one channel." The existing
`_auth_middleware` (`:104`) is extended to recognize the new prefix and set a
`bridge_scope` on the request, keeping the same hash-lookup and out-of-band
`touch_app_key` behaviour.

### Pairing flow

An admin with **Manage Server** (matching `/config apikey generate`) runs
`/bridge pair` **in the destination channel**. The bot replies ephemerally with the
key, shown once. The channel comes from the invocation context, not a parameter — so
a key cannot be minted for a channel the invoker cannot see, and there is no
channel-picker to validate.

Because the slash command only exists where the bot is installed, pairing *is* the
"is AxiTools in this server?" check. AxiBridge never needs to ask.

`/bridge list` shows active pairings with last-used and creator. `/bridge revoke`
drops one.

### Errors

- Unknown/revoked key → uniform `401`, indistinguishable from never-existed.
- Channel deleted, or bot lost `Send Messages` → `403` with a specific reason, so
  AxiBridge can surface it rather than retrying forever.
- Over quota → `429` with `Retry-After`. Token bucket per key (10 reports/min, burst
  5), so one guild cannot starve another.

### Deliberate omissions

No mutual TLS, no signed bodies, no replay protection. The worst a captured token
does is post a fight report to a channel that opted into fight reports, and each
extra mechanism is one more thing to debug across a Cloudflare Tunnel.

## Emoji registry & sync

### Registry

A generated mapping of token name → app emoji id, derived from the contents of
`media/gw2classicons/` rather than hand-curated. A new elite spec is a PNG drop plus
a re-run. Stored with a content hash per source file, because Discord has no
emoji-update endpoint: a changed icon is a delete plus a create and therefore a **new
id** — which is exactly why the registry is consulted at substitution time and never
cached in AxiBridge.

Loaded into memory at bot-ready from `GET /applications/{id}/emojis`, refreshed after
a sync.

### Sync command

`python -m axitools.scripts.sync_emoji`, plus a `/dev` command in non-production
(matching `/dev updatenotes`, `/dev rsstest`). It diffs the directory against the
app's current emoji and uploads what is missing or changed.

Explicitly **not** run at startup: app emoji are global to the application, a startup
uploader races every restart and every deployed replica, and a bad asset would break
boot instead of failing one command.

### Asset normalization

The shipped PNGs are not upload-ready — they range 256×256 to 750×750, several are
non-square (`Bladesworn.png` is 572×599), and several exceed Discord's 256KB cap
(`Amalgam.png` 477KB, `Catalyst.png` 294KB). The uploader therefore:

1. Pads to square on the shorter axis with transparency — never stretches, which is
   what makes non-square icons look subtly wrong.
2. Downscales to 128×128 (what Discord serves emoji at anyway).
3. Re-encodes PNG, landing every file well under 256KB.

### Substitution

Scan validated text fields for `{{spec:([a-z]+)}}` and replace with `<:name:id>`.
A miss degrades to the capitalized spec name in plain text, so a report from a newer
AxiBridge naming a spec the bot has not synced still posts readably. That graceful
miss is what lets the two projects ship on independent schedules — which, for a
hosted relay serving auto-updating desktop clients, is not optional.

## AxiBridge settings UI & failure behaviour

### Linking

The existing webhook list gains a second add affordance: *Add webhook* (unchanged)
and *Link AxiTools channel*. The latter takes one field — paste your `axb1.…` key —
with inline instructions ("In Discord, run `/bridge pair` in the channel that should
receive reports").

On save, AxiBridge decodes the relay URL from the key and calls
`GET /bridge/whoami`. Success stores the destination with the returned labels and the
row reads **Axi › #wvw-reports**; failure shows the relay's error and stores nothing.
Validating at paste time avoids a user discovering a typo'd key three hours later
when a raid's reports never appeared.

Bridge rows carry a badge distinguishing them from webhooks and expose *Unlink*
(local only — the token stays valid until `/bridge revoke`, which the UI states
explicitly so nobody thinks unlinking secured anything).

### The identity caveat

Bot sends cannot override `username` or `avatar_url`, which image mode currently sets
(`src/main/discord.ts:325`). Bridged posts therefore appear as **Axi** with the bot's
avatar, not "AxiBridge". The link form must say so, since a user who named a webhook
carefully may not want that.

### Failure handling — no silent fallback

A report is delivered where the user asked or it is not; AxiBridge never retries a
failed bridge send via another destination.

| Response | Behaviour |
|---|---|
| `429` | Honour `Retry-After`, retry once, then surface |
| `5xx` / network | Backoff, 2 attempts, then surface |
| `401` | Mark destination **unlinked**: "This link was revoked — pair again." No retries; the token is dead |
| `403` | Surface the relay's reason ("Axi can't post in #wvw-reports") |

Errors reach the user through the same path webhook failures use today; no
bridge-specific notification channel.

Accepted cost of a hosted relay: when the bot is offline, bridged users get nothing,
where webhook users would have been fine. UI copy should be honest about this.

## Testing

### AxiBridge (vitest, `src/main/__tests__/`)

- **Destination dispatch** — a `webhook` destination posts to the URL with a payload
  byte-identical to today's; a `bridge` destination posts to
  `{relayUrl}/bridge/report` with the bearer header. Axios mocked. This is the
  regression that matters most: the webhook path must be provably untouched.
- **Token rendering** — the same fixture yields `{{spec:firebrand}}` on the bridge
  path and the Unicode glyph on the webhook path.
- **Key parsing** — `axb1.<b64url>.<secret>` decodes to the right relay URL;
  malformed, truncated, and wrong-prefix keys are rejected without throwing.
- **Error classification** — `401` unlinks, `429` retries once honouring
  `Retry-After`, `5xx` backs off twice, and none of them fall back to another
  destination.

### AxiTools (pytest, `tests/`)

- **`test_api_bridge_keys.py`** — mirrors `test_api_app_keys.py`: mint, hash-only
  persistence, lookup, revoke, `401` uniformity. Plus the cross-scope assertions that
  *are* the security claim: `axt1` rejected on `/bridge/report`, `axb1` rejected on
  every `/guilds/*` route.
- **Payload validation** — table-driven: a real AxiBridge embed is accepted; unknown
  keys, `mentions`/`allowed_mentions` smuggling, oversized field counts, and
  non-PNG attachments are rejected. This is the open-proxy guard.
- **Substitution + truncation** — a known map substitutes correctly; an unknown
  token degrades to the plain spec name; a field that fits *before* substitution but
  exceeds 1024 after is truncated at a row boundary and never mid-`<:name:id>`, with
  explicit cases at the boundary. This is the bug the design exists to prevent.
- **`test_cogs_bridge.py`** — `/bridge pair` requires Manage Server, binds the
  invoking channel, responds ephemerally; `list`/`revoke` scope to the guild.
- **Uploader normalization** — run against the real assets: `Bladesworn.png`
  (572×599) comes out square, `Amalgam.png` (477KB) comes out under 256KB, neither
  stretched. Assert on output dimensions and byte size, not pixels.

### Manual

Actual Discord API calls are not covered automatically. Emoji upload, live
rate-limit behaviour, and how a substituted report actually *looks* get one pass in a
test guild. The design leaves a `/dev bridgetest` that posts a canned report so
spacing can be eyeballed after any emoji change.

## Implementation order

1. AxiTools: `axb1` key minting, storage, and middleware scope isolation (+ tests).
2. AxiTools: `/bridge pair|list|revoke` cog (+ tests).
3. AxiTools: emoji sync script and asset normalization (+ tests), then a real upload.
4. AxiTools: `POST /bridge/report` + `GET /bridge/whoami` — validation,
   substitution, post-substitution truncation, send worker (+ tests).
5. AxiBridge: destination union, `DiscordNotifier` dispatch, token renderer
   (+ tests).
6. AxiBridge: settings UI link flow and error classification (+ tests).
7. Manual pass in a test guild via `/dev bridgetest`.

Steps 1–4 are independently useful and ship without touching AxiBridge; a relay with
no client is harmless. Step 5 is the first point at which anything user-visible
changes.
