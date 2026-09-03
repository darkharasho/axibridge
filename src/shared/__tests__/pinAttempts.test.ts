import { describe, it, expect } from 'vitest';
import {
    findPinAttempts, pinAttemptLandedRate, PIN_ATTEMPT_LANDED_RATE,
    type PinAttemptInput,
} from '../pinAttempts';

const cc = (timeMs: number, sourceId: number | null, kind = 'stun_or_daze', durationMs = 1000): PinAttemptInput =>
    ({ timeMs, sourceId, controlKind: kind, durationMs });

describe('findPinAttempts', () => {
    it('reports "not measured" rather than "no attempts" when the CC pass never ran', () => {
        // axilog omits the container when the pass did not run. Returning an
        // empty summary with measured:true would render a fight where nobody
        // touched the tag — the opposite of "we cannot say".
        const s = findPinAttempts([cc(0, 1), cc(100, 2)], [], false);
        expect(s.measured).toBe(false);
        expect(s.attempts).toHaveLength(0);
    });

    it('ignores a burst from a single enemy — that is a duel, not a convergence', () => {
        const s = findPinAttempts([cc(0, 7), cc(500, 7), cc(900, 7)], [], true);
        expect(s.attempts).toHaveLength(0);
        expect(s.measured).toBe(true);
    });

    it('fires when two distinct enemies land control inside the window', () => {
        const s = findPinAttempts([cc(0, 1), cc(800, 2)], [], true);
        expect(s.attempts).toHaveLength(1);
        expect(s.attempts[0].sources).toBe(2);
        expect(s.attempts[0].applications).toBe(2);
    });

    it('does not fire when the two applications straddle the window', () => {
        const s = findPinAttempts([cc(0, 1), cc(2500, 2)], [], true);
        expect(s.attempts).toHaveLength(0);
    });

    it('counts a sustained chain as ONE attempt, not one per application', () => {
        // Otherwise a long lockdown inflates the attempt count in proportion to
        // how long it lasted, and a single bad moment reads as a whole fight of
        // being hunted.
        const events = [0, 400, 800, 1200, 1600].map((t, i) => cc(t, (i % 2) + 1));
        expect(findPinAttempts(events, [], true).attempts).toHaveLength(1);
    });

    it('scores a burst as landed when a down follows within the trailing window', () => {
        // Control has to be followed by damage to convert, so the down trails
        // the last application rather than coinciding with it.
        const events = [cc(1000, 1), cc(1500, 2)];
        expect(findPinAttempts(events, [3000], true).attempts[0].landed).toBe(true);
        expect(findPinAttempts(events, [9000], true).attempts[0].landed).toBe(false);
    });

    it('counts survived bursts, which is the whole point of the metric', () => {
        // A failed snipe leaves no trace in any down-conditioned measure, so
        // this is the only place it can be seen at all.
        const s = findPinAttempts([cc(0, 1), cc(500, 2), cc(20000, 3), cc(20500, 4)], [21000], true);
        expect(s.attempts).toHaveLength(2);
        expect(s.landedCount).toBe(1);
        expect(s.survivedCount).toBe(1);
    });

    it('ignores non-control rows and out-of-roster sources when counting enemies', () => {
        // A source axilog could not attribute cannot prove a SECOND attacker.
        const s = findPinAttempts([cc(0, 1), cc(200, null), cc(400, 2, 'boon_strip' as string)], [], true);
        expect(s.attempts).toHaveLength(0);
    });

    it('reports the peak distinct-attacker count, the validated severity axis', () => {
        const s = findPinAttempts([cc(0, 1), cc(100, 2), cc(9000, 3), cc(9100, 4), cc(9200, 5)], [], true);
        expect(s.peakSources).toBe(3);
    });
});

describe('pinAttemptLandedRate', () => {
    it('is monotone and clamps outside the measured range', () => {
        // Corpus frequencies, not a prediction: 2 attackers downed the tag 20%
        // of the time on the holdout half, rising to 47% at five or more.
        expect(pinAttemptLandedRate(1)).toBe(0.20);
        expect(pinAttemptLandedRate(2)).toBe(0.20);
        expect(pinAttemptLandedRate(4)).toBe(0.36);
        expect(pinAttemptLandedRate(9)).toBe(0.47);
        const rates = PIN_ATTEMPT_LANDED_RATE.map(r => r.rate);
        expect([...rates].sort((a, b) => a - b)).toEqual(rates);
    });
});
