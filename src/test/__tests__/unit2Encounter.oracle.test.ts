import { describe, expect, it } from 'vitest';
import { oracleFixture, expectEqualOrAllowlisted, FIXTURE_PATH, type DivergenceAllowlist } from '../axilogOracle';
import { applyEiCompatShims } from '../../main/axilogParser';
import {
    getEncounterDurationMs, getEncounterZone, getEncounterStartMs, getEncounterTeamMap,
} from '@axiapps/bridge-metrics';
import { teamMapFromLog } from '../../shared/wvwTeams';

const ALLOWLIST: DivergenceAllowlist = {
    'encounter start': {
        reason:
            'Native is right. EI emits no log-start event through to_ei_json, so '
            + 'applyEiCompatShims inferred the fight time from the .zevtc mtime (fight END, '
            + 'minus durationMS). Native reports encounter.started_at_unix, the real start. '
            + 'The delta is the inference error, and it is why this unit exists.',
    },
    'team map': {
        reason:
            'Neither is wrong; they answer different questions. EI wvWMapData carries all '
            + 'three teams of the MATCH from the arcdps statechange event (red 697 here). '
            + 'Native encounter.teams enumerates only the teams OBSERVED in this log, so a '
            + 'team that fielded nobody is absent. Every id native does report matches EI '
            + '(asserted below). teamMapFromLog therefore prefers native and fills empty '
            + 'slots from wvWMapData, rather than replacing one with the other.',
    },
};

describe('unit 2 oracle — encounter facts, EI vs native', () => {
    const { ei, native } = oracleFixture();
    // The shim is what today's EI readers actually see; compare against that,
    // not against raw ei-json, or the oracle flatters the migration.
    const shimmed = applyEiCompatShims(JSON.parse(JSON.stringify(ei)), FIXTURE_PATH);
    const withNative = { ...shimmed, native };

    it('agrees on encounter duration', () => {
        expectEqualOrAllowlisted('duration', Number(shimmed.durationMS), getEncounterDurationMs(withNative), {});
    });

    it('agrees on the zone', () => {
        expectEqualOrAllowlisted('zone', shimmed.zone, getEncounterZone(withNative), {});
    });

    it('records the team-map divergence as reviewed, not as agreement', () => {
        expectEqualOrAllowlisted('team map', teamMapFromLog(shimmed), getEncounterTeamMap(withNative), ALLOWLIST);
    });

    it('agrees on every team id native does report', () => {
        // The containment check that makes the allowlist entry above safe: native
        // may report FEWER teams than EI, but never a different id for a colour.
        const eiMap = teamMapFromLog(shimmed)!;
        const nativeMap = getEncounterTeamMap(withNative)!;
        (['red', 'green', 'blue'] as const).forEach((color) => {
            if (nativeMap[color] === 0) return;
            expect(nativeMap[color], `native ${color} team must match EI`).toBe(eiMap[color]);
        });
    });

    it('records the timestamp divergence as reviewed, not as agreement', () => {
        expectEqualOrAllowlisted(
            'encounter start', shimmed.timeStart * 1000, getEncounterStartMs(withNative), ALLOWLIST,
        );
    });

    it('shows the mtime inference is unbounded, not merely imprecise', () => {
        // Measured here: ~204 DAYS. The committed fixture's mtime is when git
        // checked it out (2026-08-10), while the fight happened 2026-01-18.
        //
        // That is not a fixture quirk to be tolerated — it is the production
        // failure mode. Any log copied between machines, restored from a
        // backup, synced, or re-downloaded gets an mtime unrelated to its
        // fight, and every EI-derived report date for it is wrong by that
        // much. The inference is only ever right for a log still sitting where
        // arcdps wrote it.
        const deltaMs = Math.abs(getEncounterStartMs(withNative)! - shimmed.timeStart * 1000);
        expect(deltaMs).toBeGreaterThan(24 * 60 * 60 * 1000);
    });

    it('reports a native start inside the fight, not an epoch or a file time', () => {
        // What replaces the bound the mtime cannot offer: native's start must
        // be a real instant, and the derived end must follow it by exactly the
        // encounter duration.
        const start = getEncounterStartMs(withNative)!;
        expect(start).toBeGreaterThan(Date.UTC(2015, 0, 1)); // after GW2's WvW era began
        expect(start).toBeLessThan(Date.UTC(2100, 0, 1));
        expect(new Date(start).toISOString()).toBe('2026-01-18T02:09:40.000Z');
    });

    it('reads a real map name, not a fightName-derived one', () => {
        expect(getEncounterZone(withNative)).toBe('Green Alpine Borderlands');
    });
});
