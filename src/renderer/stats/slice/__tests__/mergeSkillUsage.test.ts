import { describe, it, expect } from 'vitest';
import {
    createSkillUsageAccumulator,
    ingestLogSkillUsage,
    finalizeSkillUsage,
    extractSkillUsageFrame,
    mergeSkillUsageFrame,
} from '../../computeSkillUsageData';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const directFinalize = (logs: any[]) => {
    const acc = createSkillUsageAccumulator();
    logs.forEach((log) => ingestLogSkillUsage(log, acc));
    return finalizeSkillUsage(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createSkillUsageAccumulator();
        ingestLogSkillUsage(log, solo);
        const frame = extractSkillUsageFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createSkillUsageAccumulator();
    frames.forEach((frame) => mergeSkillUsageFrame(merged, frame));
    return finalizeSkillUsage(merged);
};

// Synthetic logs whose skill metadata for the SAME skill id disagrees across
// logs. Real fixtures never disagree on icon/autoAttack/proc for a shared
// skill id (only name occasionally differs), so a test built only on
// fixtures cannot distinguish "last log wins" from "first log wins" for
// those three maps. These synthetic logs make each map's winner observable
// and order-dependent.
const makeSyntheticLog = (id: string, opts: {
    name: string;
    icon: string;
    autoAttack: boolean;
    isTraitProc: boolean;
}) => ({
    id,
    filePath: `${id}.zevtc`,
    details: {
        fightName: id,
        durationMS: 1000,
        timeStartStd: '2026-01-17T17:00:00.000Z',
        skillMap: {
            s100: { name: opts.name, icon: opts.icon, autoAttack: opts.autoAttack, isTraitProc: opts.isTraitProc },
        },
        players: [
            {
                account: 'acct.1234',
                name: 'Acct',
                profession: 'Guardian',
                notInSquad: false,
                activeTimes: [1000],
                rotation: [{ id: 100, skills: [{ atTime: 0 }] }],
            },
        ],
    },
});

const SYN_A = makeSyntheticLog('syn-a', { name: 'NameA', icon: 'iconA.png', autoAttack: true, isTraitProc: true });
const SYN_B = makeSyntheticLog('syn-b', { name: 'NameB', icon: 'iconB.png', autoAttack: false, isTraitProc: false });

describe('skill usage merge equivalence', () => {
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

    it('sums cast counts across the slice rather than returning empty state', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.skillOptions.length).toBeGreaterThan(0);
        expect(all.logRecords).toHaveLength(3);
        expect(one.logRecords).toHaveLength(1);
        const allTotal = all.skillOptions.reduce((sum, s) => sum + s.total, 0);
        const oneTotal = one.skillOptions.reduce((sum, s) => sum + s.total, 0);
        expect(allTotal).toBeGreaterThan(oneTotal);
    });

    it('refuses to export a frame from an accumulator holding more than one log record', () => {
        const acc = createSkillUsageAccumulator();
        LOGS.forEach((log) => ingestLogSkillUsage(log, acc));
        expect(() => extractSkillUsageFrame(acc)).toThrow(/exactly one log/i);
    });

    it('matches direct ingest on conflicting synthetic metadata, in A-then-B order', () => {
        const framed = framedFinalize([SYN_A, SYN_B]);
        const direct = directFinalize([SYN_A, SYN_B]);
        expect(framed).toEqual(direct);
    });

    it('matches direct ingest on conflicting synthetic metadata, in B-then-A order', () => {
        const framed = framedFinalize([SYN_B, SYN_A]);
        const direct = directFinalize([SYN_B, SYN_A]);
        expect(framed).toEqual(direct);
    });

    it('pins last-log-wins for name and first-log-wins for icon/autoAttack/proc', () => {
        const abResult = framedFinalize([SYN_A, SYN_B]);
        const abSkill = abResult.skillOptions.find((s) => s.id === 's100')!;
        // Name: B ingested last -> B's name wins.
        expect(abSkill.name).toBe('NameB');
        // Icon/autoAttack/proc: A ingested first -> A's values win.
        expect(abSkill.icon).toBe('iconA.png');
        expect(abSkill.autoAttack).toBe(true);
        expect(abSkill.isTraitProc).toBe(true);

        const baResult = framedFinalize([SYN_B, SYN_A]);
        const baSkill = baResult.skillOptions.find((s) => s.id === 's100')!;
        // Reversed order flips both rules, proving they are genuinely
        // order-dependent rather than hardcoded to a particular log.
        expect(baSkill.name).toBe('NameA');
        expect(baSkill.icon).toBe('iconB.png');
        expect(baSkill.autoAttack).toBe(false);
        expect(baSkill.isTraitProc).toBe(false);
    });
});
