/**
 * axilog-backed parser backend.
 *
 * Produces the "EI JSON" object shape the stats pipeline consumes, by calling
 * the native `@axiapps/axilog` Rust bindings in-process. No download, no dotnet
 * runtime, no temp files, ~0.3s instead of ~10s-10min per log.
 *
 * This is now the **only** parser: the Elite Insights .NET CLI backend was
 * removed ahead of the native-format migration, so there is no engine to pick
 * and no fallback to fall back to. The EI *shape* this emits is a separate
 * thing and outlives the binary — it dies at the migration's Step N. See
 * `docs/axilog-cutover-report.md` for the read-surface audit that decided which
 * `ParseOptions` flags have to be on, which EI fields axilog still does not
 * emit (and which of those are reconstructed here), and the two methodology
 * caveats behind numbers that are present but not EI-identical.
 */

import type { ParserSettings } from './parserSettings';
import { buildNativeCarrySet } from './nativeCarrySet';
import { normalizeAccountName } from '@axiapps/bridge-metrics/playerIdentity';

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
 * Map the existing user-facing {@link ParserSettings} onto axilog's flags.
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
 * - `skillDamage` and `rotation` have no `ParserSettings` counterpart because
 *   real EI always emits `totalDamageDist`/`targetDamageDist`/
 *   `totalDamageTaken`/`rotation`; axilog makes them opt-in for payload-size
 *   reasons, so they are forced on here to keep the read surface identical.
 *
 * `detailledWvW`, `parsePhases`, `skipFailedTries`, `anonymous`,
 * `customTooShort`, `saveOutHTML`, `lightTheme`, `singleThreaded` and
 * `memoryLimit` have no axilog counterpart (axilog is WvW-first, single-fight,
 * never writes HTML, and is not phase-aware) and are ignored.
 */
export const mapParserSettingsToAxilogOptions = (
    settings: Partial<ParserSettings> | null | undefined,
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
 * - `zone` — `encounter.encounter_name` for a PvE log (the boss/encounter
 *   name), `encounter.map` for WvW, with the `fightName` prefix-strip left
 *   as the fallback for a log whose native parse failed.
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

    // Icons: `skillMap`/`buffMap` carry NONE from axilog's EI-shaped output --
    // 0 of 508 skills and 0 of 26 buffs -- so every surface that reads an icon
    // off them rendered blank once the native engine became the parser: the
    // Top Outgoing/Incoming Skills cards, the boon selector, skill-usage,
    // heal-effectiveness, commander stats, the player breakdown.
    //
    // Backfilling the two EI maps here rather than re-pointing each of those
    // ~20 readers is the whole point of this function: it projects native facts
    // onto the legacy EI field names. `catalogs.skills` has had icons all
    // along; `catalogs.buffs` gained them in axilog 0.3.8.
    //
    // Only ever FILLS a missing icon -- an entry that already has one keeps it,
    // so a real Elite Insights parse (which supplies its own) is untouched.
    // Reaches new parses only; re-parse history to backfill stored logs.
    const backfillIcons = (map: any, prefix: string, catalog: any) => {
        if (!map || typeof map !== 'object' || !catalog) return;
        for (const [key, entry] of Object.entries<any>(map)) {
            if (!entry || typeof entry !== 'object' || entry.icon) continue;
            const id = String(key).replace(new RegExp(`^${prefix}`), '');
            const icon = catalog[id]?.icon;
            if (typeof icon === 'string' && icon) entry.icon = icon;
        }
    };
    backfillIcons(details.skillMap, 's', details.native?.catalogs?.skills);
    backfillIcons(details.buffMap, 'b', details.native?.catalogs?.buffs);

    const encounter = details.native?.encounter;
    const nativeMap = typeof encounter?.map === 'string' ? encounter.map.trim() : '';

    // PvE encounters name themselves; only WvW names itself after its map.
    // axilog 1.5.0 added `encounter_name` (plus `kind`/`trigger_id`/
    // `success`) and, in the same change, started emitting an EMPTY
    // `encounter.map` for PvE logs -- because the WvW map table it used to
    // fall through returned the literal "World vs World" for every raid,
    // strike and fractal map id. That is the bug users saw: a night of Wing
    // 1-4 raids listed as four "World vs World" fights.
    //
    // Reading `encounter_name` first rather than relying on the empty-map
    // fallback below keeps this correct if a future axilog ever does learn
    // PvE map names and fills `map` in again.
    const nativeEncounterName =
        typeof encounter?.encounter_name === 'string' ? encounter.encounter_name.trim() : '';

    if (details.zone === undefined) {
        if (nativeEncounterName) {
            details.zone = nativeEncounterName;
        } else if (nativeMap) {
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
 * The parser. Ships as an npm dependency with prebuilt platform binaries, so
 * there is nothing to install, update or download — {@link isInstalled} reports
 * whether this platform's binding loaded, and nothing more.
 */
export class AxilogManager {
    private settings: Partial<ParserSettings> = {};
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

    setSettings(settings: Partial<ParserSettings>): void {
        this.settings = { ...settings };
    }

    getSettings(): Partial<ParserSettings> {
        return { ...this.settings };
    }

    setParseProgressCallback(cb: ParseProgressCallback): void {
        this.parseProgressCallback = cb;
    }

    /** No external process to kill; callers still invoke it on shutdown. */
    killActiveProcess(): void {
        /* no-op */
    }

    /**
     * Parse `logPath` and return an EI-JSON-shaped object. `logId` is used
     * only for progress reporting.
     */
    async parseLog(logPath: string, logId: string): Promise<unknown> {
        const binding = this.binding;
        if (!binding) {
            throw new Error('axilog native binding is not available on this platform');
        }
        const options = mapParserSettingsToAxilogOptions(this.settings);
        this.parseProgressCallback?.(`[axilog] parsing ${logId}\n`);
        const started = Date.now();
        // Synchronous native call; wrapped so callers keep the Promise contract.
        const details = binding.parseFileEi(logPath, options);
        // Carry native alongside EI for the duration of the migration. Migrated
        // readers read `details.native`; unmigrated ones keep reading EI. Both
        // halves come from ONE axilog version, so they cannot disagree about
        // anything except shape. The EI half is deleted at Step N — removing the
        // Elite Insights *binary* did not remove this, and it is the larger of
        // the two costs: ~285ms and ~2.6MB per log of duplicate parse.
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
