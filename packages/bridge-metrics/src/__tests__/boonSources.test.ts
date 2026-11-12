/**
 * The per-skill boon split (`sources` on a `blocks.boons` row, axilog >=
 * 1.18.0). The committed fixture predates the arcdps buff rework, so axilog
 * never emits `sources` for it; these tests graft synthetic splits onto the
 * real parsed fixture.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parseFile, parseFileEi } from '@axiapps/axilog';
import { buildBoonTables } from '../boonGeneration';
import { collectBoonSourceSkills, getEntityBoonSources } from '../nativeBoons';
import { squadEntities } from '../nativeRoster';

const FIXTURE = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');
const MIGHT = 740;

const nativeBase: any = parseFile(FIXTURE, { everything: true } as any);
const eiBase: any = parseFileEi(FIXTURE, { everything: true } as any);

/** A fresh details object whose first Might generator carries `sources`. */
const withSources = (sources: any, skills: Record<string, any> = {}) => {
    const native = structuredClone(nativeBase);
    native.catalogs.skills = { ...native.catalogs.skills, ...skills };
    const entity = squadEntities(native).find(
        (e) => native.blocks.boons.by_entity[String(e.id)]?.[String(MIGHT)]?.generation?.self_pct > 0,
    )!;
    native.blocks.boons.by_entity[String(entity.id)][String(MIGHT)].sources = sources;
    const { skillMap, ...ei } = eiBase;
    return { details: { ...ei, native } as any, entity };
};

const SKILLS = {
    '9001': { name: 'Signet of Might' },
    '9002': { name: 'Signet of Might' }, // proc id sharing the cast's name
    '9003': { name: 'Banner of Strength' },
    '9004': { name: '9004' }, // axilog's placeholder for an unnamed id
};

describe('boon sources', () => {
    it('reads the raw split and drops empty rows', () => {
        const { details, entity } = withSources({ by_skill: { '9001': 100, '9003': 0 }, other_ms: 40 }, SKILLS);
        expect(getEntityBoonSources(details, entity.id, MIGHT)).toEqual({ bySkill: [{ id: 9001, ms: 100 }], otherMs: 40 });
        const empty = withSources({ by_skill: {}, other_ms: 0 }, SKILLS);
        expect(getEntityBoonSources(empty.details, empty.entity.id, MIGHT)).toBeNull();
    });

    it('merges same-name ids, pools unnamed ids, keeps other, and sums across logs', () => {
        const a = withSources({ by_skill: { '9001': 300, '9002': 100, '9003': 200, '9004': 50 }, other_ms: 350 }, SKILLS);
        const b = withSources({ by_skill: { '9003': 400 }, other_ms: 100 }, SKILLS);
        const { boonTables } = buildBoonTables([{ details: a.details }, { details: b.details }]);
        const row = boonTables
            .find((t) => t.id === `b${MIGHT}`)!
            .rows.find((r) => r.account === (a.entity.account || a.entity.character))!;
        expect(row.sources).toEqual({
            skills: [
                { name: 'Banner of Strength', ms: 600 },
                { name: 'Signet of Might', ms: 400 },
            ],
            unnamedMs: 50,
            otherMs: 450,
            totalMs: 1500,
        });
    });

    it('leaves rows without a split unmarked', () => {
        const { details, entity } = withSources({ by_skill: { '9001': 1 }, other_ms: 0 }, SKILLS);
        const might = buildBoonTables([{ details }]).boonTables.find((t) => t.id === `b${MIGHT}`)!;
        const others = might.rows.filter((r) => r.account !== (entity.account || entity.character));
        expect(others.length).toBeGreaterThan(0);
        expect(others.every((r) => r.sources === undefined)).toBe(true);
    });

    it('resolves names through a projection that drops catalogs.skills', () => {
        const { details } = withSources({ by_skill: { '9003': 10, '9004': 5 }, other_ms: 0 }, SKILLS);
        const boonSourceSkills = collectBoonSourceSkills(details);
        expect(boonSourceSkills['9003'].name).toBe('Banner of Strength');
        expect(boonSourceSkills['9004'].name).toBeNull();
        const projected = {
            ...details,
            boonSourceSkills,
            native: { ...details.native, catalogs: { buffs: details.native.catalogs.buffs } },
        };
        const row = buildBoonTables([{ details: projected }]).boonTables
            .find((t) => t.id === `b${MIGHT}`)!
            .rows.find((r) => r.sources)!;
        expect(row.sources!.skills).toEqual([{ name: 'Banner of Strength', ms: 10 }]);
        expect(row.sources!.unnamedMs).toBe(5);
    });
});
