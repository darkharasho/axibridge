import { describe, expect, it } from 'vitest';
import { computeDominantGuildId } from '../stats/utils/computeDominantGuildId';

const ZERO = '00000000-0000-0000-0000-000000000000';
const GUILD_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const GUILD_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const ent = (over: any = {}) => ({
    id: 0,
    account: ':Player.1111',
    character: 'Player',
    role: 'squad',
    combat_participant: true,
    profession: 'Guardian',
    elite_spec: 'Firebrand',
    subgroup: 1,
    guild_id: ZERO,
    agent_addr: 1,
    instid: 1,
    ...over,
});

const report = (entities: any[]) => ({ entities } as any);

describe('computeDominantGuildId over native reports', () => {
    it('returns the guild the commander repped in the most logs', () => {
        const commander = (guild: string) =>
            ent({ id: 0, account: ':Cmdr.1', guild_id: guild, commander: { guid: 'g', segments: [[0, 1]], variant: 'p' } });
        const result = computeDominantGuildId([
            report([commander(GUILD_A), ent({ id: 1, account: ':Other.2', guild_id: GUILD_B })]),
            report([commander(GUILD_A), ent({ id: 1, account: ':Other.2', guild_id: GUILD_B })]),
            report([commander(GUILD_B), ent({ id: 1, account: ':Other.2', guild_id: GUILD_B })]),
        ]);
        expect(result).toBe(GUILD_A);
    });

    it('falls back to the squad-wide vote when nobody tagged', () => {
        const result = computeDominantGuildId([
            report([
                ent({ id: 0, account: ':A.1', guild_id: GUILD_B }),
                ent({ id: 1, account: ':B.2', guild_id: GUILD_B }),
                ent({ id: 2, account: ':C.3', guild_id: GUILD_A }),
            ]),
        ]);
        expect(result).toBe(GUILD_B);
    });

    it('falls back to the squad vote when the commander repped nothing', () => {
        const result = computeDominantGuildId([
            report([
                ent({ id: 0, account: ':Cmdr.1', guild_id: ZERO, commander: { guid: 'g', segments: [[0, 1]], variant: 'p' } }),
                ent({ id: 1, account: ':A.2', guild_id: GUILD_A }),
            ]),
        ]);
        expect(result).toBe(GUILD_A);
    });

    it('ignores non-squad allies in the squad-wide vote', () => {
        const result = computeDominantGuildId([
            report([
                ent({ id: 0, account: ':A.1', guild_id: GUILD_A }),
                ent({ id: 1, account: ':P.9', role: 'friendly_player', guild_id: GUILD_B }),
                ent({ id: 2, account: ':Q.8', role: 'friendly_player', guild_id: GUILD_B }),
            ]),
        ]);
        expect(result).toBe(GUILD_A);
    });

    it('breaks ties alphabetically by guild id', () => {
        const result = computeDominantGuildId([
            report([
                ent({ id: 0, account: ':A.1', guild_id: GUILD_B }),
                ent({ id: 1, account: ':B.2', guild_id: GUILD_A }),
            ]),
        ]);
        expect(result).toBe(GUILD_A);
    });

    it('returns empty when the whole squad is unrepped', () => {
        const result = computeDominantGuildId([
            report([ent({ id: 0, account: ':A.1' }), ent({ id: 1, account: ':B.2' })]),
        ]);
        expect(result).toBe('');
    });

    it('returns empty for a report with no entities at all', () => {
        expect(computeDominantGuildId([{} as any])).toBe('');
        expect(computeDominantGuildId([])).toBe('');
    });

    it('treats a missing guild_id the same as the zero guild', () => {
        const result = computeDominantGuildId([
            report([ent({ id: 0, account: ':A.1', guild_id: undefined }), ent({ id: 1, account: ':B.2', guild_id: GUILD_A })]),
        ]);
        expect(result).toBe(GUILD_A);
    });
});
