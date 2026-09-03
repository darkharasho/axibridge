import { describe, it, expect } from 'vitest';
import { computeFocus } from '../focus';

/** A native-shaped document with a tag, control rows and an optional census. */
const doc = (opts: {
    build?: string;
    tagSegments?: Array<[number, number]> | null;
    ccTaken?: Record<string, any[]> | undefined;
    tagDowns?: Array<[number, number]>;
    focus?: any;
}) => ({
    native: {
        encounter: { build: opts.build ?? '20260816' },
        entities: [
            { id: 1, role: 'squad', account: 'TAG.1111', ...(opts.tagSegments === null ? {} : { commander: { segments: opts.tagSegments ?? [[0, 90000]] } }) },
            { id: 2, role: 'squad', account: 'B.2222' },
            { id: 3, role: 'squad', account: 'C.3333' },
        ],
        catalogs: { skills: { '23306': { control_kind: 'stun_or_daze' }, '23295': { control_kind: 'knockback_or_pull' } } },
        blocks: {
            replay: { by_entity: { 1: { down: opts.tagDowns ?? [] } } },
            ...(opts.ccTaken === undefined ? {} : { cc: { taken_events: opts.ccTaken } }),
            ...(opts.focus ? { focus: opts.focus } : {}),
        },
    },
});

const row = (time_ms: number, src: number, skill_id = 23306) => ({ time_ms, src, skill_id, duration_ms: 1000 });

describe('computeFocus', () => {
    it('returns the empty focus when nobody held a tag', () => {
        const f = computeFocus(doc({ tagSegments: null }));
        expect(f.hasTag).toBe(false);
        expect(f.attempts.measured).toBe(false);
    });

    it('finds control bursts on the tag and scores them against the tag\'s own downs', () => {
        const f = computeFocus(doc({
            ccTaken: { 1: [row(10000, 50), row(10500, 51)] },
            tagDowns: [[11000, 13000]],
        }));
        expect(f.hasTag).toBe(true);
        expect(f.tagAccount).toBe('TAG.1111');
        expect(f.attempts.attempts).toHaveLength(1);
        expect(f.attempts.landedCount).toBe(1);
    });

    it('measures control bursts on a PRE-REWORK build, where the cast census cannot exist', () => {
        // The whole reason attempts and pressure are separate fields: attributed
        // CC is in every arcdps build, the cast census only after 2026-05.
        const f = computeFocus(doc({
            build: '20260114',
            ccTaken: { 1: [row(5000, 50), row(5400, 51), row(5800, 52)] },
        }));
        expect(f.castsMeasurable).toBe(false);
        expect(f.pressure.comparable).toBe(false);
        expect(f.attempts.measured).toBe(true);
        expect(f.attempts.peakSources).toBe(3);
        expect(f.attempts.survivedCount).toBe(1);
    });

    it('separates "CC pass never ran" from "the tag took no CC"', () => {
        expect(computeFocus(doc({ ccTaken: undefined })).attempts.measured).toBe(false);
        expect(computeFocus(doc({ ccTaken: {} })).attempts.measured).toBe(true);
    });

    it('grades the cast census against the rest of the squad, excluding the tag', () => {
        const f = computeFocus(doc({
            focus: {
                squad_size: 3, total_casts: 100, pre_down_window_ms: 3000,
                by_entity: {
                    1: { casts_drawn: 40, downs: 1, pre_down_casts: 20 },
                    2: { casts_drawn: 30, downs: 3, pre_down_casts: 9 },
                    3: { casts_drawn: 30, downs: 3, pre_down_casts: 6 },
                },
            },
        }));
        expect(f.castsMeasurable).toBe(true);
        expect(f.tagDowns).toBe(1);
        expect(f.otherDowns).toBe(6);
        // Tag 20/1 = 20 against the squad's (9+6)/6 = 2.5 -> 8x.
        expect(f.pressure.ratio).toBeCloseTo(8, 10);
        expect(f.pressure.band).toBe('converged');
    });

    it('refuses to grade the census against too few squad downs', () => {
        const f = computeFocus(doc({
            focus: {
                squad_size: 3, total_casts: 100, pre_down_window_ms: 3000,
                by_entity: {
                    1: { casts_drawn: 40, downs: 1, pre_down_casts: 20 },
                    2: { casts_drawn: 30, downs: 2, pre_down_casts: 9 },
                },
            },
        }));
        expect(f.pressure.comparable).toBe(false);
        expect(f.pressure.ratio).toBe(0);
    });

    it('picks the longest-held tag, matching buildSquadTracks', () => {
        const d: any = doc({});
        d.native.entities[1].commander = { segments: [[0, 200000]] };
        expect(computeFocus(d).tagAccount).toBe('B.2222');
    });
});
