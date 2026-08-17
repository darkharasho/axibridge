import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parseFileEi } from '@axiapps/axilog';

// __dirname-relative, not cwd-relative: this file runs both from the repo root
// (`npx vitest --root packages/bridge-metrics`) and from the package dir
// (`npm test -w @axiapps/bridge-metrics`).
const FIXTURE = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');

/**
 * The 8 fields OFFENSE_METRICS_STATS_ALL_FALLBACK used to substitute from
 * statsAll[0]. At axilog 0.3.4 they are reported per target, which is what
 * makes the fallback dead code. This test is the pin: if a future axilog
 * narrows the per-target split again, this goes red BEFORE the columns
 * silently read 0.
 */
const FORMERLY_SUBSTITUTED = [
    'connectedDirectDamageCount',
    'criticalRate',
    'criticalDmg',
    'flankingRate',
    'glanceRate',
    'againstDownedDamage',
    'appliedCrowdControl',
    'appliedCrowdControlDuration',
];

describe('statsTargets field surface at axilog 0.3.4', () => {
    it('reports every formerly-substituted field per target', () => {
        const details: any = parseFileEi(FIXTURE, { everything: true } as any);
        const perTarget = details.players[0].statsTargets[0][0];
        const missing = FORMERLY_SUBSTITUTED.filter((f) => perTarget[f] === undefined);
        expect(missing).toEqual([]);
    });

    it('reports the per-target downs/kills split', () => {
        const details: any = parseFileEi(FIXTURE, { everything: true } as any);
        const perTarget = details.players[0].statsTargets[0][0];
        expect(perTarget.downed).toBeDefined();
        expect(perTarget.killed).toBeDefined();
    });
});
