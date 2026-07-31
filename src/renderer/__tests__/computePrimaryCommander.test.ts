import { describe, expect, it } from 'vitest';
import { computePrimaryCommander } from '../stats/utils/computePrimaryCommander';

const log = (...commanders: string[]) => ({
    players: commanders.map((name) => ({ name, hasCommanderTag: true })),
});

describe('computePrimaryCommander', () => {
    it('picks the commander who tagged the most logs', () => {
        expect(computePrimaryCommander([log('Axi'), log('Axi'), log('Red')])).toBe('Axi');
    });

    it('breaks ties alphabetically', () => {
        expect(computePrimaryCommander([log('Zed'), log('Axi')])).toBe('Axi');
    });

    it('returns empty string when nobody tagged', () => {
        expect(computePrimaryCommander([{ players: [{ name: 'A' }] }, {}])).toBe('');
        expect(computePrimaryCommander([])).toBe('');
    });

    it('ignores players not in squad', () => {
        const details = { players: [{ name: 'Spy', hasCommanderTag: true, notInSquad: true }] };
        expect(computePrimaryCommander([details])).toBe('');
    });

    it('counts a commander once per log despite duplicate agent entries', () => {
        // EI emits one players[] entry per agent instance (relog/build swap).
        const dupes = { players: [{ name: 'Axi', hasCommanderTag: true }, { name: 'Axi', hasCommanderTag: true }] };
        expect(computePrimaryCommander([dupes, log('Red'), log('Red')])).toBe('Red');
    });

    it('falls back to account when name is missing', () => {
        expect(computePrimaryCommander([{ players: [{ account: 'Axi.1234', hasCommanderTag: true }] }])).toBe('Axi.1234');
    });
});
