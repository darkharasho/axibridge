import { describe, it, expect } from 'vitest';
import { resolveIncomingStrips, CONTROL_BUCKET_MS, type ControlFightData } from '../computeControlTimeline';

const player = (group: number, displayName: string, stripsIn: number[]) => ({
    group, displayName, profession: 'Guardian', cc: [], stripsOut: [], stripsIn,
});

const fight = (overrides: Partial<ControlFightData> = {}): ControlFightData => ({
    id: 'C:\\logs\\Fight.zevtc',
    bucketCount: 3,
    durationMs: 15000,
    recorded: true,
    players: {
        'a.1111': player(1, 'A', [4, 0, 2]),
        'b.2222': player(2, 'B', [1, 1, 0]),
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
