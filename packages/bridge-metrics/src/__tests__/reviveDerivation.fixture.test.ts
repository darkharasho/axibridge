import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveReviveLogSummary } from '../reviveDerivation';

/**
 * Every other revive assertion in this suite runs on a synthetic roster built by
 * this file's own helpers, so the whole suite would stay green if the real EI
 * field names drifted: rename `castTime` and every cast is skipped, every
 * recovery reports "unattributed", and nothing fails. This pins the derivation
 * against a real parsed log instead.
 *
 * The expected numbers below were measured by hand against this fixture:
 * 3 downs, all 3 recovered, 2 attributed to a hand resurrect and 1 to a utility
 * (Spirit of Nature, 2 casts across two druids, 1 of them credited with a
 * revive).
 *
 * Read with readFileSync, never a static `import`: a 5MB fixture pulled in as a
 * module OOMs `tsc --noEmit`.
 */
const FIXTURE = resolve(__dirname, '../../../../test-fixtures/native/20260117-180458.json');

describe('deriveReviveLogSummary on a real parsed log', () => {
    const details = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const summary = deriveReviveLogSummary(details);

    it('reads the real log shape rather than silently finding nothing', () => {
        expect(summary.hasData).toBe(true);
        expect(summary.downs).toBe(3);
        expect(summary.recovered).toBe(3);
        expect(summary.died).toBe(0);
    });

    it('attributes every recovery, splitting 2 hand / 1 utility', () => {
        expect(summary.byKind).toEqual({ hand: 2, utility: 1, self: 0, unattributed: 0 });
    });

    it('finds Spirit of Nature with 2 casts and 1 credited revive', () => {
        const spiritOfNature = summary.utilities.get(12569);
        expect(spiritOfNature).toBeTruthy();
        expect(spiritOfNature!.name).toBe('Spirit of Nature');
        expect(spiritOfNature!.casts).toBe(2);
        expect(spiritOfNature!.revives).toBe(1);
    });

    it('records real hand resurrect attempts and channel time', () => {
        // A non-zero attemptTimeMs proves `castTime`/`duration` were actually
        // read off the rotation entries, not defaulted.
        const attempts = [...summary.players.values()].reduce((sum, p) => sum + p.attempts, 0);
        const attemptTimeMs = [...summary.players.values()].reduce((sum, p) => sum + p.attemptTimeMs, 0);
        expect(attempts).toBe(3);
        expect(attemptTimeMs).toBe(7825);
    });
});
