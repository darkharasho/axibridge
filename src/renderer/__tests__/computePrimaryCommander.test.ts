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

    it('combines votes by account across logs with different character names', () => {
        // Same account (X.1) under two different names: Axi Vale and Axi Alt.
        // Should combine votes and return the first-seen name (Axi Vale).
        const logs = [
            { players: [{ name: 'Axi Vale', account: 'X.1', hasCommanderTag: true }] },
            { players: [{ name: 'Axi Alt', account: 'X.1', hasCommanderTag: true }] },
            { players: [{ name: 'Red', account: 'Y.2', hasCommanderTag: true }] },
        ];
        expect(computePrimaryCommander(logs)).toBe('Axi Vale');
    });

    it('counts same account once per log despite different names in that log', () => {
        // One log with same account (X.1) under two different names.
        // Should count as one vote for that log, not two.
        const dupesWithDiffNames = {
            players: [
                { name: 'Axi Vale', account: 'X.1', hasCommanderTag: true },
                { name: 'Axi Alt', account: 'X.1', hasCommanderTag: true },
            ],
        };
        const logs = [
            dupesWithDiffNames,
            log('Red'),
            log('Red'),
        ];
        expect(computePrimaryCommander(logs)).toBe('Red');
    });
});
