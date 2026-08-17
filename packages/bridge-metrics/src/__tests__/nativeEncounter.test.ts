import { describe, expect, it } from 'vitest';
import {
    getNativeReport, getEncounterDurationMs, getEncounterZone,
    getEncounterStartMs, getEncounterEndMs, getEncounterTeamMap,
} from '../nativeEncounter';

const details = (encounter: any) => ({
    players: [],
    native: { axilog: { schema: '1.0' }, encounter, entities: [], coverage: {} },
});

const FIXTURE_ENCOUNTER = {
    map: 'Green Alpine Borderlands',
    duration_ms: 49285,
    started_at_unix: 1768702180,
    kind: 'wvw',
    teams: [
        { team_id: 0, color: 'unknown' },
        { team_id: 433, color: 'blue' },
        { team_id: 2767, color: 'green' },
    ],
};

describe('nativeEncounter readers', () => {
    it('reads duration, zone and start from the encounter block', () => {
        const d = details(FIXTURE_ENCOUNTER);
        expect(getEncounterDurationMs(d)).toBe(49285);
        expect(getEncounterZone(d)).toBe('Green Alpine Borderlands');
        expect(getEncounterStartMs(d)).toBe(1768702180 * 1000);
    });

    it('derives the end as start + duration', () => {
        expect(getEncounterEndMs(details(FIXTURE_ENCOUNTER))).toBe(1768702180 * 1000 + 49285);
    });

    it('builds the team map from encounter.teams', () => {
        expect(getEncounterTeamMap(details(FIXTURE_ENCOUNTER))).toEqual({ red: 0, green: 2767, blue: 433 });
    });

    it('returns null for every reader when no native report is carried', () => {
        const d = { players: [] };
        expect(getNativeReport(d)).toBeNull();
        expect(getEncounterDurationMs(d)).toBeNull();
        expect(getEncounterZone(d)).toBeNull();
        expect(getEncounterStartMs(d)).toBeNull();
        expect(getEncounterTeamMap(d)).toBeNull();
    });
});

describe('nativeEncounter sentinels', () => {
    it('does not turn the unknown team into a colour slot', () => {
        // team_id 0 / colour 'unknown' is present in EVERY fixture. A reader
        // that trusted presence would emit a fourth, phantom team column.
        const map = getEncounterTeamMap(details({ teams: [{ team_id: 0, color: 'unknown' }] }));
        expect(map).toEqual({ red: 0, green: 0, blue: 0 });
    });

    it('distinguishes duration 0 from an absent duration', () => {
        // A real 0-ms encounter is degenerate but parseable; `|| null` would
        // erase the difference between it and "the field was never emitted".
        expect(getEncounterDurationMs(details({ duration_ms: 0 }))).toBe(0);
        expect(getEncounterDurationMs(details({}))).toBeNull();
    });

    it('returns null for start when started_at_unix is absent, never 0/epoch', () => {
        expect(getEncounterStartMs(details({ duration_ms: 100 }))).toBeNull();
        expect(getEncounterEndMs(details({ duration_ms: 100 }))).toBeNull();
    });

    it('rejects an empty or non-string map rather than returning ""', () => {
        expect(getEncounterZone(details({ map: '' }))).toBeNull();
        expect(getEncounterZone(details({ map: '  ' }))).toBeNull();
        expect(getEncounterZone(details({ map: 42 }))).toBeNull();
    });
});
