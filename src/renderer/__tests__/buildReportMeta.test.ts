import { describe, expect, it } from 'vitest';
import { buildReportMeta } from '../stats/utils/buildReportMeta';

const GUILD_A = 'aaaaaaaa-0000-0000-0000-000000000001';

const nativeDetails = (encounter: any, entities: any[] = [], rest: any = {}) => ({
    players: [],
    ...rest,
    native: { axilog: { schema: '1.0' }, encounter, entities, coverage: {} },
});

describe('buildReportMeta window', () => {
    it('bounds the report window with native encounter times', () => {
        const meta = buildReportMeta([
            nativeDetails({ started_at_unix: 1768702180, duration_ms: 49285 }),
        ]);
        expect(new Date(meta.dateStart).getTime()).toBe(1768702180 * 1000);
        expect(new Date(meta.dateEnd).getTime()).toBe(1768702180 * 1000 + 49285);
    });

    it('spans the earliest start and latest end across logs', () => {
        const meta = buildReportMeta([
            nativeDetails({ started_at_unix: 1768702180, duration_ms: 1000 }),
            nativeDetails({ started_at_unix: 1768700000, duration_ms: 1000 }),
        ]);
        expect(new Date(meta.dateStart).getTime()).toBe(1768700000 * 1000);
        expect(new Date(meta.dateEnd).getTime()).toBe(1768702180 * 1000 + 1000);
    });

    it('still uses the EI chain for a log with no native report', () => {
        const meta = buildReportMeta([{ players: [], timeStartStd: '2026-01-18 02:09:40 +00' }]);
        expect(new Date(meta.dateStart).getTime()).toBe(Date.parse('2026-01-18T02:09:40Z'));
    });

    it('falls back to uploadTime when a log has neither', () => {
        const meta = buildReportMeta([{ players: [], uploadTime: '2026-01-18T02:09:40Z' }]);
        expect(new Date(meta.dateStart).getTime()).toBe(Date.parse('2026-01-18T02:09:40Z'));
    });
});

describe('buildReportMeta guild — the unit 1 interim regression', () => {
    it('resolves the session guild from native entities carried at the seam', () => {
        const entities = [
            { id: 0, role: 'squad', account: ':A.1', character: 'A', guild_id: GUILD_A },
            { id: 1, role: 'squad', account: ':B.2', character: 'B', guild_id: GUILD_A },
        ];
        const meta = buildReportMeta([
            nativeDetails({ started_at_unix: 1768702180, duration_ms: 1000 }, entities),
        ]);
        expect(meta.guildId).toBe(GUILD_A);
    });

    it('returns an empty guild for legacy EI-shaped logs rather than throwing', () => {
        const meta = buildReportMeta([{ players: [{ account: ':A.1', name: 'A' }] }]);
        expect(meta.guildId).toBe('');
    });
});

describe('buildReportMeta commanders', () => {
    it('collects tagged squad commanders and ignores pugs', () => {
        const meta = buildReportMeta([{
            players: [
                { name: 'Cmdr', account: ':C.1', hasCommanderTag: true },
                { name: 'Pug', account: ':P.2', hasCommanderTag: true, notInSquad: true },
                { name: 'Rando', account: ':R.3' },
            ],
        }]);
        expect(meta.commanders).toEqual(['Cmdr']);
        expect(meta.title).toBe('Cmdr');
    });

    it('titles an untagged session Unknown Commander', () => {
        expect(buildReportMeta([{ players: [] }]).title).toBe('Unknown Commander');
    });
});
