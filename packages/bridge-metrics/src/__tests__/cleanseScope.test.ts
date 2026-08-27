import { describe, it, expect } from 'vitest';
import { getPlayerCleanses, getPlayerCleansesArcdps, hasMinionCleanseData, hasArcdpsCleanseData } from '../dashboardMetrics';
import {
    resolveCleanseTotal,
    hasMinionCleanseData as rowsHaveMinionData,
    hasPartialMinionCleanseData,
    hasArcdpsMethodologyData
} from '../statsMetrics';

// Elite Insights scopes its cleanse count to `log.PlayerList`, so a condition
// removed from a ranger pet, necro minion, mesmer clone or revenant spirit is
// counted zero times. The in-game arcdps meter folds pets into their master and
// does count them, which is why arcdps reads a few percent higher for the same
// fight. axilog emits the missing bucket as `condiCleanseMinions`; Elite
// Insights never will, so "absent" and "zero" must stay distinguishable.
describe('cleanse scopes', () => {
    const withMinions: any = { support: [{ condiCleanse: 400, condiCleanseSelf: 50, condiCleanseMinions: 18 }] };
    const eiOnly: any = { support: [{ condiCleanse: 400, condiCleanseSelf: 50 }] };

    it('leaves the Elite Insights number alone', () => {
        expect(getPlayerCleanses(withMinions)).toBe(450);
        expect(getPlayerCleanses(eiOnly)).toBe(450);
    });

    it('adds the minion bucket for arcdps parity', () => {
        expect(getPlayerCleansesArcdps(withMinions)).toBe(468);
    });

    // The whole point of the separate counter: a log that cannot answer the
    // question must fall back to the EI number, not report 0.
    it('falls back to the EI number when the log carries no minion data', () => {
        expect(getPlayerCleansesArcdps(eiOnly)).toBe(450);
    });

    it('distinguishes an absent minion count from a genuine zero', () => {
        expect(hasMinionCleanseData(withMinions)).toBe(true);
        expect(hasMinionCleanseData(eiOnly)).toBe(false);
        expect(hasMinionCleanseData({ support: [{ condiCleanse: 1, condiCleanseSelf: 0, condiCleanseMinions: 0 }] } as any)).toBe(true);
    });

    describe('resolveCleanseTotal', () => {
        const row = { supportTotals: { condiCleanse: 400, condiCleanseSelf: 50, condiCleanseMinions: 18 } };
        it('squad excludes self and minions', () => expect(resolveCleanseTotal(row, 'squad')).toBe(400));
        it('all is EI parity: squad + self', () => expect(resolveCleanseTotal(row, 'all')).toBe(450));
        it('arcdps adds the minion bucket', () => expect(resolveCleanseTotal(row, 'arcdps')).toBe(468));
        it('handles a row with no support totals at all', () => {
            expect(resolveCleanseTotal({}, 'arcdps')).toBe(0);
            expect(resolveCleanseTotal(undefined, 'squad')).toBe(0);
        });
    });

    describe('availability across an aggregation', () => {
        it('reports unavailable when no log carried the field', () => {
            expect(rowsHaveMinionData([{ supportTotals: { condiCleanse: 5 }, logsJoined: 3 }])).toBe(false);
        });
        it('reports available when at least one log carried it', () => {
            expect(rowsHaveMinionData([
                { supportTotals: { condiCleanse: 5 }, logsJoined: 3 },
                { supportTotals: { condiCleanseMinionsLogs: 2 }, logsJoined: 2 }
            ])).toBe(true);
        });
        // A mixed axilog / Elite-Insights history makes the arcdps total a
        // floor, not an exact match for the in-game meter.
        it('flags a partially covered aggregation', () => {
            expect(hasPartialMinionCleanseData([{ supportTotals: { condiCleanseMinionsLogs: 2 }, logsJoined: 5 }])).toBe(true);
            expect(hasPartialMinionCleanseData([{ supportTotals: { condiCleanseMinionsLogs: 5 }, logsJoined: 5 }])).toBe(false);
            expect(hasPartialMinionCleanseData([{ supportTotals: {}, logsJoined: 5 }])).toBe(false);
        });
    });

    // axilog's arcdps-methodology counters are a transcription of the meter's
    // own counting code, NOT `condiCleanse + condiCleanseSelf +
    // condiCleanseMinions`. They apply exclusions EI has no notion of, so they
    // must replace that sum rather than extend it.
    describe('arcdps methodology counters', () => {
        const arcdps: any = {
            support: [{
                condiCleanse: 400,
                condiCleanseSelf: 50,
                condiCleanseMinions: 18,
                condiCleanseArcdps: 430,
                condiCleanseArcdpsByMinion: 7,
                condiCleanseArcdpsOnMinion: 18
            }]
        };

        it('replaces the legacy sum instead of adding to it', () => {
            // 430 + 18, NOT 450 + 18 and not 468 + anything.
            expect(getPlayerCleansesArcdps(arcdps)).toBe(448);
        });

        it('omits the "from npcs" bucket, which needs the other meter toggle', () => {
            expect(getPlayerCleansesArcdps(arcdps)).not.toBe(455);
        });

        it('leaves the Elite Insights number untouched', () => {
            expect(getPlayerCleanses(arcdps)).toBe(450);
        });

        it('distinguishes the new family from the legacy one', () => {
            expect(hasArcdpsCleanseData(arcdps)).toBe(true);
            expect(hasArcdpsCleanseData(withMinions)).toBe(false);
            expect(hasArcdpsCleanseData(eiOnly)).toBe(false);
        });

        // A genuine zero must stay distinguishable from an absent field here
        // too, or a quiet fight renders as "unavailable".
        it('treats a zero arcdps count as present', () => {
            expect(hasArcdpsCleanseData({ support: [{ condiCleanseArcdps: 0 }] } as any)).toBe(true);
        });

        describe('resolveCleanseTotal', () => {
            const row = {
                supportTotals: {
                    condiCleanse: 400,
                    condiCleanseSelf: 50,
                    condiCleanseMinions: 18,
                    condiCleanseArcdps: 430,
                    condiCleanseArcdpsOnMinion: 18,
                    condiCleanseArcdpsLogs: 3
                },
                logsJoined: 3
            };

            it('prefers the methodology counters for the arcdps scope', () => {
                expect(resolveCleanseTotal(row, 'arcdps')).toBe(448);
            });

            it('does not disturb the other two scopes', () => {
                expect(resolveCleanseTotal(row, 'squad')).toBe(400);
                expect(resolveCleanseTotal(row, 'all')).toBe(450);
            });

            // Rows aggregated before the counters existed must keep working.
            it('falls back to the legacy approximation without the logs counter', () => {
                const legacy = { supportTotals: { condiCleanse: 400, condiCleanseSelf: 50, condiCleanseMinions: 18 } };
                expect(resolveCleanseTotal(legacy, 'arcdps')).toBe(468);
            });
        });

        it('gates availability on either family', () => {
            expect(rowsHaveMinionData([{ supportTotals: { condiCleanseArcdpsLogs: 2 }, logsJoined: 2 }])).toBe(true);
            expect(hasArcdpsMethodologyData([{ supportTotals: { condiCleanseArcdpsLogs: 2 }, logsJoined: 2 }])).toBe(true);
            // Legacy rows can answer "arcdps", but not with the methodology.
            expect(hasArcdpsMethodologyData([{ supportTotals: { condiCleanseMinionsLogs: 2 }, logsJoined: 2 }])).toBe(false);
        });

        it('flags a partial aggregation on the new counter too', () => {
            expect(hasPartialMinionCleanseData([{ supportTotals: { condiCleanseArcdpsLogs: 2 }, logsJoined: 5 }])).toBe(true);
            expect(hasPartialMinionCleanseData([{ supportTotals: { condiCleanseArcdpsLogs: 5 }, logsJoined: 5 }])).toBe(false);
        });
    });
});
