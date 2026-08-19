# Release Notes

Version v3.0.1 — August 18, 2026

## Healing breakdown stops calling everyone "partial"

The healing tables now read the actual arcdps healing-extension roster, so a
player who genuinely isn't running the addon is marked partial and everyone
else isn't. Before this, the check keyed off whether a player had any healing
recorded at all — which meant almost the whole squad got flagged, since heals
relayed by peers count too.

NOTE: this comes from new parse output, so it only applies to logs parsed from
here on. Already-uploaded logs keep showing partial until you re-parse them.

## Fixes

- Players no longer show up twice in profession-grouped lists — once as
  `:Name.1234` and once as `Name.1234` — with their numbers split between the
  two rows. Logs cached before the leading-colon fix landed were rehydrating
  with the old spelling; they're now corrected as they're read, so existing
  logs heal themselves with no re-parse needed.
