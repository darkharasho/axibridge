import { describe, it, expect } from 'vitest';
import { getPlayerAccountKey, partitionSquadPlayers } from '../playerIdentity';

const entry = (over: any = {}) => ({
    account: 'Acct.1234', name: 'Char One', profession: 'Guardian',
    notInSquad: false, activeTimes: [1000], ...over
});

describe('getPlayerAccountKey', () => {
    it('prefers account over name', () => {
        expect(getPlayerAccountKey(entry())).toBe('acct:Acct.1234');
    });
    it('falls back to character name when account is missing or Unknown', () => {
        expect(getPlayerAccountKey(entry({ account: undefined }))).toBe('name:Char One');
        expect(getPlayerAccountKey(entry({ account: 'Unknown' }))).toBe('name:Char One');
        expect(getPlayerAccountKey(entry({ account: '   ' }))).toBe('name:Char One');
    });
    it('returns null when neither account nor name identify the entry', () => {
        expect(getPlayerAccountKey({ notInSquad: false })).toBeNull();
        expect(getPlayerAccountKey(entry({ account: undefined, name: 'Unknown' }))).toBeNull();
    });
});

describe('partitionSquadPlayers', () => {
    it('collapses duplicate squad entries to one person', () => {
        const players = [
            entry({ profession: 'Specter', activeTimes: [100] }),
            entry({ profession: 'Daredevil', activeTimes: [900] }),
            entry({ profession: 'Antiquary', activeTimes: [50] }),
            entry({ account: 'Other.5678', name: 'Char Two' })
        ];
        const { squadPrimaries, pugPrimaries } = partitionSquadPlayers(players);
        expect(squadPrimaries).toHaveLength(2);
        expect(pugPrimaries).toHaveLength(0);
    });
    it('picks the longest-active entry as the primary', () => {
        const { squadPrimaries } = partitionSquadPlayers([
            entry({ profession: 'Specter', activeTimes: [100] }),
            entry({ profession: 'Daredevil', activeTimes: [900] })
        ]);
        expect(squadPrimaries[0].profession).toBe('Daredevil');
    });
    it('breaks active-time ties to the first entry seen', () => {
        const { squadPrimaries } = partitionSquadPlayers([
            entry({ profession: 'Specter', activeTimes: [500] }),
            entry({ profession: 'Daredevil', activeTimes: [500] })
        ]);
        expect(squadPrimaries[0].profession).toBe('Specter');
    });
    it('collapses duplicate pug entries', () => {
        const { squadPrimaries, pugPrimaries } = partitionSquadPlayers([
            entry({ notInSquad: true }),
            entry({ notInSquad: true, profession: 'Druid' })
        ]);
        expect(squadPrimaries).toHaveLength(0);
        expect(pugPrimaries).toHaveLength(1);
    });
    it('counts a person seen both in and out of squad once, as squad', () => {
        const { squadPrimaries, pugPrimaries } = partitionSquadPlayers([
            entry({ notInSquad: true, activeTimes: [900] }),
            entry({ notInSquad: false, activeTimes: [100] })
        ]);
        expect(squadPrimaries).toHaveLength(1);
        expect(pugPrimaries).toHaveLength(0);
    });
    it('keeps unidentifiable entries as separate people', () => {
        const { squadPrimaries } = partitionSquadPlayers([
            { notInSquad: false }, { notInSquad: false }
        ]);
        expect(squadPrimaries).toHaveLength(2);
    });
    it('excludes fake and friendly-NPC entries', () => {
        const { squadPrimaries, pugPrimaries } = partitionSquadPlayers([
            entry({ isFake: true }),
            entry({ account: 'Npc.0001', name: 'Siege Golem', friendlyNPC: true, notInSquad: true })
        ]);
        expect(squadPrimaries).toHaveLength(0);
        expect(pugPrimaries).toHaveLength(0);
    });
    it('handles non-array input', () => {
        expect(partitionSquadPlayers(undefined).squadPrimaries).toHaveLength(0);
        expect(partitionSquadPlayers(null).pugPrimaries).toHaveLength(0);
    });
});
