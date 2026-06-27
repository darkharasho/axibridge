import { describe, expect, it } from 'vitest';
import {
  buildAttendanceRaid, updateAttendanceForPublish, parseAttendanceFile, ATTENDANCE_VERSION
} from '../attendance';

const report = (id: string, accounts: string[]) => ({
  meta: { id, dateStart: `2026-02-0${id}T01:00:00Z`, dateEnd: `2026-02-0${id}T04:00:00Z` },
  stats: {
    attendanceData: accounts.map((a, i) => ({
      account: a, characterNames: [a], combatTimeMs: 1000 * (i + 1), squadTimeMs: 5000 * (i + 1)
    }))
  }
});

describe('buildAttendanceRaid', () => {
  it('projects id + dateStart + de-duped attendees with engagement times', () => {
    const raid = buildAttendanceRaid(report('1', ['A.1', 'B.2', 'A.1']));
    expect(raid).toEqual({
      id: '1', date: '2026-02-01T01:00:00Z',
      attendees: [
        { account: 'A.1', combatTimeMs: 1000, squadTimeMs: 5000 },
        { account: 'B.2', combatTimeMs: 2000, squadTimeMs: 10000 }
      ]
    });
  });
  it('returns null when there is no id or no attendees', () => {
    expect(buildAttendanceRaid({ meta: {}, stats: { attendanceData: [] } })).toBeNull();
    expect(buildAttendanceRaid({ meta: { id: 'x' }, stats: {} })).toBeNull();
  });
});

describe('updateAttendanceForPublish', () => {
  it('merges current by id, prunes to validIds, sorts date desc', () => {
    const existing = [
      buildAttendanceRaid(report('1', ['A.1']))!,
      buildAttendanceRaid(report('2', ['B.2']))!
    ];
    const file = updateAttendanceForPublish({
      existingRaids: existing,
      currentReport: report('3', ['C.3']),
      validIds: ['2', '3'], // '1' deleted
      generatedAt: '2026-02-09T00:00:00Z'
    });
    expect(file.version).toBe(ATTENDANCE_VERSION);
    expect(file.generatedAt).toBe('2026-02-09T00:00:00Z');
    expect(file.raids.map((r) => r.id)).toEqual(['3', '2']); // desc by date, '1' pruned
  });
  it('replaces an existing raid with the same id', () => {
    const existing = [buildAttendanceRaid(report('1', ['A.1']))!];
    const file = updateAttendanceForPublish({
      existingRaids: existing,
      currentReport: report('1', ['A.1', 'B.2']),
      validIds: ['1'],
      generatedAt: 'now'
    });
    expect(file.raids).toHaveLength(1);
    expect(file.raids[0].attendees).toHaveLength(2);
  });
  it('backfills valid raids missing from history via loadLocalReport (first-publish full history)', () => {
    const localById: Record<string, ReturnType<typeof report>> = {
      '1': report('1', ['A.1']),
      '2': report('2', ['B.2'])
    };
    const file = updateAttendanceForPublish({
      existingRaids: [], // attendance.json didn't exist yet
      currentReport: report('3', ['C.3']),
      validIds: ['1', '2', '3'],
      generatedAt: 'now',
      loadLocalReport: (id) => localById[id] ?? null
    });
    // current ('3') + backfilled '1' and '2', sorted date desc
    expect(file.raids.map((r) => r.id)).toEqual(['3', '2', '1']);
  });
  it('does not call loadLocalReport for ids already present, and skips ids with no local copy', () => {
    const file = updateAttendanceForPublish({
      existingRaids: [buildAttendanceRaid(report('1', ['A.1']))!],
      currentReport: report('2', ['B.2']),
      validIds: ['1', '2', '9'], // '9' has no local copy
      generatedAt: 'now',
      loadLocalReport: (id) => (id === '9' ? null : report(id, ['Z.9']))
    });
    expect(file.raids.map((r) => r.id)).toEqual(['2', '1']) // '9' skipped (no local), '1' kept from existing
    // '1' kept its original single attendee (loadLocalReport NOT consulted for present ids)
    expect(file.raids.find((r) => r.id === '1')!.attendees.map((a) => a.account)).toEqual(['A.1'])
  });
});

describe('parseAttendanceFile', () => {
  it('accepts a valid file and rejects bad shape/version', () => {
    const good = { version: 1, generatedAt: 'x', raids: [] };
    expect(parseAttendanceFile(good)).toBe(good);
    expect(parseAttendanceFile({ version: 2, generatedAt: 'x', raids: [] })).toBeNull();
    expect(parseAttendanceFile({ version: 1, raids: 'nope' })).toBeNull();
    expect(parseAttendanceFile(null)).toBeNull();
  });
});
