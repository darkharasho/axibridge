import { describe, it, expect } from 'vitest';
import { resolveIncomingStrips, resolveIncomingCc, CONTROL_BUCKET_MS, type ControlFightData } from '../computeControlTimeline';

const player = (group: number, displayName: string, stripsIn: number[], ccIn: number[] = []) => ({
    group, displayName, profession: 'Guardian', cc: [], stripsOut: [], stripsIn, ccIn,
});

const fight = (overrides: Partial<ControlFightData> = {}): ControlFightData => ({
    id: 'C:\\logs\\Fight.zevtc',
    label: 'Eternal Battlegrounds (0:15)',
    bucketCount: 3,
    durationMs: 15000,
    recorded: true,
    ccInRecorded: true,
    players: {
        'a.1111': player(1, 'A', [4, 0, 2], [6, 3, 0]),
        'b.2222': player(2, 'B', [1, 1, 0], [2, 0, 1]),
    },
    ...overrides,
});

describe('resolveIncomingStrips', () => {
    it('reads the named player and normalizes intensity against that player peak', () => {
        const result = resolveIncomingStrips(fight(), 'a.1111', CONTROL_BUCKET_MS, 3);
        expect(result.scope).toBe('player');
        expect(result.buckets).toEqual([4, 0, 2]);
        expect(result.intensity).toEqual([1, 0, 0.5]);
    });

    // The boon charts address rows by keys the control accumulator never sees
    // (`__all__`, `__subgroup__:2`). A per-player lookup for those returns
    // nothing, and drawing that as zeros would claim nobody was stripped.
    it('sums the squad when the key is an aggregate row rather than a player', () => {
        const result = resolveIncomingStrips(fight(), '__all__', CONTROL_BUCKET_MS, 3);
        expect(result.scope).toBe('squad');
        expect(result.buckets).toEqual([5, 1, 2]);
    });

    it('reports absent rather than zero when the fight recorded no lanes', () => {
        const result = resolveIncomingStrips(fight({ recorded: false }), 'a.1111', CONTROL_BUCKET_MS, 3);
        expect(result.recorded).toBe(false);
        expect(result.buckets).toEqual([0, 0, 0]);
    });

    it('reports absent for a fight the control accumulator never saw', () => {
        expect(resolveIncomingStrips(null, 'a.1111', CONTROL_BUCKET_MS, 2).recorded).toBe(false);
    });

    // The boon uptime interval is user-configurable down to 1s. Each finer
    // bucket repeats the 5s value covering it, so the shape stays right at 5s
    // resolution and the numbers stay whole counts.
    it('repeats the covering 5s value when the target interval is finer', () => {
        const result = resolveIncomingStrips(fight(), 'a.1111', 1000, 15);
        expect(result.buckets).toEqual([4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2]);
        expect(result.intensity.slice(0, 5)).toEqual([1, 1, 1, 1, 1]);
    });

    it('pads with zeros past the end of the recorded series', () => {
        expect(resolveIncomingStrips(fight(), 'a.1111', CONTROL_BUCKET_MS, 5).buckets).toEqual([4, 0, 2, 0, 0]);
    });
});

describe('resolveIncomingCc', () => {
    it('reads the cc_taken lane, not the strips lane', () => {
        const result = resolveIncomingCc(fight(), 'a.1111', CONTROL_BUCKET_MS, 3);
        expect(result.scope).toBe('player');
        expect(result.buckets).toEqual([6, 3, 0]);
    });

    it('sums the squad for an aggregate row', () => {
        expect(resolveIncomingCc(fight(), '__all__', CONTROL_BUCKET_MS, 3).buckets).toEqual([8, 3, 1]);
    });

    // The load-bearing case. `cc_taken` shipped in axilog 1.9.0, one release
    // after the strips lanes, so a fight parsed by 1.8.x is `recorded` on the
    // strength of its strips and carries no incoming CC at all. Gating CC on
    // the shared flag would draw that fight as an all-zero band reading
    // "nobody was CC'd".
    it('reports absent for a 1.8.x fight that recorded strips but no CC', () => {
        const stale = fight({ recorded: true, ccInRecorded: false });
        expect(resolveIncomingStrips(stale, 'a.1111', CONTROL_BUCKET_MS, 3).recorded).toBe(true);
        const cc = resolveIncomingCc(stale, 'a.1111', CONTROL_BUCKET_MS, 3);
        expect(cc.recorded).toBe(false);
        expect(cc.buckets).toEqual([0, 0, 0]);
    });

    // A `report.json` written before `ccInRecorded` existed has no such field.
    // Undefined must read as absent, not as recorded.
    it('reports absent when the fight predates the flag entirely', () => {
        const legacy = { ...fight() } as Partial<ControlFightData>;
        delete legacy.ccInRecorded;
        expect(resolveIncomingCc(legacy as ControlFightData, 'a.1111', CONTROL_BUCKET_MS, 3).recorded).toBe(false);
    });
});
