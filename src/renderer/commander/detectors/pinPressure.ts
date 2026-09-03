import type { Detector } from './types';
import { pinAttemptLandedRate } from '../../../shared/pinAttempts';
import { FOCUSED_RATIO } from '../../../shared/pinPressureCore';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Fire when several enemies converged control on the tag.
 *
 * This deliberately does NOT require the tag to have gone down. A snipe that
 * fails leaves no trace in any down-conditioned metric — the cast census can
 * only speak about a tag that fell — so without this the commander who got
 * jumped four times and walked out of all four sees a blank section. Measured
 * across a 4,117-log corpus, three quarters of control bursts on the tag are
 * survived, so the survived case is the common one, not the edge case.
 *
 * Severity is the peak distinct-attacker count, the only feature that held up
 * on a chronological holdout. The enemy cast ratio rides along as evidence
 * when the log's build carries it, but is NOT part of the score: folding it in
 * was measured and degraded holdout AUC. See `shared/pinAttempts.ts`.
 */
const detector: Detector = (fight) => {
  const { attempts, castsMeasurable, pressure } = fight.focus;
  if (!attempts.measured || attempts.attempts.length === 0) return null;

  const { landedCount, survivedCount, peakSources } = attempts;
  const total = attempts.attempts.length;

  // Severity tracks the corpus landed-rate ladder (20% at two attackers rising
  // to ~47% at five), rescaled so the mildest real burst still reads as a
  // finding rather than as noise.
  const severity = Math.min(1, 0.4 + 0.9 * (pinAttemptLandedRate(peakSources) - 0.2));

  const evidenceBits = [
    `${plural(total, 'control burst')} on the tag`,
    `peak ${plural(peakSources, 'attacker')} at once`,
  ];
  if (landedCount > 0) evidenceBits.push(`${landedCount} put the tag down`);
  if (survivedCount > 0) evidenceBits.push(`${plural(survivedCount, 'survived')}`);
  if (castsMeasurable && pressure.comparable) {
    evidenceBits.push(`enemy casts ${pressure.ratio.toFixed(1)}× the squad's rate before a down`);
  }

  return {
    id: 'pin-pressure',
    // Bad even when every burst was survived: several enemies committing
    // control to the tag is pressure the commander should know about, and
    // calling a survived burst "good" would reward being focused.
    side: 'bad',
    severity,
    headline: landedCount > 0
      ? `Tag focused — ${plural(landedCount, 'burst')} landed`
      : `Tag focused — ${plural(total, 'burst')} survived`,
    evidence: evidenceBits.join(' · '),
    threshold: `bad if 2+ enemies land 2+ control skills on the tag within 2s${
      castsMeasurable ? `; enemy casts flagged above ${FOCUSED_RATIO.toFixed(1)}×` : ''}`,
    vizKind: 'threshold-bar',
    vizData: {
      value: peakSources,
      threshold: 2,
      max: Math.max(6, peakSources),
      severity: peakSources >= 4 ? 'red' : 'amber',
    },
  };
};

export default detector;
