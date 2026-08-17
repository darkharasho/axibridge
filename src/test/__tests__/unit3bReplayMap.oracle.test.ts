/**
 * Unit 3b oracle — the replay map view-model, EI vs native.
 *
 * Unit 3 moved the stats compute modules OFF map pixels entirely. This unit is
 * the opposite case: the map must stay in pixel space, because every landmark
 * in `wvwLandmarks.ts` and every `pixelOffset` in `wvwTiles.ts` is calibrated
 * against EI's canvas. So the thing to pin here is that the pixels native
 * produces are the pixels EI produced — otherwise the whole calibrated overlay
 * silently shifts.
 */
import { describe, expect, it } from 'vitest';
import { oracleFixture, expectEqualOrAllowlisted, type DivergenceAllowlist } from '../axilogOracle';
import { getArena, replayCanvas, pixelsPerInch } from '@axiapps/bridge-metrics/nativePositioning';
import { buildMovementData } from '../../shared/movementData';

const ALLOWLIST: DivergenceAllowlist = {
    'ally member count': {
        reason:
            'Native is right. axilog\'s ei-json compat emits no `players[].name` (it '
            + 'spells it `character_name`), and the old buildMovementData deduped '
            + 'allies on `name` -- so on the RAW ei-json compared here, all 42 '
            + 'collide on `undefined` and one survives. Production did not show this: '
            + '`applyEiCompatShims` back-fills `name` before anything reads it. The '
            + 'divergence is therefore a latent dependency, not a shipped bug -- but '
            + 'that shim is explicitly scheduled for deletion with its readers in '
            + 'unit 8, and deleting it would have turned this into a real one. '
            + 'Joining entities to tracks by id removes the dependency entirely.',
    },
    'inch scale': {
        reason:
            'Native is right. EI reports a single inchToPixel of 0.009 for an arena '
            + 'whose true scales are 523/61440 = 0.008512 (x) and 750/86016 = '
            + '0.0087193 (y). It is both rounded to 3dp and collapses a genuinely '
            + 'anisotropic projection -- the world rect ratio is 0.714 against an '
            + 'image ratio of 0.697 -- to one number, so range rings drawn with it '
            + 'were oversized and wrongly circular.',
    },
};

const TRACKED = new Set<number>([740, 725]);

describe('unit 3b oracle — replay map, EI vs native', () => {
    const { ei, native } = oracleFixture();
    const details = { ...ei, native } as any;
    const arena = getArena(details)!;

    it('reproduces EI\'s render canvas from the arena', () => {
        // The load-bearing assertion of this unit. If these ever diverge, every
        // landmark and tile offset is silently off by the ratio between them.
        expect(replayCanvas(arena)).toEqual(ei.combatReplayMetaData.sizes);
    });

    it('takes the map image from the arena, matching EI\'s', () => {
        expect(arena.image_url).toBe(ei.combatReplayMetaData.maps[0].url);
    });

    it('agrees on the polling rate', () => {
        const md = buildMovementData(details, { trackedBuffIds: TRACKED })!;
        expectEqualOrAllowlisted(
            'polling rate', ei.combatReplayMetaData.pollingRate, md.pollingRate, ALLOWLIST,
        );
    });

    it('places every ally within a pixel of where EI placed them', () => {
        const md = buildMovementData(details, {
            trackedBuffIds: TRACKED,
            precisePositions: true,
        })!;

        const eiByAccount = new Map<string, any>();
        for (const p of ei.players) {
            if (p?.account && !eiByAccount.has(p.account)) eiByAccount.set(p.account, p);
        }

        const errors: number[] = [];
        let compared = 0;
        for (const m of md.members) {
            if (m.isEnemy || !m.account) continue;
            const p = eiByAccount.get(m.account);
            const eiPositions = p?.combatReplayData?.positions;
            if (!eiPositions?.length) continue;

            // EI's positions[0] sits at poll ceil(start / pollingRate) — the
            // derivation unit 3 found five call sites getting wrong. Native
            // reads its own first timestamp, so agreement of the two indexings
            // is itself part of what this asserts.
            const eiFirstPoll = Math.ceil(Number(p.combatReplayData.start) / md.pollingRate);
            for (let i = 0; i < m.positions.length; i++) {
                const eiIdx = m.firstPoll + i - eiFirstPoll;
                if (eiIdx < 0 || eiIdx >= eiPositions.length) continue;
                const [ex, ey] = eiPositions[eiIdx];
                const [nx, ny] = m.positions[i];
                errors.push(Math.hypot(nx - ex, ny - ey));
                compared++;
            }
        }

        expect(compared).toBeGreaterThan(1000);
        errors.sort((a, b) => a - b);
        const median = errors[Math.floor(errors.length / 2)];
        // Sub-pixel: the same projection, reproduced from world coordinates.
        expect(median).toBeLessThan(0.01);
    });

    it('keeps every ally without depending on the name compat shim', () => {
        const md = buildMovementData(details, { trackedBuffIds: TRACKED })!;
        const allies = md.members.filter(m => !m.isEnemy).length;
        expect(allies).toBe(ei.players.length);

        // What the retired EI path yields on RAW ei-json, i.e. once the
        // `name` compat shim it silently relied on is removed in unit 8.
        const seen = new Set<unknown>();
        let eiKept = 0;
        for (const p of ei.players) {
            if (seen.has(p.name)) continue;
            seen.add(p.name);
            eiKept++;
        }
        expectEqualOrAllowlisted('ally member count', eiKept, allies, ALLOWLIST);
    });

    it('carries the enemies EI exposed as targets', () => {
        const md = buildMovementData(details, { trackedBuffIds: TRACKED })!;
        const enemies = md.members.filter(m => m.isEnemy).length;
        expect(enemies).toBe(ei.targets.filter((t: any) => t.enemyPlayer).length);
    });

    it('replaces EI\'s rounded single-axis inch scale with an exact pair', () => {
        const ppi = pixelsPerInch(arena, replayCanvas(arena));
        expectEqualOrAllowlisted(
            'inch scale', ei.combatReplayMetaData.inchToPixel, ppi.x, ALLOWLIST,
        );
        expect(ppi.x).toBeCloseTo(523 / 61440, 9);
        expect(ppi.y).toBeCloseTo(750 / 86016, 9);
    });

    it('finds no gaps in any native track', () => {
        // The dense positions[] encoding in MovementData depends on this. It is
        // asserted against the real fixture, not a hand-built one, so a future
        // axilog that introduces gaps fails here rather than silently.
        const tracks = native.blocks.replay.tracks;
        const poll = tracks.poll_ms;
        let checked = 0;
        for (const t of Object.values<any>(tracks.by_entity)) {
            for (let i = 1; i < t.samples.length; i++) {
                expect(t.samples[i][0] - t.samples[i - 1][0]).toBe(poll);
            }
            expect(t.samples[0][0] % poll).toBe(0);
            checked++;
        }
        expect(checked).toBeGreaterThan(70);
    });
});
