import { describe, it, expect } from 'vitest';
import { toFightRosterEntries } from '../toFightRosterEntries';

const commanded = (name: string) => [
    { party: 1, players: [{ account: 'a.1', characterName: name, profession: 'Guardian', isCommander: true }] },
];

describe('toFightRosterEntries', () => {
    it('carries the fight commander onto the roster entry', () => {
        const [entry] = toFightRosterEntries([
            { id: 'log-a', fullLabel: 'EBG: Klovan', timestamp: 10, duration: '2:41', parties: commanded('Axi Vale') },
        ]);
        expect(entry.commander).toBe('Axi Vale');
    });

    it('leaves the commander unset for a fight nobody tagged', () => {
        const [entry] = toFightRosterEntries([
            { id: 'log-a', fullLabel: 'EBG: Klovan', timestamp: 10, duration: '2:41', parties: [] },
        ]);
        expect(entry.commander).toBeUndefined();
    });

    it('keeps the label precedence the tray filter depends on', () => {
        // The filter box matches map-shaped labels, so `fullLabel` must win over
        // `mapName` and the bare `label`, which the aggregator overwrites with
        // an "F1" ordinal.
        const [entry] = toFightRosterEntries([
            { id: 'log-a', fullLabel: 'EBG: Klovan', mapName: 'EBG', label: 'F1', timestamp: 10, duration: '2:41' },
        ]);
        expect(entry.label).toBe('EBG: Klovan');
        expect(toFightRosterEntries([{ id: 'b', mapName: 'EBG', label: 'F1' }])[0].label).toBe('EBG');
        expect(toFightRosterEntries([{ id: 'c', label: 'F1' }])[0].label).toBe('F1');
    });

    it('preserves the win flag and enemy counts the tray renders', () => {
        const [entry] = toFightRosterEntries([
            { id: 'log-a', fullLabel: 'EBG', timestamp: 10, duration: '1:00', isWin: true, enemyClassCounts: { Necromancer: 4 } },
        ]);
        expect(entry.isWin).toBe(true);
        expect(entry.enemyClassCounts).toEqual({ Necromancer: 4 });
    });
});
