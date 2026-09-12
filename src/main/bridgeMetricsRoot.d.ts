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
//
// `deriveReviveLogSummary`/`reviveePlayerKey` (consumed by `discord.ts`) and
// `withVariantLabel` (consumed by `axilogParser.ts`) have
// no subpath of their own — they only ship from the package root — so unlike
// the re-export above they are declared by hand here, matching the real
// signatures in `reviveDerivation.ts`.
declare module '@axiapps/bridge-metrics' {
    export * from '@axiapps/bridge-metrics/computePlayerAggregation';

    export interface RevivePlayerCounts {
        attempts: number;
        attemptTimeMs: number;
        handRevives: number;
        utilityCasts: number;
        utilityRevives: number;
        selfRevives: number;
        assists: number;
    }

    export interface ReviveLogSummary {
        hasData: boolean;
        downs: number;
        recovered: number;
        died: number;
        byKind: Record<'hand' | 'utility' | 'self' | 'unattributed', number>;
        players: Map<string, RevivePlayerCounts>;
        utilities: Map<number, {
            name: string;
            icon: string | null;
            casts: number;
            revives: number;
            byCaster: Map<string, { casts: number; revives: number }>;
        }>;
        iolRevives: Array<{ playerKey: string; playerIndex: number; at: number }>;
    }

    export interface AttributionOptions {
        isWithinRadius?: (casterIndex: number, revivedIndex: number, atMs: number) => boolean;
        playerKey?: (player: any) => string;
    }

    export function deriveReviveLogSummary(details: any, opts?: AttributionOptions): ReviveLogSummary;
    export function reviveePlayerKey(player: any): string;

    // `axilogParser.ts` — root-only too, mirrors `skillCanonicalId.ts`.
    export function withVariantLabel(name: string, label: unknown): string;
}
