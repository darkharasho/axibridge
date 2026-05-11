import type { Detector } from './types';

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const detector: Detector = (fight, thresholds) => {
  const sd = fight.survival.firstSupportDeath;
  if (!sd) return null;
  const bombT = fight.burst.worst3sIncomingTSec;
  if (!bombT) return null;

  const lead = bombT - sd.tSec;
  if (lead < thresholds.supportPreBombLeadSec) return null;

  const severity = Math.min(1, lead / 20);
  return {
    id: 'first-support-death-pre-bomb',
    side: 'bad',
    severity: 0.5 + 0.5 * severity,
    headline: 'Key support died before the bomb',
    evidence: `${fmtTime(sd.tSec)} support down · bomb at ${fmtTime(bombT)} (${lead.toFixed(0)}s lead) · ${sd.account.split('.')[0]} (${sd.profession})`,
    threshold: `flag if support death > ${thresholds.supportPreBombLeadSec}s before bomb`,
    vizKind: 'mini-timeline',
    vizData: {
      markers: [
        { tSec: sd.tSec, color: 'red', label: 'support' },
        { tSec: bombT, color: 'orange', label: 'bomb' },
      ],
      duration: fight.duration,
    },
  };
};

export default detector;
