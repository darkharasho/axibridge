import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// The fight-slice tray labels every card with `fightRoster[].label`. Before
// this pin, that field was set from `fight.label`, which
// incrementalAggregation.ts's finalize step *always* overwrites with the
// ordinal `F${idx + 1}` (see incrementalAggregation.ts:993, "squadCompByFight"
// finalize). Every tray card therefore read "F1", "F2", ... regardless of the
// actual fight, and the tray's "Filter by map or landmark" box could never
// match anything.
//
// The fix: fold `fullLabel` (map + nearest landmark, from
// computeFightBreakdown.ts's buildFightLabelV2) into the fightCompByFight
// memo, and prefer it — falling back to mapName, then the ordinal label —
// when building the roster entry. This test pins both halves of that wiring
// at the source level, because StatsView pulls in the entire stats section
// tree and cannot practically be mounted in a unit test (see the sibling
// statsViewFightRosterGuard.test.ts for the same constraint).
describe('StatsView fight roster label wiring', () => {
    const source = readFileSync(
        join(__dirname, '../../StatsView.tsx'),
        'utf-8'
    );

    it('threads fullLabel from the fight-breakdown match into fightCompByFight', () => {
        const memoAnchor = source.indexOf('const fightCompByFight = useMemo(');
        expect(memoAnchor).toBeGreaterThan(-1);
        const memoEnd = source.indexOf('[squadCompByFight, fightBreakdownRows]);', memoAnchor);
        expect(memoEnd).toBeGreaterThan(memoAnchor);
        const memoBody = source.slice(memoAnchor, memoEnd);

        expect(memoBody).toContain('fullLabel: match?.fullLabel');
    });

    // The label precedence itself moved out of this file into
    // `slice/toFightRosterEntries.ts`, where `toFightRosterEntries.test.ts`
    // pins it by behaviour rather than by source text. All this pin still owes
    // is that StatsView keeps delegating to that projection — if the mapping is
    // ever inlined back here, the behavioural pin would silently stop covering
    // what ships.
    it('builds the roster through the shared projection rather than an inline mapping', () => {
        const anchor = source.indexOf('const mergeFightRoster = useStatsStore((s) => s.mergeFightRoster);');
        expect(anchor).toBeGreaterThan(-1);
        const effectEnd = source.indexOf('mergeFightRoster]);', anchor);
        expect(effectEnd).toBeGreaterThan(anchor);
        const effectBlock = source.slice(anchor, effectEnd);

        expect(effectBlock).toContain('toFightRosterEntries(fightCompByFight)');
        expect(source).toContain("from './stats/slice/toFightRosterEntries'");
    });
});
