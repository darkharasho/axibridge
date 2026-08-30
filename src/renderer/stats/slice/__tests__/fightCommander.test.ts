import { describe, it, expect } from 'vitest';
import { resolveFightCommander } from '../fightCommander';

/** A `squadCompByFight` entry, trimmed to the fields the resolver reads. */
const fight = (players: Array<{ characterName: string; isCommander?: boolean; party?: number }>) => ({
    id: 'f1',
    parties: players.map((p, i) => ({
        party: p.party ?? 1,
        players: [{ account: `acc.${i}`, characterName: p.characterName, profession: 'Guardian', isCommander: p.isCommander }],
    })),
});

describe('resolveFightCommander', () => {
    it('returns the character name of the single tagged player', () => {
        expect(resolveFightCommander(fight([
            { characterName: 'Pug One' },
            { characterName: 'Axi Vale', isCommander: true },
        ]))).toBe('Axi Vale');
    });

    it('returns undefined when nobody carried a tag', () => {
        expect(resolveFightCommander(fight([
            { characterName: 'Pug One' },
            { characterName: 'Pug Two' },
        ]))).toBeUndefined();
    });

    it('picks the alphabetically first name when several players tagged up', () => {
        // Matches computePrimaryCommanderIdentity's single-log behaviour: every
        // tagged player has exactly one vote, so the winner is the
        // alphabetically first display name. The tray must name the same
        // commander the report header does.
        expect(resolveFightCommander(fight([
            { characterName: 'Zephyr Wind', isCommander: true, party: 1 },
            { characterName: 'Axi Vale', isCommander: true, party: 3 },
        ]))).toBe('Axi Vale');
    });

    it('ignores a tagged player whose character name is blank', () => {
        expect(resolveFightCommander(fight([
            { characterName: '', isCommander: true },
            { characterName: 'Axi Vale', isCommander: true },
        ]))).toBe('Axi Vale');
    });

    it('returns undefined for a fight with no parties at all', () => {
        expect(resolveFightCommander({ id: 'f1', parties: [] })).toBeUndefined();
        expect(resolveFightCommander({ id: 'f1' })).toBeUndefined();
        expect(resolveFightCommander(null)).toBeUndefined();
    });
});
