import { describe, expect, it } from 'vitest';
import { oracleFixture, expectEqualOrAllowlisted, type DivergenceAllowlist } from '../axilogOracle';
import {
    getArena, getPollMs, getPositionTracks, getDistanceScalars, worldToPixel,
} from '@axiapps/bridge-metrics/nativePositioning';

const ALLOWLIST: DivergenceAllowlist = {
    'per-instant position': {
        reason:
            'Native is right, and the difference is a sampling divergence, not a '
            + 'projection error. GW2EI\'s ei_replay::handle_position freezes an actor '
            + 'across a >600ms gap whose last velocity reads ~zero and then snaps to '
            + 'the next real point; axilog\'s native downsampler interpolates straight '
            + 'through. The median projected difference on this fixture is pure '
            + 'rounding, but a minority of instants hold genuinely different '
            + 'positions -- one player held for three polls then jumped ~40 inches. '
            + 'Native\'s trajectory is the more faithful reconstruction and is '
            + 'golden-tested in axilog; changing it would move calibrated distance '
            + 'goldens there.',
    },
    'distance scalars': {
        reason:
            'There is no EI side to compare. axilog\'s to_ei_json never emitted '
            + 'statsAll[0].distToCom/stackDist -- measured absent for all 42 players '
            + 'on this fixture -- which is precisely why axibridge carried '
            + 'deriveDistanceScalars. That reconstruction was wrong twice over: it '
            + 'divided by EI\'s inchToPixel, rounded to 3dp (0.009 against a true '
            + '0.0087193, so every distance read 3.12% short), and it used the first '
            + 'player carrying hasCommanderTag as the reference for the whole fight '
            + 'because ei-json exposes no commander segments. Native computes both '
            + 'in-core from real segments in world inches. Unit 3 deletes the '
            + 'reconstruction rather than reconciling it.',
    },
};

describe('unit 3 oracle — positioning, EI vs native', () => {
    const { ei, native } = oracleFixture();
    const withNative = { native } as any;

    it('agrees on the polling rate', () => {
        expectEqualOrAllowlisted(
            'polling rate', (ei as any).combatReplayMetaData.pollingRate, getPollMs(withNative), {},
        );
    });

    it("reproduces EI's canvas size from the arena", () => {
        // EI squeezes the arena to a 750px max dimension. That is recoverable
        // from the native geometry; the native geometry is not recoverable
        // from it. Asserting the direction that holds.
        const a = getArena(withNative)!;
        const [w, h] = (ei as any).combatReplayMetaData.sizes;
        const scale = Math.min(750 / a.image_width, 750 / a.image_height);
        expect(Math.round(a.image_width * scale)).toBe(w);
        expect(Math.round(a.image_height * scale)).toBe(h);
    });

    it("projects onto EI's own pixel space to sub-pixel median error", () => {
        const a = getArena(withNative)!;
        const sizes = (ei as any).combatReplayMetaData.sizes as [number, number];
        const poll = getPollMs(withNative)!;
        const eiByAccount = new Map<string, any>();
        for (const p of (ei as any).players ?? []) eiByAccount.set(p.account, p.combatReplayData);

        const errors: number[] = [];
        for (const [id, track] of getPositionTracks(withNative)) {
            const entity = (native as any).entities.find((e: any) => e.id === id);
            const crd = entity ? eiByAccount.get(entity.account) : null;
            if (!crd?.positions?.length) continue;
            // CEIL: a track's first polled instant is its first-aware time
            // rounded UP onto the polling grid. Flooring shifts the whole
            // track one poll and makes a correct projection look broken.
            const first = Math.ceil(Number(crd.start) / poll) * poll;
            for (const [t, x, y] of track.samples) {
                const idx = (t - first) / poll;
                if (!Number.isInteger(idx) || idx < 0 || idx >= crd.positions.length) continue;
                const [px, py] = worldToPixel(a, x, y, sizes);
                const [ex, ey] = crd.positions[idx];
                errors.push(Math.hypot(px - ex, py - ey));
            }
        }
        expect(errors.length).toBeGreaterThan(1000);
        errors.sort((p, q) => p - q);
        const median = errors[Math.floor(errors.length / 2)];
        // MEDIAN, not max, and that is the only honest assertion here -- see
        // the 'per-instant position' allowlist entry.
        expect(median).toBeLessThan(0.01);
    });

    it('records the sampling divergence as reviewed, not as agreement', () => {
        expectEqualOrAllowlisted('per-instant position', 'ei-holds', 'native-interpolates', ALLOWLIST);
    });

    it('records that EI has no distance scalars to compare against', () => {
        expectEqualOrAllowlisted('distance scalars', null, null, ALLOWLIST);
    });

    it('confirms the EI side really is empty, so the allowlist entry is honest', () => {
        // If a future axilog starts emitting these, this fails and the
        // allowlist entry above must be revisited rather than kept on faith.
        for (const p of (ei as any).players ?? []) {
            expect(p.statsAll?.[0]?.distToCom).toBeUndefined();
            expect(p.statsAll?.[0]?.stackDist).toBeUndefined();
        }
    });

    it('measures every squad member and reports a plausible spread', () => {
        const scalars = getDistanceScalars(withNative);
        const squadIds = (native as any).entities.filter((e: any) => e.role === 'squad').map((e: any) => e.id);
        const measured = squadIds
            .map((id: number) => scalars.get(id)?.distToCom)
            .filter((v: any): v is number => typeof v === 'number' && v >= 0);
        expect(measured).toHaveLength(squadIds.length);
        expect(Math.min(...measured)).toBe(0);                 // the commander's own value
        expect(Math.max(...measured)).toBeGreaterThan(2000);   // a genuine straggler
    });

    it('has an arena for this map and lands every sample inside it', () => {
        const a = getArena(withNative)!;
        let checked = 0;
        for (const track of getPositionTracks(withNative).values()) {
            for (const [, x, y] of track.samples) {
                const [px, py] = worldToPixel(a, x, y);
                expect(px).toBeGreaterThanOrEqual(0);
                expect(px).toBeLessThanOrEqual(a.image_width);
                expect(py).toBeGreaterThanOrEqual(0);
                expect(py).toBeLessThanOrEqual(a.image_height);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(1000);
    });
});
