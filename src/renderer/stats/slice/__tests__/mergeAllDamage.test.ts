import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    createAllDamageAccumulator,
    ingestLogAllDamage,
    finalizeAllDamage,
    extractAllDamageFrame,
    mergeAllDamageFrame,
} from '../../computeAllDamageData';
import { encodeState, decodeState } from '../stateCodec';
import { buildFrameLabelSeed, resolveFrameFightLabels } from '../frameLabels';

/**
 * Read at runtime rather than `import`ed: a static import of these fixtures
 * gives `tsc --noEmit` a multi-megabyte structural literal to infer, and
 * enough files doing it push `npm run typecheck` past its 8 GB heap.
 */
const fixture = (name: string) => JSON.parse(
    readFileSync(resolve(process.cwd(), `test-fixtures/native/${name}.json`), 'utf8'),
);

const LOGS = ['20260117-175120', '20260117-180135', '20260117-180259'].map(fixture).map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const OPTS = { splitPlayersByClass: false };

const directFinalize = (logs: any[]) => {
    const acc = createAllDamageAccumulator();
    logs.forEach((log) => ingestLogAllDamage(log, acc, OPTS));
    return finalizeAllDamage(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createAllDamageAccumulator();
        ingestLogAllDamage(log, solo, OPTS);
        const frame = extractAllDamageFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createAllDamageAccumulator();
    frames.forEach((frame, i) => mergeAllDamageFrame(merged, frame, resolveFrameFightLabels(buildFrameLabelSeed(logs[i]), i)));
    return finalizeAllDamage(merged);
};

describe('all damage merge equivalence', () => {
    it('reproduces the all-fights result from per-fight frames', () => {
        expect(framedFinalize(LOGS)).toEqual(directFinalize(LOGS));
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        expect(framedFinalize(subset)).toEqual(directFinalize(subset));
    });

    it('reproduces a single-fight slice', () => {
        expect(framedFinalize([LOGS[1]])).toEqual(directFinalize([LOGS[1]]));
    });

    it('survives a JSON round trip through the state codec', () => {
        expect(framedFinalize(LOGS, true)).toEqual(directFinalize(LOGS));
    });

    it('sums damage across the slice rather than returning empty state', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.players.length).toBeGreaterThan(0);
        expect(all.players[0].totalDamage).toBeGreaterThan(0);
        expect(all.fights).toHaveLength(3);
        expect(one.fights).toHaveLength(1);
    });

    it('refuses to export a frame from an accumulator holding more than one fight', () => {
        const acc = createAllDamageAccumulator();
        LOGS.forEach((log) => ingestLogAllDamage(log, acc, OPTS));
        expect(() => extractAllDamageFrame(acc)).toThrow(/exactly one fight/i);
    });
});

/**
 * Synthetic tie-break case. Player A is always first in *member* order
 * (native's `entities` array), but B outdamages A in fight 1 and A
 * outdamages B in fight 2, so each fight's `fight.players` (sorted by
 * `totalDamage` descending) puts them in the OPPOSITE order from member
 * order in one of the two fights. Merged totals land on a byte-identical
 * tie (30 each), so `finalizeAllDamage`'s stable sort cannot break the tie
 * itself — whichever key entered the player Map first survives to the front
 * of the output. Member-order folding (the pre-existing, non-slice
 * behaviour) must insert A before B; a damage-order fold would insert B
 * before A on fight 1 and keep that order.
 */
const makeSyntheticEntity = (id: number, key: string) => ({
    id,
    account: key,
    character: key,
    role: 'squad',
    combat_participant: true,
    profession: 'Guardian',
});

const makeSyntheticLog = (
    fightId: string,
    timeStartMs: number,
    totals: { a: number; b: number },
) => ({
    id: fightId,
    filePath: `${fightId}.zevtc`,
    details: {
        durationMS: 10000,
        fightName: fightId,
        timeStart: new Date(timeStartMs).toISOString(),
        success: false,
        players: [],
        native: {
            entities: [makeSyntheticEntity(1, 'AAAA'), makeSyntheticEntity(2, 'BBBB')],
            blocks: {
                damage: {
                    by_entity: {
                        '1': { total: totals.a, by_skill: {} },
                        '2': { total: totals.b, by_skill: {} },
                    },
                },
                series: { by_entity: {} },
                contribution: { by_entity: {} },
            },
            catalogs: { skills: {} },
        },
    },
});

describe('all damage merge — tie-break order matches member order, not damage order', () => {
    const TIE_LOGS = [
        makeSyntheticLog('fight-1', 1_000_000, { a: 10, b: 20 }),
        makeSyntheticLog('fight-2', 2_000_000, { a: 20, b: 10 }),
    ];

    it('keeps the frame-merged player order identical to direct ingest', () => {
        const direct = directFinalize(TIE_LOGS);
        const framed = framedFinalize(TIE_LOGS);

        // Non-vacuous: confirm the tie this test depends on is real.
        expect(direct.players).toHaveLength(2);
        expect(direct.players[0].totalDamage).toBe(30);
        expect(direct.players[1].totalDamage).toBe(30);

        expect(framed).toEqual(direct);
        expect(framed.players.map((p) => p.key)).toEqual(direct.players.map((p) => p.key));
        // Member order (native entity order) is A, B — that must survive the
        // tie, not the damage-sorted order fight 1 would otherwise impose.
        expect(direct.players.map((p) => p.key)).toEqual(['AAAA', 'BBBB']);
    });
});
