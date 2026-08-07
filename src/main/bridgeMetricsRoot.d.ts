// Type-only shim for importing `@axiapps/bridge-metrics` by its package
// root from the Electron main process.
//
// Why this exists: `electron/tsconfig.json` compiles with `module:
// "commonjs"` and no explicit `moduleResolution`, which defaults to
// TypeScript's legacy "Node10" resolver. Node10 refuses to fall back to a
// package's `main`/`types` fields once that package also declares an
// `exports` map — even though Node.js's *real* `require()` resolves the
// root import fine via `exports["."].require` (`./dist/index.cjs`), and
// even though subpath imports like
// `@axiapps/bridge-metrics/computePlayerAggregation` already resolve
// cleanly under the same resolver (the package also ships a legacy
// `typesVersions` map, which Node10 does understand). This is purely a
// static-analysis gap: `npm run build`'s plain `tsc` still emits correct
// JS regardless, but `npm run typecheck` (`tsc --noEmit`) treats it as a
// hard error.
//
// This declaration re-points the root specifier at the subpath that ships
// the functions `embedMitigation.ts` consumes, for the type-checker only —
// it has zero effect at runtime, where Node's own resolver already handles
// the real `exports` map correctly.
declare module '@axiapps/bridge-metrics' {
    export * from '@axiapps/bridge-metrics/computePlayerAggregation';
}
