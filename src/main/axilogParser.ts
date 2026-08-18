/**
 * axilog-backed parser backend.
 *
 * Drop-in replacement for {@link EiManager.parseLog} that produces the same
 * "EI JSON" object shape the stats pipeline already consumes, but by calling
 * the native `@axiapps/axilog` Rust bindings in-process instead of spawning
 * the Elite Insights .NET CLI. No download, no dotnet runtime, no temp files,
 * ~0.3s instead of ~10s-10min per log.
 *
 * This backend is **capability complete and the default** (see
 * {@link DEFAULT_PARSER_BACKEND}). Elite Insights is one setting away at
 * Settings → Parser Settings → Parse Engine. See
 * `docs/axilog-cutover-report.md` for the read-surface audit that decided which
 * `ParseOptions` flags have to be on, which EI fields axilog still does not
 * emit (and which of those are reconstructed here), and the two methodology
 * caveats behind numbers that are present but not EI-identical.
 */

import type { EiParserSettings } from './eiParser';
import { buildNativeCarrySet } from './nativeCarrySet';
import { normalizeAccountName } from '@axiapps/bridge-metrics/playerIdentity';

// ─── Backend selection ────────────────────────────────────────────────────────

export type ParserBackend = 'axilog' | 'elite-insights';

/**
 * The parser used when the user has expressed no preference.
 *
 * **`'axilog'`.** The Elite Insights backend remains selectable at
 * Settings → Parser Settings → Parse Engine and is removed only at the end of
 * the native migration (the spec's "Step N"), so an explicit
 * `'elite-insights'` selection is still honoured.
 *
 * A fresh install now parses in-process via the `@axiapps/axilog` napi
 * bindings: no ~90 MB `GW2EICLI.zip` download, no .NET 8 runtime, no `dotnet`
 * child process, ~0.4 s instead of ~10 s-10 min per log.
 * `shouldAutoManageEi()` in `src/main/index.ts` reads this constant rather than
 * hardcoding an engine, so the auto-install stands down on its own.
 *
 * The read-surface case is closed. The original cutover audit found 30 missing
 * paths and four features rendering blank; axilog's MEIGAP/MEIGAP2 work closed
 * all four, and 0.3.4 widened the per-target split from 8 to 23 fields, which
 * retired both remaining workarounds (the `statsAll` offense fallback and the
 * enemy-downs substitution). See `docs/axilog-cutover-report.md` §1 for the
 * audit and `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md`
 * for where this sits in the migration.
 *
 * Two accuracy caveats that are *not* absences, and so do not degrade visibly —
 * read §2 of the cutover report before trusting the numbers: per-skill
 * `downContribution` is axilog's arcdps-methodology figure under EI's field
 * name, and the mitigation aggregate's secondary `minMitigation` term is
 * roster-shape-sensitive.
 */
export const DEFAULT_PARSER_BACKEND: ParserBackend = 'axilog';

/**
 * Coerce a persisted/IPC value to a known backend id, falling back to
 * {@link DEFAULT_PARSER_BACKEND}.
 *
 * Only the two exact ids are honoured; everything else — unset, empty,
 * mis-cased, whitespace-padded, unknown — resolves to
 * {@link DEFAULT_PARSER_BACKEND}. The hardening is symmetric by construction:
 * it always lands on the shipped default, so a corrupt or hand-edited store can
 * never put a user on an engine they did not pick.
 */
export const normalizeParserBackend = (value: unknown): ParserBackend =>
    value === 'axilog' || value === 'elite-insights' ? value : DEFAULT_PARSER_BACKEND;

// ─── Settings mapping ─────────────────────────────────────────────────────────

/**
 * `@axiapps/axilog`'s `ParseOptions` (see its `index.d.ts`). Every one of these
 * gates a block of the emitted `ei-json`; unset means the field is *omitted*
 * (not emitted empty), so anything the stats pipeline reads must be enabled.
 */
export interface AxilogParseOptions {
    replay: boolean;
    skillDamage: boolean;
    timeseries: boolean;
    rotation: boolean;
    modifiers: boolean;
}

/**
 * Map the existing user-facing {@link EiParserSettings} onto axilog's flags.
 *
 * - `replay` is **unconditionally true**, exactly as `generateEiConf` hardcodes
 *   `ParseCombatReplay=True`: it is what produces `players[].combatReplayData
 *   .positions` + the top-level `combatReplayMetaData` that the legacy EI
 *   readers use, and — since unit 3 — it also gates native's
 *   `blocks.replay.tracks` (the self-timestamped world-inch samples) and the
 *   in-core `dist_to_com`/`stack_dist` pass that replaced axibridge's own
 *   reconstruction of those scalars. The interval half of `blocks.replay` is
 *   computed on every parse, so `coverage.replay === "present"` does NOT imply
 *   positions exist; only this flag does. The user's `parseCombatReplay`
 *   setting means "RETAIN the position arrays post-parse" and is applied later,
 *   by `pruneDetailsForStats` — unchanged by this backend.
 * - `computeDamageModifiers` -> `modifiers`, which gates both the per-player
 *   `damageModifiers`/`incomingDamageModifiers` arrays and the top-level
 *   `damageModMap` (the latter doubles as `get-log-details`' cache-freshness
 *   marker, so turning it off makes cached details look stale).
 * - `rawTimelineArrays` -> `timeseries` (`damage1S`/`damageTaken1S`/
 *   `targetDamage1S`/`dpsTargets`), matching EI's own `RawTimelineArrays` conf.
 * - `skillDamage` and `rotation` have no `EiParserSettings` counterpart because
 *   real EI always emits `totalDamageDist`/`targetDamageDist`/
 *   `totalDamageTaken`/`rotation`; axilog makes them opt-in for payload-size
 *   reasons, so they are forced on here to keep the read surface identical.
 *
 * `detailledWvW`, `parsePhases`, `skipFailedTries`, `anonymous`,
 * `customTooShort`, `saveOutHTML`, `lightTheme`, `singleThreaded` and
 * `memoryLimit` have no axilog counterpart (axilog is WvW-first, single-fight,
 * never writes HTML, and is not phase-aware) and are ignored.
 */
export const mapEiSettingsToAxilogOptions = (
    settings: Partial<EiParserSettings> | null | undefined,
): AxilogParseOptions => ({
    replay: true,
    skillDamage: true,
    timeseries: settings?.rawTimelineArrays !== false,
    rotation: true,
    modifiers: settings?.computeDamageModifiers !== false,
});

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ─── EI-shape compatibility shims ─────────────────────────────────────────────

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** EI's `encounterDuration` spelling, e.g. `"1m 23s 456ms"`. */
export const formatEncounterDuration = (durationMs: number): string => {
    const total = Math.max(0, Math.floor(durationMs));
    const ms = total % 1000;
    const totalSeconds = Math.floor(total / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    const head = hours > 0 ? `${hours}h ${minutes}m ` : `${minutes}m `;
    return `${head}${seconds}s ${ms}ms`;
};

const toStdTimestamp = (epochMs: number): string => {
    const d = new Date(epochMs);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
        + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +00`;
};

/**
 * Project native encounter facts onto the legacy EI field names.
 *
 * Unit 2 moved the *display* readers of these facts onto `details.native`
 * directly, but several consumers still read the EI spellings and belong to
 * later units — `main/index.ts` persists `encounterDuration` into `ILogData`,
 * `discord.ts` formats embeds from `timeStartStd`, and `ExpandableLogCard` /
 * `dashboardUtils` read both. This function keeps those working by filling the
 * old names from the new source, and dies with their readers in units 8 and 10.
 *
 * - `players[].name` — axilog spells the character name `character_name`;
 *   `playerIdentity.getPlayerAccountKey` and several displays fall back to
 *   `name`. Owned by unit 8.
 * - `zone` — `encounter.map`, with the `fightName` prefix-strip left as the
 *   fallback for a log whose native parse failed.
 * - `encounterDuration` — formatted from `encounter.duration_ms`, falling back
 *   to `durationMS`, which ei-json emits with the same value.
 * - `timeStart`/`timeEnd` (+ `*Std`) — from `encounter.started_at_unix`, the
 *   real fight start.
 *
 * **The `.zevtc`-mtime inference this function used to perform is gone.** It
 * read the file's mtime as the fight end, which holds only for a log still
 * sitting where arcdps wrote it: on the committed fixture — checked out by git
 * — it was wrong by 204 days, and it was wrong by the same magnitude for any
 * user log that had been copied, restored from backup or re-synced. When no
 * native start is available the timestamps are now left undefined, so callers
 * fall back to `uploadTime` instead of to a fabricated date.
 */
export const applyEiCompatShims = (details: any, _logPath: string): any => {
    if (!details || typeof details !== 'object') return details;

    const players: any[] = Array.isArray(details.players) ? details.players : [];
    for (const player of players) {
        if (player && typeof player === 'object' && player.name === undefined) {
            player.name = player.character_name;
        }
    }

    // arcdps writes accounts into the agent name buffer as `:Name.1234`, and
    // axilog carried that colon through until 0.3.7 — so accounts rendered as
    // `:Name.1234` everywhere (reported from a Windows install). Stripping it
    // here, on the details object itself, fixes every one of the ~30 sites that
    // read `account` straight off an entity or player for display, rather than
    // needing each of them to normalize.
    //
    // This only reaches logs parsed from now on. `normalizeAccountName` is also
    // applied at the identity helpers in `@axiapps/bridge-metrics`, so a log
    // already persisted with the colon still keys and labels onto the same
    // person; re-parsing history rewrites the stored spelling as well.
    for (const player of players) {
        if (typeof player?.account === 'string') {
            player.account = normalizeAccountName(player.account);
        }
    }
    const nativeEntities: any[] = Array.isArray(details.native?.entities) ? details.native.entities : [];
    for (const entity of nativeEntities) {
        if (typeof entity?.account === 'string') {
            entity.account = normalizeAccountName(entity.account);
        }
    }

    const encounter = details.native?.encounter;
    const nativeMap = typeof encounter?.map === 'string' ? encounter.map.trim() : '';

    if (details.zone === undefined) {
        if (nativeMap) {
            details.zone = nativeMap;
        } else if (typeof details.fightName === 'string') {
            // `"Detailed WvW - Green Alpine Borderlands"` -> `"Green Alpine
            // Borderlands"`. When `fightName` carries no `" - "` separator the
            // regex simply does not match and the WHOLE name becomes the zone,
            // which is the right fallback: axilog's `fightName` is built from
            // the map name, so an unprefixed one already is the zone.
            const zone = details.fightName.replace(/^.*?\s-\s/, '').trim();
            if (zone) details.zone = zone;
        }
    }

    const nativeDurationMs = Number(encounter?.duration_ms);
    const durationMs = isFiniteNumber(nativeDurationMs) ? nativeDurationMs : Number(details.durationMS);
    if (isFiniteNumber(durationMs) && durationMs > 0 && details.encounterDuration === undefined) {
        details.encounterDuration = formatEncounterDuration(durationMs);
    }

    const startedAtUnix = Number(encounter?.started_at_unix);
    if (details.timeEnd === undefined && details.timeStart === undefined
        && isFiniteNumber(startedAtUnix) && startedAtUnix > 0) {
        const startMs = startedAtUnix * 1000;
        const endMs = startMs + (isFiniteNumber(durationMs) && durationMs > 0 ? durationMs : 0);
        details.timeStart = Math.floor(startMs / 1000);
        details.timeEnd = Math.floor(endMs / 1000);
        details.timeStartStd = toStdTimestamp(startMs);
        details.timeEndStd = toStdTimestamp(endMs);
    }

    return details;
};

// ─── Manager ──────────────────────────────────────────────────────────────────

/** The slice of `@axiapps/axilog` this module needs; injectable for tests. */
export interface AxilogBinding {
    parseFileEi: (path: string, opts?: AxilogParseOptions) => any;
    /** Native `ReportV1` parse. Optional so existing test doubles stay valid. */
    parseFile?: (path: string, opts?: AxilogParseOptions) => unknown;
}

let cachedBinding: AxilogBinding | null | undefined;

const loadBinding = (): AxilogBinding | null => {
    if (cachedBinding !== undefined) return cachedBinding;
    try {
        const mod = require('@axiapps/axilog');
        cachedBinding = typeof mod?.parseFileEi === 'function' ? (mod as AxilogBinding) : null;
    } catch {
        cachedBinding = null;
    }
    return cachedBinding;
};

type ParseProgressCallback = (line: string) => void;

/**
 * `EiManager`-shaped facade over `@axiapps/axilog`, so `index.ts` can swap
 * backends behind one `getActiveParser()` without branching at every call
 * site. The install/update surface is inert: the parser ships as an npm
 * dependency with prebuilt platform binaries, so there is nothing to download.
 */
export class AxilogManager {
    private settings: Partial<EiParserSettings> = {};
    private parseProgressCallback: ParseProgressCallback | null = null;
    private binding: AxilogBinding | null;

    constructor(binding?: AxilogBinding | null) {
        this.binding = binding !== undefined ? binding : loadBinding();
    }

    /** True when the native binding for this platform actually loaded. */
    isInstalled(): boolean {
        return this.binding !== null;
    }

    getStatus(): { installed: boolean; version: string | null; updateAvailable: string | null } {
        let version: string | null = null;
        try {
            version = require('@axiapps/axilog/package.json').version ?? null;
        } catch {
            version = null;
        }
        return { installed: this.isInstalled(), version, updateAvailable: null };
    }

    setSettings(settings: Partial<EiParserSettings>): void {
        this.settings = { ...settings };
    }

    getSettings(): Partial<EiParserSettings> {
        return { ...this.settings };
    }

    setParseProgressCallback(cb: ParseProgressCallback): void {
        this.parseProgressCallback = cb;
    }

    /** No external process to kill — kept for interface parity with `EiManager`. */
    killActiveProcess(): void {
        /* no-op */
    }

    /**
     * Parse `logPath` and return an EI-JSON-shaped object, matching
     * {@link EiManager.parseLog}'s contract (`logId` is only used for progress
     * reporting, as it is there).
     */
    async parseLog(logPath: string, logId: string): Promise<unknown> {
        const binding = this.binding;
        if (!binding) {
            throw new Error('axilog native binding is not available on this platform');
        }
        const options = mapEiSettingsToAxilogOptions(this.settings);
        this.parseProgressCallback?.(`[axilog] parsing ${logId}\n`);
        const started = Date.now();
        // Synchronous native call; wrapped so callers keep the Promise contract.
        const details = binding.parseFileEi(logPath, options);
        // Carry native alongside EI for the duration of the migration. Migrated
        // readers read `details.native`; unmigrated ones keep reading EI. Both
        // halves come from ONE axilog version, so they cannot disagree about
        // anything except shape. The EI half is deleted at Step N.
        //
        // A native failure must never fail the parse: EI-shaped compute is still
        // the majority of the app. It degrades the migrated readers only.
        if (typeof binding.parseFile === 'function') {
            try {
                const carry = buildNativeCarrySet(binding.parseFile(logPath, options));
                if (carry) (details as any).native = carry;
            } catch (err) {
                this.parseProgressCallback?.(`[axilog] native parse failed for ${logId}: ${String(err)}\n`);
            }
        }
        // After the carry-set: the shims project native encounter facts onto
        // the legacy EI field names, so they need `details.native` in place.
        applyEiCompatShims(details, logPath);
        this.parseProgressCallback?.(`[axilog] parsed ${logId} in ${Date.now() - started}ms\n`);
        return details;
    }
}
