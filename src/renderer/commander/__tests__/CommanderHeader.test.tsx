import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommanderHeader } from '../CommanderHeader';
import type { CommanderFightData } from '../../../shared/commanderTypes';

const fight: CommanderFightData = {
  fightId: 'f1',
  map: 'Eternal Battlegrounds',
  startedAt: Date.UTC(2026, 0, 28, 19, 4, 27),
  duration: 95,
  matchup: {
    squadCount: 25, alliesCount: 12, enemyCount: 50, enemyPeak: 53,
    effectiveRatio: 0.7, timeOutnumberedSec: 60,
    enemyComp: [], enemyByTeam: [], inTagBubbleAtEngage: 20,
  },
  survival: { firstSquadDeath: null, firstSupportDeath: null, squadAliveAtEnd: 20, squadTotal: 25, rallyRate: 0.5, rallies: 1, downs: 2, avgTimeDownedSec: 3 },
  burst: { worst3sIncoming: 0, worst3sIncomingTSec: 0, inHealRatioAtSpike: 0, healAtSpike: 0, bombWindowCount: 0, bombWindows: [], downsInWorst3s: 0, stabUptimeInSpike: 0 },
  cohesion: { avgDistFromTag: 0, timeSpread900PlusSec: 0, avgDistAtDeath: 0, peakSpreadStdev: 0, peakSpreadStdevTSec: 0, stragglersAtBomb: 0 },
  sustain: { cleansesApplied: 0, conditionsTaken: 0, stripsLanded: 0, stripsReceived: 0, stabThroughBombs: 0, resistanceAtBurst: 0, aegisAtBurst: 0 },
  engage: { squadHpAtEngage: 0, keyCdsUsed0to10s: 0, preEngageDowns: 0, stab0to10s: 0, dodgeStarvation: 'low' },
  outcome: { kills: 0, squadDeaths: 0, allyDeaths: 0, netTrade: 0, damageOut: 0, damageIn: 0, damageOutInRatio: 0 },
  series: { incomingDps: [], healingThroughput: [], stabUptime: [], spreadStdev: [], deathsTimeline: [] },
  verdictChips: ['outnumbered'],
};

describe('CommanderHeader', () => {
  it('renders map name and verdict chip', () => {
    render(
      <CommanderHeader
        fight={fight}
        availableFights={[{ id: 'f1', label: '19:04 · EB' }]}
        selectedFightId="f1"
        onSelectFight={() => {}}
      />
    );
    expect(screen.getByText(/Eternal Battlegrounds/)).toBeInTheDocument();
    expect(screen.getByText('outnumbered')).toBeInTheDocument();
  });
});
