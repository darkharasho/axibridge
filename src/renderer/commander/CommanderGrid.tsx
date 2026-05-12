import { MatchupSection } from './sections/MatchupSection';
import { SurvivalSection } from './sections/SurvivalSection';
import { BurstSection } from './sections/BurstSection';
import { CohesionSection } from './sections/CohesionSection';
import { SustainSection } from './sections/SustainSection';
import { EngageSection } from './sections/EngageSection';
import { OutcomeSection } from './sections/OutcomeSection';
import type { CommanderFightData } from '../../shared/commanderTypes';
import type { CommanderThresholds } from '../../shared/commanderThresholds';

interface SectionProps {
  fight: CommanderFightData;
  thresholds: CommanderThresholds;
}

const SECTIONS: Array<{ title: string; Comp: (p: SectionProps) => JSX.Element }> = [
  { title: '1. Numbers & Matchup',      Comp: MatchupSection },
  { title: '2. Survival & Attrition',   Comp: SurvivalSection },
  { title: '3. Burst Exposure',         Comp: BurstSection },
  { title: '4. Cohesion & Positioning', Comp: CohesionSection },
  { title: '5. Sustain Race',           Comp: SustainSection },
  { title: '6. Engage Readiness',       Comp: EngageSection },
  { title: '7. Outcome Ledger',         Comp: OutcomeSection },
];

export function CommanderGrid({ fight, thresholds }: SectionProps) {
  return (
    <div className="flex flex-col gap-2">
      {SECTIONS.map(({ title, Comp }) => (
        <div key={title} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide mx-1 mt-2" style={{ color: 'var(--text-muted)' }}>
            <span>{title}</span>
            <span className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
          </div>
          <Comp fight={fight} thresholds={thresholds} />
        </div>
      ))}
    </div>
  );
}
