import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// StatsView is mounted `embedded` by FightReportHistoryView for historical
// reports (with `logs={[]}`), and by the web report. Feeding the roster from
// that mount would prune the live session's fightRoster down to nothing the
// moment a historical report is opened — mergeFightRoster prunes to whatever
// `logs` it is given, and embedded mounts hand it an empty (or foreign) log
// list. There is no practical way to mount the full StatsView component in a
// unit test (it pulls in the entire stats section tree), so this pins the
// guard at the source level: the effect that calls mergeFightRoster must
// bail out before calling it whenever `embedded` is true. If this effect is
// ever reordered so the guard no longer precedes the call, this test goes
// red.
describe('StatsView fight roster embedded guard', () => {
    const source = readFileSync(
        join(__dirname, '../../StatsView.tsx'),
        'utf-8'
    );

    it('guards the mergeFightRoster effect with an embedded early-return', () => {
        const anchor = source.indexOf('const mergeFightRoster = useStatsStore((s) => s.mergeFightRoster);');
        expect(anchor).toBeGreaterThan(-1);

        const effectEnd = source.indexOf('mergeFightRoster]);', anchor);
        expect(effectEnd).toBeGreaterThan(anchor);

        const effectBlock = source.slice(anchor, effectEnd);

        const guardIndex = effectBlock.indexOf('if (embedded) return;');
        const callIndex = effectBlock.indexOf('mergeFightRoster(');

        expect(guardIndex).toBeGreaterThan(-1);
        expect(callIndex).toBeGreaterThan(-1);
        expect(guardIndex).toBeLessThan(callIndex);
    });
});
