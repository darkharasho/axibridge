import { describe, it, expect } from 'vitest';
import detector from '../pinPressure';
import { DEFAULT_COMMANDER_THRESHOLDS as T } from '../../../../shared/commanderThresholds';
import { baseFight } from './_detectorFixture';
import type { CommanderFocus } from '../../../../shared/commanderTypes';

const attempt = (sources: number, landed: boolean) =>
    ({ startMs: 0, endMs: 500, applications: sources, sources, controlMs: 1000, landed });

const withFocus = (over: Partial<CommanderFocus>) => baseFight({
    focus: { ...baseFight().focus, hasTag: true, ...over },
});

describe('pinPressure detector', () => {
    it('stays silent when the CC pass never ran', () => {
        expect(detector(withFocus({}), T)).toBeNull();
    });

    it('stays silent when the tag was measured and never bursted', () => {
        const f = withFocus({ attempts: { attempts: [], landedCount: 0, survivedCount: 0, peakSources: 0, measured: true } });
        expect(detector(f, T)).toBeNull();
    });

    it('fires on a burst the tag SURVIVED, with no down anywhere in the fight', () => {
        // The reason this detector exists: a failed snipe is invisible to every
        // down-conditioned metric, so without this the fight reads as quiet.
        const f = withFocus({
            attempts: { attempts: [attempt(3, false)], landedCount: 0, survivedCount: 1, peakSources: 3, measured: true },
        });
        const out = detector(f, T);
        expect(out).not.toBeNull();
        expect(out!.side).toBe('bad');
        expect(out!.headline).toMatch(/survived/);
        expect(out!.evidence).toMatch(/peak 3 attackers/);
    });

    it('scales severity with the peak attacker count', () => {
        const mk = (n: number) => detector(withFocus({
            attempts: { attempts: [attempt(n, false)], landedCount: 0, survivedCount: 1, peakSources: n, measured: true },
        }), T)!.severity;
        expect(mk(5)).toBeGreaterThan(mk(2));
    });

    it('fires without the cast census, which is era-gated while CC is not', () => {
        const f = withFocus({
            castsMeasurable: false,
            attempts: { attempts: [attempt(4, true)], landedCount: 1, survivedCount: 0, peakSources: 4, measured: true },
        });
        const out = detector(f, T)!;
        expect(out.headline).toMatch(/landed/);
        expect(out.evidence).not.toMatch(/enemy casts/);
    });

    it('adds the cast ratio as evidence only when the build carries it AND it is comparable', () => {
        const attempts = { attempts: [attempt(2, true)], landedCount: 1, survivedCount: 0, peakSources: 2, measured: true };
        const notComparable = detector(withFocus({
            castsMeasurable: true, attempts,
            pressure: { tagPerDown: 8, otherPerDown: 0, ratio: 0, band: 'normal', comparable: false },
        }), T)!;
        expect(notComparable.evidence).not.toMatch(/enemy casts/);

        const comparable = detector(withFocus({
            castsMeasurable: true, attempts,
            pressure: { tagPerDown: 8, otherPerDown: 2, ratio: 4, band: 'converged', comparable: true },
        }), T)!;
        expect(comparable.evidence).toMatch(/enemy casts 4\.0×/);
    });
});
