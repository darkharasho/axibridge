# axilog test fixture

`src/main/__tests__/axilogParser.test.ts` has a real-parse integration block that runs the
`@axiapps/axilog` backend end-to-end over an actual `.zevtc`. That log is **not committed**: this
repo's `.gitignore` excludes every `*.zevtc` as a blanket PII guard (arcdps logs carry real account
and character names), and the guard is kept intact rather than punched through for one file.

The block skips itself when no fixture is found, so `npm run test:unit` is green either way. To
enable it locally, provide the anonymized WvW fixture from the axilog repo — every name in it is an
`Anon<N>` placeholder, so it carries no PII:

```sh
# option 1 — drop it here (this directory is gitignored for *.zevtc)
cp ../../axilog/fixtures/wvw-small.anon.zevtc test-fixtures/axilog/

# option 2 — point at it explicitly
AXILOG_FIXTURE=/path/to/wvw-small.anon.zevtc npm run test:unit
```

A sibling `../axilog/fixtures/wvw-small.anon.zevtc` checkout is also picked up automatically.

Never place a real, un-anonymized log here. `axilog anonymize <in> <out>` (or the Node SDK's
`anonymizeFile`) will rewrite one if you need a new fixture.
