import type { Detector } from './types';

/** Fire when the squad was already in trouble before the fight properly started:
 *  pre-engage downs piling up or HP at engage well below full. */
const detector: Detector = (fight) => {
  const { preEngageDowns, squadHpAtEngage } = fight.engage;
  const lowHp = squadHpAtEngage < 0.6;
  const tooManyDowns = preEngageDowns >= 2;
  if (!lowHp && !tooManyDowns) return null;

  // Severity scales with how far below 0.6 we are, plus how many pre-engage downs.
  const hpSeverity = lowHp ? Math.min(1, (0.6 - squadHpAtEngage) / 0.6) : 0;
  const downsSeverity = tooManyDowns ? Math.min(1, (preEngageDowns - 1) / 4) : 0;
  const combined = Math.min(1, hpSeverity + downsSeverity);

  const evidenceBits: string[] = [`${Math.round(squadHpAtEngage * 100)}% HP at engage`];
  if (preEngageDowns > 0) {
    evidenceBits.push(`${preEngageDowns} pre-engage down${preEngageDowns === 1 ? '' : 's'}`);
  }

  return {
    id: 'caught-at-engage',
    side: 'bad',
    severity: 0.5 + 0.5 * combined,
    headline: 'Caught at engage',
    evidence: evidenceBits.join(' · '),
    threshold: 'bad if HP at engage < 60% or preEngageDowns >= 2',
    vizKind: 'threshold-bar',
    vizData: {
      value: squadHpAtEngage,
      threshold: 0.6,
      max: 1,
      severity: 'red',
    },
  };
};

export default detector;
