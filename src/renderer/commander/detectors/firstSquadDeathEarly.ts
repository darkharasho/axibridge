import type { Detector } from './types';

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const detector: Detector = (fight, thresholds) => {
  const d = fight.survival.firstSquadDeath;
  if (!d) return null;

  const earlyFlag = d.tSec < thresholds.firstDeathMinSec;
  const farFlag = d.distFromTag > thresholds.firstDeathMaxDist;
  if (!earlyFlag && !farFlag) return null;

  const severity = Math.min(
    1,
    (earlyFlag ? (thresholds.firstDeathMinSec - d.tSec) / thresholds.firstDeathMinSec : 0) +
      (farFlag ? (d.distFromTag - thresholds.firstDeathMaxDist) / thresholds.firstDeathMaxDist : 0),
  );

  const headline =
    earlyFlag && farFlag
      ? 'First squad death came early and far from tag'
      : earlyFlag
        ? 'First squad death came very early'
        : 'First squad death was far from tag';

  return {
    id: 'first-squad-death-early',
    side: 'bad',
    severity: 0.6 + 0.4 * severity,
    headline,
    evidence: `${fmtTime(d.tSec)}, ${d.distFromTag.toLocaleString()}u from tag · ${d.account.split('.')[0]} (${d.profession})`,
    threshold: `flag if < ${thresholds.firstDeathMinSec}s OR > ${thresholds.firstDeathMaxDist}u`,
    vizKind: 'mini-timeline',
    vizData: { markers: [{ tSec: d.tSec, color: 'red' }], duration: fight.duration },
  };
};

export default detector;
