import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { computeStatsAggregation } from '../stats/computeStatsAggregation';

type FixturePlayer = {
    account?: string;
    name?: string;
    group?: number;
    notInSquad?: boolean;
    extHealingStats?: { outgoingHealingAllies?: any[][] };
    extBarrierStats?: { outgoingBarrierAllies?: any[][] };
};

const sumPhaseValue = (phases: any[] | undefined, field: string) => {
    if (!Array.isArray(phases)) return 0;
    return phases.reduce((sum, phase) => sum + Number(phase?.[field] ?? 0), 0);
};

const computeExpectedHealingTotals = (players: FixturePlayer[], playerIndex: number) => {
    const p = players[playerIndex];
    const totals: Record<string, number> = {
        healing: 0,
        squadHealing: 0,
        groupHealing: 0,
        selfHealing: 0,
        offSquadHealing: 0,
        downedHealing: 0,
        squadDownedHealing: 0,
        groupDownedHealing: 0,
        selfDownedHealing: 0,
        offSquadDownedHealing: 0,
        barrier: 0,
        squadBarrier: 0,
        groupBarrier: 0,
        selfBarrier: 0,
        offSquadBarrier: 0
    };

    const addByCategory = (baseField: 'healing' | 'downedHealing' | 'barrier', allyIdx: number, value: number) => {
        if (!Number.isFinite(value) || value <= 0) return;
        const ally = players[allyIdx];
        const isSelf = allyIdx === playerIndex;
        const isOffSquad = ally?.notInSquad;
        const isSquad = !isOffSquad;
        const isGroup = isSquad && ally?.group != null && ally.group === p.group;
        totals[baseField] += value;
        if (isSquad) totals[`squad${baseField[0].toUpperCase()}${baseField.slice(1)}`] += value;
        if (isGroup) totals[`group${baseField[0].toUpperCase()}${baseField.slice(1)}`] += value;
        if (isSelf) totals[`self${baseField[0].toUpperCase()}${baseField.slice(1)}`] += value;
        if (isOffSquad) totals[`offSquad${baseField[0].toUpperCase()}${baseField.slice(1)}`] += value;
    };

    const outgoingHealingAllies = p.extHealingStats?.outgoingHealingAllies;
    if (Array.isArray(outgoingHealingAllies)) {
        outgoingHealingAllies.forEach((allyPhases, allyIdx) => {
            addByCategory('healing', allyIdx, sumPhaseValue(allyPhases, 'healing'));
            addByCategory('downedHealing', allyIdx, sumPhaseValue(allyPhases, 'downedHealing'));
        });
    }

    const outgoingBarrierAllies = p.extBarrierStats?.outgoingBarrierAllies;
    if (Array.isArray(outgoingBarrierAllies)) {
        outgoingBarrierAllies.forEach((allyPhases, allyIdx) => {
            addByCategory('barrier', allyIdx, sumPhaseValue(allyPhases, 'barrier'));
        });
    }

    return totals;
};

describe('computeStatsAggregation (healing totals)', () => {
    it('aggregates healing totals by category from ext healing stats', () => {
        const fixturePath = path.resolve(process.cwd(), 'test-fixtures/ei/20260130-193742.json');
        const details = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        const players: FixturePlayer[] = details.players || [];

        const playerIndex = players.findIndex((p) => {
            const allies = p.extHealingStats?.outgoingHealingAllies;
            if (!Array.isArray(allies)) return false;
            const total = allies.reduce((sum, phases) => sum + sumPhaseValue(phases, 'healing'), 0);
            return total > 0;
        });
        expect(playerIndex).toBeGreaterThanOrEqual(0);

        const expected = computeExpectedHealingTotals(players, playerIndex);
        expect(expected.healing).toBeGreaterThan(0);

        const log = { details, status: 'success', filePath: fixturePath };
        const { stats } = computeStatsAggregation({ logs: [log] });

        const account = players[playerIndex].account || players[playerIndex].name || 'Unknown';
        const playerStats = stats.healingPlayers.find((entry: any) => entry.account === account);
        expect(playerStats).toBeTruthy();

        const healingTotals = playerStats.healingTotals || {};
        expect(healingTotals.healing).toBe(expected.healing);
        expect(healingTotals.squadHealing).toBe(expected.squadHealing);
        expect(healingTotals.groupHealing).toBe(expected.groupHealing);
        expect(healingTotals.selfHealing).toBe(expected.selfHealing);
        expect(healingTotals.offSquadHealing).toBe(expected.offSquadHealing);
        expect(healingTotals.downedHealing).toBe(expected.downedHealing);
        expect(healingTotals.barrier).toBe(expected.barrier);
    });
});
