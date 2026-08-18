# Native-container fixtures

Details objects shaped exactly as `AxilogManager.parseLog` produces them at
runtime: EI-shaped output from `parseFileEi`, plus the `native` carry set from
`parseFile`, plus `applyEiCompatShims`.

Regenerate with:

```sh
npm run generate:fixtures:native            # every testdata/*.zevtc
node scripts/generate-native-fixtures.mjs 20260117-175120   # just one
```

## Why these exist alongside `test-fixtures/boon/`

`boon/` holds hosted Elite Insights JSON, captured by uploading to dps.report
and pulling `getJson`. Since the axilog cutover the app parses locally and the
migrated readers take their data from `details.native`, which hosted EI JSON has
never carried. Those readers therefore hit an early-return on every `boon/`
fixture and compute nothing:

- `computeOutgoingConditions` returns empty without `details.native`
  (`packages/bridge-metrics/src/conditionsMetrics.ts`)
- `buildMovementData` returns `null` for an EI-only parse
  (`src/shared/movementData.ts`)

So `audit:conditions` failed on all 15 `boon/` fixtures, `audit:conditions:consistency`
passed vacuously (0 of 9 non-damaging conditions had any data to check), and the
replay e2e specs were driving an app with no fight data at all.

`boon/` is still the right input for the metrics and boon audits, which read the
EI surface. Neither set replaces the other.

## Coverage

Eight of the fifteen `boon/` logs — the seven-fight `20260117` series plus the
large `20260128-190427`. The other seven have no `.zevtc` in `testdata/`, so
they cannot be re-parsed; regenerating them means re-capturing the raw logs.

## On PII

Output goes through `scripts/obfuscate-accounts.mjs`, the same pass the
dps.report fixtures got: account names become deterministic fakes, character
names and guild IDs are left as-is. That matches the existing standard for
`boon/`, and these are the same eight logs already committed there in EI form.

axilog's `anonymizeFile` would rewrite character names too, and was tried first
— but it **changes the parse**. Giving every player agent a name promotes the
ones arcdps recorded nameless (allies out of render range) into full roster
entries: on `20260117-175120` the entity count goes 135 -> 156, friendly players
17 -> 38, and `players[]` 22 -> 43. A fixture whose roster is an artifact of its
own anonymization is worse than no fixture, so it is deliberately not used.

Raw `.zevtc` sources stay out of the repo — `.gitignore` blanket-ignores them,
with one narrow authorized exception under `test-fixtures/axilog/`.
