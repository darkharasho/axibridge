export const reportSmall = {
    meta: {
        id: '20260117-1751',
        title: 'Friday Reset',
        dateStart: '2026-01-17T17:51:20Z',
        dateEnd: '2026-01-17T19:00:00Z',
        generatedAt: '2026-01-17T19:05:00Z',
        commanders: ['Cmdr.1234']
    },
    stats: {
        total: 7,
        wins: 5,
        losses: 2,
        avgSquadSize: 28.4,
        avgEnemies: 31.2,
        totalSquadDeaths: 14,
        totalSquadDowns: 22,
        totalEnemyDeaths: 41,
        totalEnemyDowns: 58,
        offensePlayers: [
            { account: 'Player.5678', profession: 'Scourge', professionList: ['Scourge'], totalFightMs: 1_200_000, offenseTotals: { damage: 2_400_000, downContribution: 310_000, killed: 9, downed: 14, boonStrips: 120 }, offenseRateWeights: {} },
            { account: 'Cmdr.1234', profession: 'Firebrand', professionList: ['Firebrand'], totalFightMs: 1_200_000, offenseTotals: { damage: 600_000, downContribution: 40_000, killed: 2, downed: 4, boonStrips: 3 }, offenseRateWeights: {} }
        ],
        supportPlayers: [
            { account: 'Cmdr.1234', profession: 'Firebrand', professionList: ['Firebrand'], activeMs: 1_200_000, logsJoined: 7, supportTotals: { condiCleanse: 240, boonStrips: 3, resurrects: 6 } },
            { account: 'Player.5678', profession: 'Scourge', professionList: ['Scourge'], activeMs: 1_200_000, logsJoined: 7, supportTotals: { condiCleanse: 60, boonStrips: 120, resurrects: 1 } }
        ],
        healingPlayers: [
            { account: 'Cmdr.1234', profession: 'Firebrand', professionList: ['Firebrand'], activeMs: 1_200_000, hasHealAddon: true, healingTotals: { healing: 900_000, squadHealing: 850_000, barrier: 120_000 } }
        ],
        defensePlayers: [
            { account: 'Player.5678', profession: 'Scourge', professionList: ['Scourge'], activeMs: 1_200_000, logsJoined: 7, defenseTotals: { damageTaken: 800_000, downCount: 2, deadCount: 1 } },
            { account: 'Cmdr.1234', profession: 'Firebrand', professionList: ['Firebrand'], activeMs: 1_200_000, logsJoined: 7, defenseTotals: { damageTaken: 500_000, downCount: 1, deadCount: 0 } }
        ],
        generalPlayers: [
            { account: 'Player.5678', profession: 'Scourge', professionList: ['Scourge'], totalFightMs: 1_200_000, squadActiveMs: 1_150_000, logsJoined: 7, stackedLogCount: 6, totalDist: 1200, distCount: 7 },
            { account: 'Cmdr.1234', profession: 'Firebrand', professionList: ['Firebrand'], totalFightMs: 1_200_000, squadActiveMs: 1_200_000, logsJoined: 7, stackedLogCount: 7, totalDist: 0, distCount: 7 }
        ],
        attendanceData: [
            { account: 'Player.5678', characterNames: ['Alt'], combatTimeMs: 1_150_000, squadTimeMs: 3_600_000, classTimes: [{ profession: 'Scourge', timeMs: 1_150_000 }] },
            { account: 'Cmdr.1234', characterNames: ['Cmdr'], combatTimeMs: 1_200_000, squadTimeMs: 4_000_000, classTimes: [{ profession: 'Firebrand', timeMs: 1_200_000 }] }
        ],
        commanderStats: { rows: [{ account: 'Cmdr.1234', characterNames: ['Cmdr'], profession: 'Firebrand', fights: 7, kills: 41, downs: 58, commanderDeaths: 0, alliesDead: 14, wins: 5, losses: 2 }] }
    }
};
