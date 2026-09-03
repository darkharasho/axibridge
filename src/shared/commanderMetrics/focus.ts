// src/shared/commanderMetrics/focus.ts
// What the enemy aimed at the commander: control bursts (always measurable)
// and the enemy cast census (post-2026-05 arcdps builds only).

import { getFocusLog, isFocusMeasurable } from '@axiapps/bridge-metrics/nativeFocus';
import { hasCcTakenEvents, readCcTakenEvents } from '@axiapps/bridge-metrics/nativeSeries';
import { squadEntities } from '@axiapps/bridge-metrics/nativeRoster';
import { gradePinPressure, type PinPressure } from '../pinPressureCore';
import { EMPTY_PIN_ATTEMPTS, findPinAttempts, type PinAttemptSummary } from '../pinAttempts';
import type { CommanderFocus } from '../commanderTypes';

export const EMPTY_COMMANDER_FOCUS: CommanderFocus = {
    hasTag: false,
    tagAccount: '',
    castsMeasurable: false,
    pressure: { tagPerDown: 0, otherPerDown: 0, ratio: 0, band: 'normal', comparable: false },
    tagDowns: 0,
    otherDowns: 0,
    attempts: EMPTY_PIN_ATTEMPTS,
};

/** Total ms an entity held a commander tag. Ranks two tag-holders, never a timestamp. */
const taggedMs = (entity: any): number => {
    const segments = entity?.commander?.segments;
    if (!Array.isArray(segments)) return 0;
    let total = 0;
    for (const seg of segments) {
        if (Array.isArray(seg) && seg.length >= 2) total += Math.max(0, Number(seg[1]) - Number(seg[0]));
    }
    return total;
};

export function computeFocus(json: unknown): CommanderFocus {
    const details = json as any;
    const native = details?.native ?? null;
    if (!native) return EMPTY_COMMANDER_FOCUS;

    const squad = squadEntities(native);
    // Longest-held tag wins, matching `buildSquadTracks`' selection — two
    // surfaces disagreeing about who the commander was would be worse than
    // either rule being wrong.
    let tag: any = null;
    let tagMs = 0;
    for (const entity of squad) {
        const ms = taggedMs(entity);
        if (ms > tagMs) { tag = entity; tagMs = ms; }
    }
    if (!tag) return EMPTY_COMMANDER_FOCUS;

    // --- control bursts ----------------------------------------------------
    // Measurable on every arcdps build, unlike the cast census below. The
    // container's own absence is the gate: undefined means axilog's attributed
    // pass never ran, an empty object means it ran and the squad took no CC.
    const ccMeasured = hasCcTakenEvents(native);
    const downStarts: number[] = (native?.blocks?.replay?.by_entity?.[tag.id]?.down ?? [])
        .map((iv: unknown[]) => Number((iv as number[])?.[0]))
        .filter((n: number) => Number.isFinite(n));
    const attempts: PinAttemptSummary = ccMeasured
        ? findPinAttempts(readCcTakenEvents(native, String(tag.id)), downStarts, true)
        : EMPTY_PIN_ATTEMPTS;

    // --- enemy cast census -------------------------------------------------
    const castsMeasurable = isFocusMeasurable(details);
    const focus = castsMeasurable ? getFocusLog(details) : null;
    let pressure: PinPressure = EMPTY_COMMANDER_FOCUS.pressure;
    let tagDowns = 0;
    let otherDowns = 0;
    if (focus) {
        const tagRow = focus.rows.get(tag.id);
        let otherPreDownCasts = 0;
        for (const entity of squad) {
            if (entity.id === tag.id) continue;
            const row = focus.rows.get(entity.id);
            if (!row) continue;
            otherDowns += row.downs;
            otherPreDownCasts += row.preDownCasts;
        }
        tagDowns = tagRow?.downs ?? 0;
        pressure = gradePinPressure({
            tagDowns,
            tagPreDownCasts: tagRow?.preDownCasts ?? 0,
            otherDowns,
            otherPreDownCasts,
        });
    }

    return {
        hasTag: true,
        tagAccount: tag?.account ?? '',
        castsMeasurable,
        pressure,
        tagDowns,
        otherDowns,
        attempts,
    };
}
