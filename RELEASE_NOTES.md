# Release Notes

Version v3.1.0 — August 23, 2026

The big one in this release is the fight slicer: pick a subset of a session's
fights and every number on the dashboard recomputes against just those fights.
It works in the desktop app and in published web reports, and slices are
shareable by link. Alongside it, R2 setup no longer needs hand-copied API
tokens — you can sign in with Cloudflare and let AxiBridge provision the
bucket for you.

## Slice a session down to the fights you care about

A raid session is one log set, but the questions you ask of it usually are not.
"How did we do on that third push?" meant either splitting the logs by hand or
reading a session average that buried the fight you were asking about.

There is now a slice pill in the stats header. It opens a tray of fight cards —
each with its map, class icons and result — where you pick the fights you want.
Every stat on the dashboard recomputes against that selection: damage, boons,
cleanses, the combat replay, all of it. The tray has All / None / Invert, a
wins-only filter and a text filter, and the bulk actions respect whatever filter
is active. A banner sits over the content while a slice is on, so a filtered
number is never mistaken for a session total.

Slices are ephemeral. They are not saved with your logs and publishing is
blocked while one is active, so a slice can never be mistaken for the report you
meant to publish.

## Slices in published reports, and shareable slice links

The slicer also works in the published web report, which is the part that took
the most doing — the browser has to recompute the same statistics the desktop
app does, from a report it downloaded.

Publishing now builds a compact per-fight sidecar alongside the report. When a
reader picks a slice, the viewer fetches only the frames for the fights they
selected and folds them together in a Web Worker, so recomputation stays off the
render thread and the initial page load is not made heavier by data most readers
will never request.

Slice selections are encoded into the URL. Send someone the link and they land
on exactly the fights you picked. The pill in a published report's header is
drawn as a filled control rather than a resting outline, because in a report with
no other header controls — and especially under the glass theme — the quiet
version simply went unnoticed.

The sidecar is uploaded to R2, so slices in published reports require R2 to be
configured. Publishing without it works exactly as before, just without the
slicer.

## Sign in with Cloudflare

Setting up R2 meant creating an account, creating a bucket, generating an API
token with the right permissions, and copying five values into Settings. Enough
steps that a fair number of people stopped partway.

Settings now has a "Sign in with Cloudflare" panel. It runs a real OAuth flow in
your browser, you pick which account to use, and AxiBridge creates and configures
the bucket itself — public access and CORS included. The five manual fields are
still there, collapsed behind a link once you are connected, since they remain
the only way to point at a custom domain. Disconnecting is one click.

Two things worth knowing:

- **Cloudflare requires a payment method on the account** before R2 can be
  enabled, even though the 10 GB free tier costs nothing and AxiBridge never
  charges you. That gate is on Cloudflare's side and nothing in the app can
  route around it, so the R2 section now says so up front instead of letting you
  find out at the last step.
- Cancelling the sign-in returns the panel to rest rather than reporting an
  error, and leaving Settings mid-flow releases the port so a second attempt
  works.

Development builds now provision a separate `axibridge-reports-dev` bucket, so
testing can't disturb the bucket serving your published reports.

## Quick Settings, and separate switches for replay and slice data

Flipping a setting between runs meant a trip to Settings and back. The dashboard
now has a Quick Settings card below Session with the toggles you actually change
mid-session, including combat replay parsing. Changes there save immediately.

R2 hosting also gained an off switch. It used to be on whenever credentials
existed, so skipping it for a single publish meant deleting five fields and
pasting them back. Replay data and slice data are now separate toggles as well —
they are independent uploads, and wanting the web slicer should not oblige you to
upload replay positions too. Existing installs keep their current behaviour:
both default to whatever R2 was doing before.

## Cleanse counts now match the in-game arcdps meter

A player reported that AxiBridge showed fewer cleanses than the arcdps overlay
did for the same fight, and the numbers were off by enough to matter on a support
build.

The cause was in the analysis, not the display. The stats engine only counted a
cleanse when the condition came off a squad player. Anything you cleansed off a
pet, a minion, a clone, a spirit or a turret was counted zero times — the in-game
meter folds those into their owner and credits you, so every ranger, necro,
mesmer and elementalist in the squad was reading low.

Cleanses landed on a squad member's pet or minion are now credited to the player
who cleansed them, which is what the arcdps meter does. Conditions cleansed off
non-squad friendlies stay out of the count, matching arcdps as well.

### A scope toggle on the cleanse tables

Because "a cleanse" turns out to mean three different things depending on who is
asking, the Support tables now have a scope pill:

- **arcdps** — the default, and what the in-game meter shows: squad plus self
  plus squad minions.
- **all** — squad plus self, the number older AxiBridge versions and dps.report
  reports show. Use this to compare against a published report.
- **squad** — cleanses on other people only, with self-cleanses excluded. Use
  this to see who is actually supporting the group rather than cleaning up their
  own conditions.

Cross-report rollups were also summing only the squad bucket, so a player's
lifetime cleanse total was missing every self-cleanse they had ever landed.
Rollups now use the same arcdps-scoped total as the per-fight tables.

NOTE: The minion figure comes from the log parser, so it is available on logs
parsed by this version onward. Older logs in your history fall back to the "all"
scope and the arcdps option is hidden for them until they're re-parsed.

## Fixed: squad split in half on Edge of the Mists

On some EotM fights the squad was being partitioned across both sides of the
friend/foe split — one report read "Squad 20 / Blue team 25" for a fight with 45
squad members in it, with the missing half counted as enemies. A post-fight
teardown event could re-stamp the recorder's team after the fact and send
everyone recorded before it down the enemy branch.

Fixed in the parser and verified across all twelve logs from the session that
surfaced it: the two broken fights now read 45 squad against 40 and 43 enemies,
and the ten healthy logs are unchanged. The fix is not retroactive — reports
published before this version keep the bad split until those fights are
re-parsed and re-published.

## Smaller fixes

- Published reports had no way into the slice tray; they do now.
- Class icons on fight cards no longer stretch out of shape.
- The marketing site moved to bridge.axi.link.
