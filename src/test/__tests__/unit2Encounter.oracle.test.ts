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
            'Native is right, and the EI side no longer answers at all. to_ei_json emits no '
            + 'log-start event, so applyEiCompatShims used to infer the fight time from the '
            + '.zevtc mtime — wrong by ~204 days on this fixture, and by the same magnitude '
            + 'for any log copied, restored or re-synced. Unit 2 deleted that inference and '
            + 'sources the timestamps from encounter.started_at_unix instead.',
    },
    'team map': {
        reason:
            'Native is right; the EI extra is fabricated. wvWMapData has a fixed '
            + 'red/blue/green shape, so to_ei_json fills a colour that fielded nobody with '
            + 'representative_team_id() -- a hardcoded 697/432/39 (axilog-ei/src/lib.rs:27). '
            + 'This fixture has no red player and still reports redTeamID 697, an id no '
            + 'agent in the log belongs to. encounter.teams enumerates only OBSERVED teams, '
            + 'and every id it does report matches EI (asserted below), so teamMapFromLog '
            + 'takes native outright rather than merging the placeholder in.',
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
            'encounter start', shimmed.timeStart, getEncounterStartMs(withNative), ALLOWLIST,
        );
    });

    it('leaves the EI side with no timestamp at all once native is unavailable', () => {
        // Before this unit the shim filled these from the `.zevtc` mtime. On
        // this very fixture that was wrong by ~204 days — git checked the file
        // out on 2026-08-10, the fight happened 2026-01-18 — and it was wrong
        // by the same magnitude for any user log copied, restored or re-synced.
        //
        // The inference is gone, so an EI-only parse now yields nothing here
        // and callers fall back to uploadTime. Absent beats invented.
        expect(shimmed.timeStart).toBeUndefined();
        expect(shimmed.timeStartStd).toBeUndefined();
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
