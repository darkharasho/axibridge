/**
 * axilog-backed parser backend.
 *
 * Drop-in replacement for {@link EiManager.parseLog} that produces the same
 * "EI JSON" object shape the stats pipeline already consumes, but by calling
 * the native `@axiapps/axilog` Rust bindings in-process instead of spawning
 * the Elite Insights .NET CLI. No download, no dotnet runtime, no temp files,
 * ~0.3s instead of ~10s-10min per log.
 *
 * See `docs/axilog-cutover-report.md` for the full read-surface audit that
 * decided which `ParseOptions` flags have to be on and which EI fields axilog
 * does not emit (and which of those are reconstructed here).
 */

import * as fs from 'fs';
import type { EiParserSettings } from './eiParser';

// ─── Backend selection ────────────────────────────────────────────────────────

export type ParserBackend = 'axilog' | 'elite-insights';

/**
 * The parser used when the user has expressed no preference.
 *
 * **Elite Insights, deliberately** — not axilog, even though axilog is faster
 * by two orders of magnitude and needs no runtime download. The read-surface
 * audit in `docs/axilog-cutover-report.md` found that of the 118 EI-JSON paths
 * axibridge reads, **30 are not emitted by axilog's `ei-json` adapter**. They
 * all degrade safely (every read site is null-guarded, so nothing throws), but
 * "safely" means *blank*: boon-generation attribution, incoming conditions,
 * damage mitigation and the incoming-strike-damage chart all render empty. That
 * is not an acceptable out-of-the-box experience, so the fast path stays
 * opt-in until it is also the complete path.
 *
 * **This flips to `'axilog'` once axilog closes the ei-json adapter gap** —
 * specifically `selfBuffs`/`groupBuffs`/`squadBuffs`,
 * `buffUptimes[].statesPerSource`, `targets[].buffs`/`totalDamageDist`/
 * `damage1S`, `minions[]` and `guildID`. See §4 of the cutover report for the
 * full gap list and the per-field consequences.
 */
export const DEFAULT_PARSER_BACKEND: ParserBackend = 'elite-insights';

/**
 * Coerce a persisted/IPC value to a known backend id, falling back to
 * {@link DEFAULT_PARSER_BACKEND}. Only an explicit, exact `'axilog'` opts in.
 */
export const normalizeParserBackend = (value: unknown): ParserBackend =>
    value === 'axilog' ? 'axilog' : DEFAULT_PARSER_BACKEND;

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
 *   .positions` + the top-level `combatReplayMetaData` that Distance-to-Tag /
 *   On-Tag-Review / Stab-Performance read, and it is the input to the derived
 *   `distToCom`/`stackDist` scalars below. The user's `parseCombatReplay`
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

// ─── Derived distance-to-tag scalars ──────────────────────────────────────────

/**
 * EI's own "no samples" sentinel for `distToCom`/`stackDist`
 * (`GameplayStatistics.GetDistanceToTarget` returns `-1`). Both axibridge
 * readers already reject negatives, so this degrades cleanly to "unknown"
 * rather than to a bogus 0.
 */
export const NO_DISTANCE = -1;

/** GW2EI's fixed combat-replay polling rate, used when the log carries no metadata. */
export const DEFAULT_POLLING_RATE_MS = 300;

type Interval = readonly [number, number];

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Normalise one of axilog's `combatReplayData.{down,dead,dc}` arrays. Entries
 * are `[start, end]` ms pairs.
 *
 * `dc` is bracketed with `long.MinValue` / `long.MaxValue`, which survive the
 * JSON round-trip as ±9.22e18 — finite, so they are kept as-is. Note the outer
 * sentinels are harmless but the brackets' INNER endpoints are not quite: a
 * typical `dc` reads `[[MIN, start], [end, MAX]]`, and because
 * {@link inAnyInterval} is inclusive at both ends, a poll landing exactly on
 * `start` or `end` is treated as disconnected and dropped, where EI counts it
 * as active. That costs at most the actor's first and last sample, and only
 * when `start`/`end` is an exact multiple of the polling rate — measured at
 * **6 of 6,894 samples (0.087%)** across the 42 players of the committed
 * fixture. Left as-is: correcting it means special-casing the sentinels, and
 * the bias is far below the derivation's other approximations (see
 * {@link deriveDistanceScalars}).
 */
const toIntervals = (raw: unknown): Interval[] => {
    if (!Array.isArray(raw)) return [];
    const out: Interval[] = [];
    for (const entry of raw) {
        if (!Array.isArray(entry)) continue;
        const start = Number(entry[0]);
        const end = Number(entry[1]);
        if (!isFiniteNumber(start) || !isFiniteNumber(end)) continue;
        out.push([start, end]);
    }
    return out;
};

const inAnyInterval = (t: number, intervals: Interval[]): boolean => {
    for (const [start, end] of intervals) {
        if (t >= start && t <= end) return true;
    }
    return false;
};

/**
 * One actor's polled positions expanded onto absolute poll indices.
 *
 * axilog emits `positions[i]` for the i-th multiple of `pollingRate` inside
 * `[start, end]` (see `axilog_core::analysis::ei_replay`'s "polling grid"
 * doc), so the absolute poll index of sample `i` is
 * `ceil(start / pollingRate) + i`.
 */
interface PolledTrack {
    firstPoll: number;
    positions: Array<[number, number]>;
    /** Polls the actor is NOT "active" for, per EI's `GetStatus`: down/dead/dc. */
    inactive: Interval[];
}

const readTrack = (player: any, pollingRate: number): PolledTrack | null => {
    const replay = player?.combatReplayData;
    const positions = replay?.positions;
    if (!Array.isArray(positions) || positions.length === 0) return null;
    const start = Number(replay?.start);
    const firstPoll = isFiniteNumber(start) ? Math.ceil(start / pollingRate) : 0;
    return {
        firstPoll,
        positions: positions as Array<[number, number]>,
        inactive: [...toIntervals(replay?.down), ...toIntervals(replay?.dead), ...toIntervals(replay?.dc)],
    };
};

const positionAtPoll = (
    track: PolledTrack,
    poll: number,
    pollingRate: number,
    requireActive: boolean,
): [number, number] | null => {
    const idx = poll - track.firstPoll;
    if (idx < 0 || idx >= track.positions.length) return null;
    const point = track.positions[idx];
    if (!Array.isArray(point) || !isFiniteNumber(point[0]) || !isFiniteNumber(point[1])) return null;
    if (requireActive && inAnyInterval(poll * pollingRate, track.inactive)) return null;
    return [point[0], point[1]];
};

/**
 * Compute EI's `statsAll[0].distToCom` / `statsAll[0].stackDist` from axilog's
 * `combatReplayData` and write them onto every player, in place.
 *
 * ### EI semantics being reproduced
 *
 * `GW2EIBuilders/JsonModels/JsonActorUtilities/JsonStatisticsBuilder.cs:153-154`
 * maps `StackDist = gameStats.DistanceToCenterOfSquad` and
 * `DistToCom = gameStats.DistanceToCommander`, both computed by
 * `GW2EIEvtcParser/EIData/Statistics/GameplayStatistics.cs:140-141` via
 * `GetDistanceToTarget` (same file, lines 29-69):
 *
 * - iterate the actor's **active** polled positions
 *   (`SingleActor.GetCombatReplayActivePolledPositions`,
 *   `GW2EIEvtcParser/EIData/Actors/SingleActor.cs:268-290`, which nulls every
 *   poll the actor is down, dead or disconnected for);
 * - for each, take the reference position **at the same poll timestamp**,
 *   skipping polls where the reference is null (lines 44-62);
 * - distance is the **XY-plane** length, Z discarded (`.XY().Length()`, line 57);
 * - the result is the arithmetic mean, or `-1` when no sample qualified
 *   (line 64). It is also left at its `0` default when the log has no combat
 *   replay at all (line 139's `log.CanCombatReplay` guard).
 *
 * References:
 * - commander: `StatisticsHelper.CalculateStackCommanderPositions`
 *   (`GW2EIEvtcParser/EIData/Statistics/StatisticsHelper.cs:258-300`) — the
 *   commanding player's **raw** (not active-filtered) polled positions during
 *   their commander segments, `null` where nobody is commanding.
 *
 *   **Known approximation:** this function uses the first player carrying
 *   `hasCommanderTag` and reads that actor's whole track, because axilog's
 *   ei-json exposes only that boolean — not EI's per-segment timeline built
 *   from every player's `GetCommanderStates`. So a tag hand-off or relog
 *   mid-fight attributes every poll to one track, and polls before the tag was
 *   picked up are measured against a reference EI would have left `null`.
 *   Measured overall error of this derivation vs EI, this effect included:
 *   3.7% mean on `distToCom`, 4.3% on `stackDist`. Closing it needs a
 *   commander-segment surface from axilog — see the cutover report's
 *   follow-ups.
 * - squad centre: `StatisticsHelper.CalculateStackCenterPositions` (same file,
 *   lines 201-257) — per poll, the mean of every `log.PlayerList` member's
 *   **active** position, `null` where nobody is active.
 *
 * ### Unit conversion
 *
 * EI works in world inches; axilog's ei-json `positions` are map **pixels** on
 * GW2EI's arena image (`combatReplayMetaData.inchToPixel`). Dividing by
 * `inchToPixel` recovers inches — the exact conversion axibridge's own replay
 * path already performs in `src/renderer/stats/computeDistanceToTag.ts`.
 * When `combatReplayMetaData` is absent (axilog omits it for maps GW2EI ships
 * no image for) there is no scale factor, so both scalars stay at
 * {@link NO_DISTANCE} rather than being reported in the wrong unit.
 */
export const deriveDistanceScalars = (details: any): any => {
    const players: any[] = Array.isArray(details?.players) ? details.players : [];
    if (players.length === 0) return details;

    const ensureStatsAll = (player: any) => {
        if (!Array.isArray(player.statsAll) || player.statsAll.length === 0) {
            player.statsAll = [{}];
        } else if (!player.statsAll[0] || typeof player.statsAll[0] !== 'object') {
            player.statsAll[0] = {};
        }
        return player.statsAll[0];
    };

    const meta = details?.combatReplayMetaData;
    const inchToPixel = Number(meta?.inchToPixel);
    const rawPolling = Number(meta?.pollingRate);
    const pollingRate = isFiniteNumber(rawPolling) && rawPolling > 0 ? rawPolling : DEFAULT_POLLING_RATE_MS;

    if (!isFiniteNumber(inchToPixel) || inchToPixel <= 0) {
        for (const player of players) {
            const stats = ensureStatsAll(player);
            stats.distToCom = NO_DISTANCE;
            stats.stackDist = NO_DISTANCE;
        }
        return details;
    }

    const tracks = new Map<any, PolledTrack>();
    for (const player of players) {
        const track = readTrack(player, pollingRate);
        if (track) tracks.set(player, track);
    }

    // Commander reference: raw (not active-filtered) positions, per EI.
    const commander = players.find((p) => p?.hasCommanderTag && tracks.has(p));
    const commanderTrack = commander ? tracks.get(commander)! : null;

    // Squad-centre reference: mean of every player's ACTIVE position per poll.
    let lastPoll = -1;
    for (const track of tracks.values()) {
        lastPoll = Math.max(lastPoll, track.firstPoll + track.positions.length - 1);
    }
    const centre: Array<[number, number] | null> = new Array(Math.max(0, lastPoll + 1)).fill(null);
    for (let poll = 0; poll <= lastPoll; poll++) {
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (const track of tracks.values()) {
            const point = positionAtPoll(track, poll, pollingRate, true);
            if (!point) continue;
            sumX += point[0];
            sumY += point[1];
            count++;
        }
        centre[poll] = count > 0 ? [sumX / count, sumY / count] : null;
    }

    for (const player of players) {
        const stats = ensureStatsAll(player);
        const track = tracks.get(player);
        if (!track) {
            stats.distToCom = NO_DISTANCE;
            stats.stackDist = NO_DISTANCE;
            continue;
        }

        let comSum = 0;
        let comCount = 0;
        let stackSum = 0;
        let stackCount = 0;

        for (let i = 0; i < track.positions.length; i++) {
            const poll = track.firstPoll + i;
            const self = positionAtPoll(track, poll, pollingRate, true);
            if (!self) continue;

            if (commanderTrack) {
                const ref = positionAtPoll(commanderTrack, poll, pollingRate, false);
                if (ref) {
                    comSum += Math.hypot(self[0] - ref[0], self[1] - ref[1]) / inchToPixel;
                    comCount++;
                }
            }

            const centreRef = centre[poll];
            if (centreRef) {
                stackSum += Math.hypot(self[0] - centreRef[0], self[1] - centreRef[1]) / inchToPixel;
                stackCount++;
            }
        }

        stats.distToCom = comCount > 0 ? comSum / comCount : NO_DISTANCE;
        stats.stackDist = stackCount > 0 ? stackSum / stackCount : NO_DISTANCE;
    }

    return details;
};

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
 * Fill in the handful of EI top-level/player fields axilog has no source for
 * but axibridge reads, using only information that is genuinely available.
 *
 * - `players[].name` — axilog spells the character name `character_name`;
 *   `playerIdentity.getPlayerAccountKey` and several displays fall back to
 *   `name`, so it is aliased rather than left undefined.
 * - `zone` — the map name, which axilog only surfaces embedded in `fightName`
 *   (`"Detailed WvW - Green Alpine Borderlands"`).
 * - `encounterDuration` — formatted from `durationMS`, which axilog does emit.
 * - `timeStart`/`timeEnd` (+ `*Std`) — arcdps closes the `.zevtc` when the
 *   fight ends, so the file's mtime is the fight END wall-clock; `timeStart`
 *   is that minus `durationMS`. Approximate by construction (EI reads a real
 *   log-start event axilog does not surface), and only ever consulted as a
 *   fallback after `uploadTime`, so a few seconds of skew is harmless.
 */
export const applyEiCompatShims = (details: any, logPath: string): any => {
    if (!details || typeof details !== 'object') return details;

    const players: any[] = Array.isArray(details.players) ? details.players : [];
    for (const player of players) {
        if (player && typeof player === 'object' && player.name === undefined) {
            player.name = player.character_name;
        }
    }

    if (details.zone === undefined && typeof details.fightName === 'string') {
        // `"Detailed WvW - Green Alpine Borderlands"` -> `"Green Alpine
        // Borderlands"`. When `fightName` carries no `" - "` separator the
        // regex simply does not match and the WHOLE name becomes the zone,
        // which is the right fallback: axilog's `fightName` is built from the
        // map name, so an unprefixed one already is the zone.
        const zone = details.fightName.replace(/^.*?\s-\s/, '').trim();
        if (zone) details.zone = zone;
    }

    const durationMs = Number(details.durationMS);
    if (isFiniteNumber(durationMs) && durationMs > 0 && details.encounterDuration === undefined) {
        details.encounterDuration = formatEncounterDuration(durationMs);
    }

    if (details.timeEnd === undefined && details.timeStart === undefined) {
        let mtimeMs: number | null = null;
        try {
            mtimeMs = fs.statSync(logPath).mtimeMs;
        } catch {
            mtimeMs = null;
        }
        if (isFiniteNumber(mtimeMs) && mtimeMs > 0) {
            const endMs = mtimeMs;
            const startMs = endMs - (isFiniteNumber(durationMs) && durationMs > 0 ? durationMs : 0);
            details.timeStart = Math.floor(startMs / 1000);
            details.timeEnd = Math.floor(endMs / 1000);
            details.timeStartStd = toStdTimestamp(startMs);
            details.timeEndStd = toStdTimestamp(endMs);
        }
    }

    return details;
};

// ─── Manager ──────────────────────────────────────────────────────────────────

/** The slice of `@axiapps/axilog` this module needs; injectable for tests. */
export interface AxilogBinding {
    parseFileEi: (path: string, opts?: AxilogParseOptions) => any;
}

let cachedBinding: AxilogBinding | null | undefined;

const loadBinding = (): AxilogBinding | null => {
    if (cachedBinding !== undefined) return cachedBinding;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
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
            // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
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
        applyEiCompatShims(details, logPath);
        deriveDistanceScalars(details);
        this.parseProgressCallback?.(`[axilog] parsed ${logId} in ${Date.now() - started}ms\n`);
        return details;
    }
}
