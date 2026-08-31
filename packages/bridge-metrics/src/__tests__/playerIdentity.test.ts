import { describe, it, expect } from 'vitest';
import { getPlayerAccountKey, isCombatInactiveEntry, partitionSquadPlayers } from '../playerIdentity';

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
    it('splits combat-inactive squad members out of the fighting strength', () => {
        // A squadmate who never dealt, took, healed, blocked or buffed
        // anything is on the roster but not in the fight, and must not
        // inflate the denominator every squad average divides by.
        const idle = entry({
            account: 'Afk.0001', name: 'Afk One',
            dpsAll: [{ damage: 0, dps: 0 }],
            defenses: [{ damageTaken: 0, dodgeCount: 0 }],
            squadBuffs: [],
        });
        const fighter = entry({ dpsAll: [{ damage: 12345, dps: 200 }], defenses: [{ damageTaken: 0 }] });
        const { squadPrimaries, idleSquadPrimaries } = partitionSquadPlayers([fighter, idle]);
        expect(squadPrimaries).toHaveLength(1);
        expect(squadPrimaries[0].account).toBe('Acct.1234');
        expect(idleSquadPrimaries).toHaveLength(1);
        expect(idleSquadPrimaries[0].account).toBe('Afk.0001');
    });
    it('counts a healer who dealt and took no damage as active', () => {
        // The whole point of testing the full surface rather than damage:
        // a support can finish a fight at zero DPS and zero damage taken.
        const { squadPrimaries, idleSquadPrimaries } = partitionSquadPlayers([entry({
            dpsAll: [{ damage: 0, dps: 0 }],
            defenses: [{ damageTaken: 0 }],
            extHealingStats: { outgoingHealing: [{ healing: 48000, hps: 900 }] },
        })]);
        expect(squadPrimaries).toHaveLength(1);
        expect(idleSquadPrimaries).toHaveLength(0);
    });
    it('treats one active entry as enough to make the person active', () => {
        // Relog mid-fight: the abandoned agent is an all-zero stub sitting
        // next to the entry that actually fought.
        const { squadPrimaries, idleSquadPrimaries } = partitionSquadPlayers([
            entry({ activeTimes: [10], dpsAll: [{ damage: 0 }], defenses: [{ damageTaken: 0 }] }),
            entry({ activeTimes: [900], dpsAll: [{ damage: 500 }], defenses: [{ damageTaken: 0 }] }),
        ]);
        expect(squadPrimaries).toHaveLength(1);
        expect(idleSquadPrimaries).toHaveLength(0);
    });
    it('leaves allies unsplit — no average divides by the ally count', () => {
        const { pugPrimaries } = partitionSquadPlayers([
            entry({ notInSquad: true, dpsAll: [{ damage: 0 }], defenses: [{ damageTaken: 0 }] }),
        ]);
        expect(pugPrimaries).toHaveLength(1);
    });
    it('treats an entry with no combat surface at all as active', () => {
        // A payload that simply does not report these fields must not be
        // read as "everyone was idle" — that would empty every squad count.
        expect(isCombatInactiveEntry(entry())).toBe(false);
        expect(partitionSquadPlayers([entry()]).squadPrimaries).toHaveLength(1);
    });
});
