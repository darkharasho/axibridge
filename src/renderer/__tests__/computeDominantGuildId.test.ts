import { describe, expect, it } from 'vitest';
import { computeDominantGuildId } from '../stats/utils/computeDominantGuildId';

const log = (...players: Array<{ name?: string; account?: string; guildID?: string; notInSquad?: boolean; hasCommanderTag?: boolean }>) => ({ players });

describe('computeDominantGuildId', () => {
    it('follows the commander even when the squad mostly reps another guild', () => {
        expect(computeDominantGuildId([
            log(
                { name: 'Cmdr', account: 'C.1', guildID: 'g-cmd', hasCommanderTag: true },
                { name: 'A', guildID: 'g-pug' },
                { name: 'B', guildID: 'g-pug' },
                { name: 'C', guildID: 'g-pug' },
            ),
        ])).toBe('g-cmd');
    });

    it("picks the commander's most repped guild across logs", () => {
        expect(computeDominantGuildId([
            log({ name: 'Cmdr', account: 'C.1', guildID: 'g-alt', hasCommanderTag: true }),
            log({ name: 'Cmdr', account: 'C.1', guildID: 'g-main', hasCommanderTag: true }),
            log({ name: 'Cmdr', account: 'C.1', guildID: 'g-main', hasCommanderTag: true }),
        ])).toBe('g-main');
    });

    it('follows the primary commander when several people tag', () => {
        expect(computeDominantGuildId([
            log(
                { name: 'Main', account: 'M.1', guildID: 'g-main', hasCommanderTag: true },
                { name: 'Tail', account: 'T.1', guildID: 'g-tail', hasCommanderTag: true },
            ),
            log({ name: 'Main', account: 'M.1', guildID: 'g-main', hasCommanderTag: true }),
        ])).toBe('g-main');
    });

    it('falls back to the squad vote when the commander reps nothing', () => {
        expect(computeDominantGuildId([
            log(
                { name: 'Cmdr', account: 'C.1', hasCommanderTag: true },
                { name: 'A', guildID: 'g-pug' },
            ),
        ])).toBe('g-pug');
    });

    it('ignores the zero guild id', () => {
        expect(computeDominantGuildId([
            log(
                { name: 'Cmdr', account: 'C.1', guildID: '00000000-0000-0000-0000-000000000000', hasCommanderTag: true },
                { name: 'A', guildID: 'g-pug' },
            ),
        ])).toBe('g-pug');
    });

    it('picks the guild represented by the most accounts across logs', () => {
        expect(computeDominantGuildId([
            log({ name: 'A', guildID: 'g-eww' }, { name: 'B', guildID: 'g-eww' }, { name: 'C', guildID: 'g-pug' }),
            log({ name: 'A', guildID: 'g-eww' }, { name: 'C', guildID: 'g-pug' }),
        ])).toBe('g-eww');
    });

    it('breaks ties alphabetically by guild id', () => {
        expect(computeDominantGuildId([
            log({ name: 'A', guildID: 'g-zzz' }, { name: 'B', guildID: 'g-aaa' }),
        ])).toBe('g-aaa');
    });

    it('skips unrepped players and non-squad players', () => {
        expect(computeDominantGuildId([
            log({ name: 'A' }, { name: 'B', guildID: '' }, { name: 'Spy', guildID: 'g-enemy', notInSquad: true }),
        ])).toBe('');
        expect(computeDominantGuildId([])).toBe('');
    });

    it('counts an account once per log despite duplicate agent entries', () => {
        // EI emits one players[] entry per agent instance (relog/build swap).
        expect(computeDominantGuildId([
            log({ name: 'A', account: 'X.1', guildID: 'g-eww' }, { name: 'A2', account: 'X.1', guildID: 'g-eww' }, { name: 'B', guildID: 'g-pug' }),
            log({ name: 'B', guildID: 'g-pug' }),
        ])).toBe('g-pug');
    });

    it('uses the first entry per account per log when instances rep different guilds', () => {
        expect(computeDominantGuildId([
            log({ name: 'A', account: 'X.1', guildID: 'g-first' }, { name: 'A2', account: 'X.1', guildID: 'g-second' }),
        ])).toBe('g-first');
    });
});
