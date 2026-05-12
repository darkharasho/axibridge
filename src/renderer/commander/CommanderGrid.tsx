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

const SECTIONS: Array<{ title: string; blurb: string; Comp: (p: SectionProps) => JSX.Element }> = [
  {
    title: '1. Numbers & Matchup',
    blurb: 'How many you brought vs how many showed up against you, including allies and enemy peak.',
    Comp: MatchupSection,
  },
  {
    title: '2. Survival & Attrition',
    blurb: 'When and where bodies started dropping — first death timing, rally rate, downs converted.',
    Comp: SurvivalSection,
  },
  {
    title: '3. Burst Exposure',
    blurb: 'The worst 3-second incoming spike, how many bombs landed, and whether sustain kept up.',
    Comp: BurstSection,
  },
  {
    title: '4. Cohesion & Positioning',
    blurb: 'How tight the squad stayed around tag and how spread out you were when the bomb dropped.',
    Comp: CohesionSection,
  },
  {
    title: '5. Sustain Race',
    blurb: 'Cleanses vs conditions and strips landed vs received — the support side of the trade.',
    Comp: SustainSection,
  },
  {
    title: '6. Engage Readiness',
    blurb: 'Squad HP, stab coverage, and key cooldowns during the first 10 seconds of the fight.',
    Comp: EngageSection,
  },
  {
    title: '7. Outcome Ledger',
    blurb: 'Final trade: kills, squad deaths, damage in vs out, and the net result of the fight.',
    Comp: OutcomeSection,
  },
];

export function CommanderGrid({ fight, thresholds }: SectionProps) {
  return (
    <div className="flex flex-col gap-2">
      {SECTIONS.map(({ title, blurb, Comp }) => (
        <div key={title} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2 mx-1 mt-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{title}</span>
            <span className="text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>{blurb}</span>
            <span className="flex-1 h-px self-center" style={{ background: 'var(--border-subtle)' }} />
          </div>
          <Comp fight={fight} thresholds={thresholds} />
        </div>
      ))}
    </div>
  );
}
