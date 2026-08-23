import { buildFightLabelV2 } from '../utils/labelUtils';

/**
 * Slice-only label plumbing.
 *
 * `ingestLog*` bakes the running log ordinal into a handful of display strings
 * that no `finalize*` renumbers — fight ids, `shortLabel`s, and the
 * `Fight ${n}` zone fallback that feeds `buildFightLabelV2` (and, through the
 * player fold, `peakFightLabel`). A slice frame is always produced by a solo
 * aggregator, so every one of those strings is baked at ordinal 0.
 *
 * Rather than pattern-match the baked strings, a frame carries the raw
 * *ingredients* those expressions read — see `FrameLabelSeed` — and
 * `resolveFrameFightLabels` re-evaluates exactly the same expressions at the
 * merge ordinal. Nothing in this file is reachable from the non-slice ingest or
 * finalize path.
 */

/**
 * The raw fields `ingestLog*` reads when it derives an id or a label. All
 * primitives, all cheap: capturing this adds no measurable work to ingest.
 *
 * Stored with `|| ''` semantics because every consumer chains them with `||`,
 * so an empty string and a missing field have to behave identically.
 */
export interface FrameLabelSeed {
    /** `details.fightName` */
    fightName: string;
    /** `log.fightName` */
    logFightName: string;
    /** `log.encounterName` */
    encounterName: string;
    /** `log.filePath` */
    filePath: string;
    /** `log.id` */
    logId: string;
    /** `Number(details.durationMS || 0)` */
    durationMs: number;
}

/**
 * The ordinal-derived strings, re-evaluated at a merge ordinal.
 *
 * The three `fullLabel*` fields are `null` when the log supplied a real zone —
 * the label ingest baked is then already ordinal-free and MUST be left alone.
 * A non-null value means the `Fight ${n}` fallback fired and the string is safe
 * to overwrite wholesale.
 */
export interface FrameFightLabels {
    /** 0-based merge ordinal. */
    index: number;
    /** `F${index + 1}` */
    shortLabel: string;
    /** `log.filePath || log.id || \`fight-${index + 1}\`` */
    fightId: string;
    /** `log.filePath || \`fight-${index}\`` — the file-path-only chain. */
    filePathFightId: string;
    /** zone chain `details.fightName || log.fightName` (the eight modules, heal effectiveness). */
    fullLabel: string | null;
    /** zone chain `details.fightName || log.fightName || log.encounterName` (commander stats). */
    fullLabelWithEncounter: string | null;
    /**
     * Same zone chain as `fullLabelWithEncounter`, but built WITHOUT a duration:
     * `ingestLogFightBreakdown` is the one caller that omits `durationMs`, so its
     * label has no ` (m:ss)` suffix.
     */
    breakdownFullLabel: string | null;
    /** zone chain `details.fightName || log.encounterName` (tag-distance deaths). */
    fullLabelEncounterOnly: string | null;
    /** fight breakdown's `label`: `log.encounterName || \`Fight ${index + 1}\`` */
    breakdownLabel: string | null;
}

export function buildFrameLabelSeed(log: any): FrameLabelSeed {
    const details = log?.details;
    return {
        fightName: String(details?.fightName || ''),
        logFightName: String(log?.fightName || ''),
        encounterName: String(log?.encounterName || ''),
        filePath: String(log?.filePath || ''),
        logId: String(log?.id || ''),
        durationMs: Number(details?.durationMS || 0),
    };
}

export function resolveFrameFightLabels(seed: FrameLabelSeed | null | undefined, index: number): FrameFightLabels {
    if (!seed || typeof seed !== 'object') {
        throw new Error('resolveFrameFightLabels: frame carries no labelSeed; it was not produced by exportFrame');
    }
    const ordinalZone = `Fight ${index + 1}`;
    /**
     * `buildFightLabelV2` only consults `avgPosition` when the zone resolves to
     * a known map, and `Fight ${n}` never does — so the fallback label is a pure
     * function of the ordinal and the duration, and the frame needs to carry
     * neither positions nor a second label build.
     */
    const ordinalLabel = () => buildFightLabelV2({ zone: ordinalZone, durationMs: seed.durationMs, avgPosition: null });
    const zoned = (...chain: string[]) => (chain.some(Boolean) ? null : ordinalLabel());

    return {
        index,
        shortLabel: `F${index + 1}`,
        fightId: seed.filePath || seed.logId || `fight-${index + 1}`,
        filePathFightId: seed.filePath || `fight-${index}`,
        fullLabel: zoned(seed.fightName, seed.logFightName),
        fullLabelWithEncounter: zoned(seed.fightName, seed.logFightName, seed.encounterName),
        breakdownFullLabel: (seed.fightName || seed.logFightName || seed.encounterName)
            ? null
            : buildFightLabelV2({ zone: ordinalZone, avgPosition: null }),
        fullLabelEncounterOnly: zoned(seed.fightName, seed.encounterName),
        breakdownLabel: seed.encounterName ? null : ordinalZone,
    };
}

/** Overwrite `key` on `target` only when `value` is non-null. */
export function applyLabel(target: any, key: string, value: string | null): void {
    if (target && value !== null && value !== undefined) target[key] = value;
}
