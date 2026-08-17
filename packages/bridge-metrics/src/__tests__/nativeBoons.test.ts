/**
 * The load-bearing test here is the intensity/duration uptime rule. EI reports
 * `uptime` and `presence`; native reports `avg_stacks` and `uptime_pct`, and
 * the correspondence flips depending on `catalogs.buffs[id].stacking`. Reading
 * `uptime_pct` for an intensity buff is silent and renders Might at ~99 stacks
 * instead of ~19, so this pins the rule against the real fixture rather than a
 * hand-built one.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parseFile } from '@axiapps/axilog';
import {
    getBuffMeta,
    listBoonIds,
    getEntityBuffUptime,
    getEntityBuffPresence,
    getEntityBuffGeneration,
    getEntityBuffStates,
    getEntityBuffStatesPerSource,
    getEntityActiveMs,
} from '../nativeBoons';

const FIXTURE = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');

describe('nativeBoons', () => {
    const native: any = parseFile(FIXTURE, { everything: true } as any);
    const details = { native } as any;
    const squadId = native.entities.find((e: any) => e.role === 'squad').id;

    it('normalizes intensity stacking to the boolean the display math takes', () => {
        expect(getBuffMeta(details, 740)).toEqual({
            id: 740, name: 'Might', kind: 'boon', stacking: true, maxStacks: 25,
        });
        expect(getBuffMeta(details, 717)?.stacking).toBe(false);
        expect(getBuffMeta(details, 736)?.kind).toBe('condition');
    });

    it('returns null for a buff the catalog does not carry', () => {
        expect(getBuffMeta(details, 31484)).toBeNull();
    });

    it('lists only boons, not conditions', () => {
        const ids = listBoonIds(details);
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) expect(getBuffMeta(details, id)?.kind).toBe('boon');
        expect(ids).toContain(740);
        expect(ids).not.toContain(736);
        // Resolution is emitted under 873 and Aegis under 743 -- the pair the
        // old hardcoded BOON_IDS table had wrong.
        expect(ids).toContain(873);
        expect(ids).toContain(743);
    });

    it('passes through the third catalog kind instead of folding it into boon', () => {
        // axilog's catalog is three-valued -- a buff that is neither boon nor
        // condition is `effect` (Frost Aura, auras generally). `wvw-small`
        // catalogs only the buffs that actually appeared in it (12 boons, 14
        // conditions, no effects), so this case is unreachable from the real
        // fixture and needs a hand-built catalog to pin. Folding `effect` into
        // `boon` here would disagree with `listBoonIds`, which filters on
        // `kind === 'boon'` exactly -- the same buff would be a boon by meta
        // and not a boon by listing.
        const synthetic = {
            native: { catalogs: { buffs: {
                5579: { name: 'Frost Aura', kind: 'effect', stacking: 'duration', max_stacks: 1 },
                740: { name: 'Might', kind: 'intensity_typo_unknown', stacking: 'intensity', max_stacks: 25 },
            } } },
        } as any;
        expect(getBuffMeta(synthetic, 5579)?.kind).toBe('effect');
        expect(listBoonIds(synthetic)).not.toContain(5579);
        // An unrecognised kind still falls back to `boon` -- only the known
        // third value is passed through.
        expect(getBuffMeta(synthetic, 740)?.kind).toBe('boon');
    });

    it('reads avg_stacks for intensity buffs and uptime_pct for duration buffs', () => {
        for (const entity of native.entities.filter((e: any) => e.role === 'squad')) {
            const raw = native.blocks.boons.by_entity[String(entity.id)] ?? {};
            for (const [buffId, value] of Object.entries<any>(raw)) {
                const meta = getBuffMeta(details, buffId);
                if (!meta) continue;
                const expected = meta.stacking ? value.avg_stacks : value.uptime_pct;
                expect(getEntityBuffUptime(details, entity.id, Number(buffId))).toBe(expected);
                expect(getEntityBuffPresence(details, entity.id, Number(buffId))).toBe(value.uptime_pct);
            }
        }
    });

    it('only intensity buffs carry avg_stacks, which is why the rule is needed', () => {
        const raw = native.blocks.boons.by_entity[String(squadId)];
        const intensity = Object.entries<any>(raw).filter(([id]) => getBuffMeta(details, id)?.stacking);
        const duration = Object.entries<any>(raw).filter(([id]) => getBuffMeta(details, id)?.stacking === false);
        expect(intensity.length).toBeGreaterThan(0);
        expect(duration.length).toBeGreaterThan(0);
        for (const [, v] of intensity) expect(v.avg_stacks).toBeDefined();
        for (const [, v] of duration) expect(v.avg_stacks).toBeUndefined();
    });

    it('reads the generation triple with wasted, defaulting absent buffs to zero', () => {
        const gen = getEntityBuffGeneration(details, squadId, 740);
        expect(gen.self).toBeGreaterThanOrEqual(0);
        expect(Object.keys(gen).sort()).toEqual(
            ['group', 'groupWasted', 'self', 'selfWasted', 'squad', 'squadWasted'],
        );
        expect(getEntityBuffGeneration(details, squadId, 999999)).toEqual({
            self: 0, group: 0, squad: 0, selfWasted: 0, groupWasted: 0, squadWasted: 0,
        });
    });

    it('returns states as fight-relative [timeMs, stacks] pairs that integrate to uptime_pct', () => {
        // Independent check that `states` means what we think: the time-weighted
        // mean of the step function must reproduce the reported percentage.
        const duration = native.encounter.duration_ms;
        const buffId = 717;
        const states = getEntityBuffStates(details, squadId, buffId);
        if (states.length === 0) return;
        let onMs = 0;
        for (let i = 0; i < states.length; i++) {
            const [t, v] = states[i];
            const next = i + 1 < states.length ? states[i + 1][0] : duration;
            if (v >= 1) onMs += next - t;
        }
        const pct = (onMs / duration) * 100;
        expect(pct).toBeCloseTo(getEntityBuffPresence(details, squadId, buffId), 4);
    });

    it('keys per-source states by entity id, not character name', () => {
        const bySource = getEntityBuffStatesPerSource(details, squadId, 718);
        expect(bySource.size).toBeGreaterThan(0);
        for (const key of bySource.keys()) {
            expect(Number.isFinite(key)).toBe(true);
            // Every source must resolve to a real entity -- the join that
            // replaces EI's name-keyed statesPerSource.
            expect(native.entities.some((e: any) => e.id === key)).toBe(true);
        }
    });

    it('reads active_ms and falls back when the entity has no replay row', () => {
        expect(getEntityActiveMs(details, squadId, 1234)).toBe(
            native.blocks.replay.by_entity[String(squadId)].active_ms,
        );
        expect(getEntityActiveMs(details, 999999, 1234)).toBe(1234);
    });

    it('returns empty for a missing native container rather than throwing', () => {
        expect(getEntityBuffStates({} as any, 1, 740)).toEqual([]);
        expect(listBoonIds({} as any)).toEqual([]);
        expect(getBuffMeta({} as any, 740)).toBeNull();
    });
});
