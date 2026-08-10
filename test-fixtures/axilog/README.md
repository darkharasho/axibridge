# axilog test fixture

`wvw-small.anon.zevtc` — **committed**, and the reason the real-parse integration block in
`src/main/__tests__/axilogParser.test.ts` runs in CI rather than skipping. That block drives the
`@axiapps/axilog` backend end-to-end over an actual `.zevtc`: it pins the closed read surface, the
documented residual gaps, and the derived `distToCom`/`stackDist` scalars.

## Why this one file is committed

The repo `.gitignore` excludes every `*.zevtc` as a blanket PII guard — arcdps logs carry real
account and character names. This fixture is an owner-authorized, deliberately narrow exception:

```
*.zevtc
!test-fixtures/axilog/*.anon.zevtc
```

The negation requires `.anon.` in the filename and is scoped to this directory, so a raw capture
dropped in here is still ignored by default.

It carries no PII. Verified before commit, on the parsed output:

- 42 players, every `character_name` an `Anon<N>` placeholder;
- every `account` `:Anon<N>.<digits>`, including `recordedBy`;
- all 32 `enemyPlayer` targets likewise `Anon<N>`; the remaining targets are GW2 NPC/pet/spirit
  names;
- every `guildID` zeroed (`00000000-0000-0000-0000-000000000000`);
- a raw `strings` scan of the inner `.evtc` finds no account-shaped token other than `Anon<N>.<digits>`.

## Resolution order

The test takes the first of these that exists:

1. `$AXILOG_FIXTURE`
2. `test-fixtures/axilog/wvw-small.anon.zevtc` (this file — the CI path)
3. a sibling `../axilog/fixtures/wvw-small.anon.zevtc` checkout

Point at a different log without touching the tree:

```sh
AXILOG_FIXTURE=/path/to/other.anon.zevtc npm run test:unit
```

## Adding another fixture

Never place a real, un-anonymized log here. `axilog anonymize <in> <out>` (or the Node SDK's
`anonymizeFile`) will rewrite one, and re-run the verification above before committing it.
