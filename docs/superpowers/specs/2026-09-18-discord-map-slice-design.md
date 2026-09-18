# Discord Map Slice — Design

Date: 2026-09-18
Status: Approved for planning

## Problem

A Discord fight report tells you what happened but not *where*. Squads
routinely fight in three different corners of the same borderland in an
hour, and the report's map name ("Eternal Battlegrounds") does not
distinguish Anzalias from Golanta. The report should show the location.

## What we're building

A thin horizontal image at the bottom of the fight-report embed: a
zoomed crop of the actual WvW map around the fight, with a beacon
marking where the squad started and a fading trail showing where it
moved. A landmark caption names the place.

The image is decoration. Every failure path degrades to today's embed
with no image, never to a wrong image and never to a failed send.

### Framing

Crop the map around the squad's path, padded, and force the aspect
ratio to **5.2:1** (matches Discord's embed image slot without
excessive letterboxing).

The crop width is **clamped to a maximum of 1000 continent units**. A
fight that roamed further than that gets cropped rather than zoomed
out, and the trail runs off the edge. This is deliberate: the value of
the image is the recognisable hi-res terrain, and framing to the full
bounding box of a roaming fight destroys it. During mockup work a
fight that moved ~350 units framed to its bbox already pulled 105
tiles and lost most of the detail; unclamped roaming fights are worse.

Minimum crop width is clamped to **400 continent units**, so a
stationary fight does not zoom into a single tile of dirt. Output is
1120x215 pixels.

### Marker

- **Start beacon**: layered translucent rings under a gaussian glow,
  with a white-ringed red core on top. Prominent at Discord's rendered
  embed width, which is the only size that matters.
- **Trail**: the squad centroid path from the beacon, fading from
  opaque at the start toward transparent at the end.
- **End marker**: a small hollow ring at the last sample.
- **Caption**: nearest landmark name, bottom-left, from
  `findNearestLandmark` in `src/shared/wvwLandmarks.ts`.

No minimap inset. At Discord's embed width an inset renders around
65px — too small to read.

## Architecture

### Where the image is composed

**Geometry and tiles in main; pixels in the renderer, over IPC.**
Main builds a complete draw list and fetches the tiles, then asks the
renderer to paint it on a DOM canvas and return a PNG buffer.

Painting in main instead would need a native image library. The project has none: no `sharp`, `canvas`,
`@napi-rs/canvas`, `jimp`, or `pureimage` in `package.json`. Adding
one means per-platform prebuilt binaries, `asarUnpack` configuration,
and a new failure surface in electron-builder for both the Linux
AppImage and the Windows NSIS installer. The renderer already has a
canvas for free, already loads WvW tiles, and already hands PNG
buffers to main — image mode's `imageBuffer` plumbing is exactly this
shape. Reusing it costs one IPC round trip.

Trade-off accepted: the send path now depends on a live renderer.
AxiBridge is a desktop app whose renderer exists for the process
lifetime (closing to tray hides the window, it does not destroy it),
and the slice is optional anyway — if the request fails or times out,
main sends the embed without an image.

### Modules

Main owns all the logic. The renderer owns only the canvas.

This split is forced by CORS: `tiles.guildwars2.com` sends no
`Access-Control-Allow-Origin` header (the hi-res GitHub Pages host
sends `*`). Drawing a GW2 CDN tile into a renderer canvas taints it,
and `canvas.toBlob()` then throws `SecurityError` — which would break
precisely the fallback path for maps without hi-res art. Main fetches
tiles over Node HTTP where CORS does not apply, and passes the
renderer **data URLs**, which are same-origin and never taint.

Main also owns the disk cache, since it is the side with `fs`.

**`src/shared/sliceGeometry.ts`** — pure functions, no canvas, no
network, no Electron. Squad centroid path, EI-pixel to continent
projection, bbox, clamping, aspect forcing, and the continent-to-output
transform. Produces a `SliceDrawList`: output size, tile placements
(with URLs), the path in output pixels, and the caption. This is the
part that can be silently wrong and the part with no pixels in it, so
it is the part under test.

**`src/main/mapSlice/tileCache.ts`** — fetches tile URLs through a
disk cache, returns data URLs.

**`src/main/mapSlice/index.ts`** — orchestration: details in, PNG
buffer or null out. Builds the draw list, resolves tiles to data URLs,
asks the renderer to paint it, applies the timeout.

**`src/renderer/mapSlice/paintSlice.ts`** — takes a draw list whose
tiles are data URLs, paints tiles, trail, beacon, end marker and
caption to an offscreen canvas, returns PNG bytes. No map knowledge,
no projection, no network.

### Coordinate pipeline

Verified working against real tiles during design: Anzalias Pass at EI
pixel (287, 314) projects to continent (10249.44, 14002.22) and lands
exactly on the tower in the rendered hi-res tiles.

For a map with `continentRect [[CX1,CY1],[CX2,CY2]]`, `pixelSize
[PW,PH]` and `pixelOffset [OX,OY]` from `WVW_TILE_DATA`:

```
continentX = (px - OX) / PW * (CX2 - CX1) + CX1
continentY = (py - OY) / PH * (CY2 - CY1) + CY1
```

Map identity comes from `resolveMapFromDetails` in
`src/shared/mapUtils.ts` (prefers `native.encounter.map_id`, falls
back to zone name). Positions come from `getPositionTracks` /
`squadEntities` in `@axiapps/bridge-metrics`.

### Positions reach the sender

`src/main/index.ts:799` and `:948` call `discord?.sendLog({...},
prunedDetails)`. `pruneDetailsForStats`
(`src/main/detailsProcessing.ts:166`) only strips replay positions
when `keepReplayPositions === false`. The default, matching the
default-on `keepCombatReplayLocally` setting, retains
`native.blocks.replay.tracks` and per-player `combatReplayData`. The
main process therefore holds the squad's path at Discord-send time.

When the user has turned replay retention off, there are no positions.
That is a skip, not a guess — see Degradation.

### Tiles and caching

Zoom is chosen for the crop, preferring the AxiBridge hi-res tile pack
(`HIRES_TILE_BASE`, up to `MAX_HIRES_ZOOM` = 9) and falling back to
`tiles.guildwars2.com` for zoom <= `MAX_TILE_ZOOM` (7). Tile URL shape
is `{base}/2/3/{z}/{tx}/{ty}.jpg`.

Tiles are fetched in main and handed to the renderer as `data:` URLs
(see Modules for why).

A clamped crop pulls on the order of 40 tiles (~1 MB). Without caching
that is per-fight network traffic all raid night, so tiles are cached
on disk under userData, keyed by `{base}/{z}/{tx}/{ty}`. A squad
fighting the same borderland pays for each tile once. Cache entries
are plain files; a size cap with LRU eviction keeps the directory
bounded.

Tile fetches are bounded by a timeout and a concurrency limit, and a
partial failure draws the tiles that did arrive rather than aborting —
a missing tile is a black rectangle in a decorative image, not an
error.

### Delivery into the embed

Both destination kinds get the image as a multipart attachment:

- `payload_json` carries the existing embeds, with
  `image: { url: "attachment://slice.png" }` on the last embed
- the PNG rides as a file part

`discord.ts:postForm` already routes multipart to both a webhook
(`axios.post(dest.url, form)`) and the bridge relay (`POST
{relayUrl}/bridge/report` with the bearer token). Embed mode currently
calls `postPayload({ embeds })` — pure JSON — so it needs a multipart
variant. Image mode's existing `FormData` construction is the model.

Attachments do not count against Discord's 6000-character embed
budget, so this does not interact with the roster-budgeting logic.

### Required axitools change

`axitools/api/bridge_payload.py` has:

```python
ALLOWED_EMBED_KEYS = frozenset(
    {"title", "description", "color", "url", "footer", "fields", "timestamp"}
)
```

`_validate_embed` raises `ValueError("embed key not allowed: image")`
on anything else, so a bridged embed carrying an image would 400
today. The relay's multipart handling is already in place —
`_parse_bridge_report_body` parses `payload_json` plus file parts, and
`_handle_bridge_report` forwards them via `queue.submit(channel,
payload, files or None)` — so this whitelist entry is the only gap.

Add `image` to `ALLOWED_EMBED_KEYS`, with a validator that accepts
**only** the `attachment://` scheme. An unrestricted `image.url` would
let any paired client make the bot render an arbitrary remote image;
restricting to `attachment://` keeps the value bound to a file the
same request uploaded, which the existing attachment count and byte
limits already bound.

This ships as a separate axitools change and a venus deploy. AxiBridge
must tolerate a relay that has not been updated yet: a 400 from the
bridge is handled as "send without the image", not as a failed report.

## Degradation

The slice is skipped, silently, and the embed sends exactly as it does
today when:

- replay positions were pruned (retention off)
- the map is unknown to `WVW_TILE_DATA`
- the renderer does not answer within the timeout
- every tile fetch fails
- the relay rejects the image key (un-updated axitools)

Reduced-quality cases still render:

- Maps whose art caps at `MAX_TILE_ZOOM` — Obsidian Sanctum sets
  `maxZoom: MAX_TILE_ZOOM` — produce a softer image at the same crop.
- A single-sample path draws the beacon with no trail.

## Settings

One toggle, `includeMapSlice`, default on, alongside the existing
Discord report options. Off means main never asks the renderer for a
slice.

## Testing

- **Geometry** (`sliceGeometry.ts`): unit tests over synthetic tracks.
  Projection against the verified Anzalias Pass fixture; clamp
  behaviour at both bounds; aspect forcing; a degenerate single-point
  path; an empty path returning null.
- **Tiles**: stubbed fetcher — cache hit skips the network, partial
  failure still returns a tile set, total failure returns null.
- **Delivery**: the multipart payload carries `attachment://slice.png`
  on the last embed and a matching file part, for both webhook and
  bridge destinations; a null slice produces today's JSON payload
  unchanged.
- **axitools**: validator tests — `attachment://slice.png` accepted,
  `https://evil.example/x.png` rejected, `image` with unknown subkeys
  rejected.

Rendering output itself is not asserted pixel-wise; it is verified by
eye against a real log during implementation.

## Out of scope

- Minimap inset (rejected: too small at embed width)
- Objective/capture overlays
- Per-player or per-team trails — one squad centroid only
- Animation
- The slice in web reports
