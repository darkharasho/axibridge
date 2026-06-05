import { describe, it, expect } from 'vitest';
import {
  getWvwTeamColor,
  teamMapFromLog,
  WVW_TEAM_COLOR_META,
  WVW_TEAM_COLOR_ORDER,
  type WvwTeamColor,
} from '../wvwTeams';

describe('getWvwTeamColor — fixed fallback table (no map)', () => {
  it('resolves the real fixture ids', () => {
    expect(getWvwTeamColor(707)).toBe('red');
    expect(getWvwTeamColor(433)).toBe('blue');
    expect(getWvwTeamColor(2767)).toBe('green');
  });

  it('resolves one more id per color', () => {
    expect(getWvwTeamColor(705)).toBe('red');
    expect(getWvwTeamColor(1277)).toBe('blue');
    expect(getWvwTeamColor(2739)).toBe('green');
  });

  it('returns unknown for unrecognised / invalid ids', () => {
    expect(getWvwTeamColor(999999)).toBe('unknown');
    expect(getWvwTeamColor(0)).toBe('unknown');
    expect(getWvwTeamColor(-5)).toBe('unknown');
    expect(getWvwTeamColor(null)).toBe('unknown');
    expect(getWvwTeamColor(undefined)).toBe('unknown');
  });
});

describe('getWvwTeamColor — authoritative map', () => {
  const map = { red: 1234, green: 5678, blue: 9012 };

  it('uses the map when the id matches', () => {
    expect(getWvwTeamColor(1234, map)).toBe('red');
    expect(getWvwTeamColor(5678, map)).toBe('green');
    expect(getWvwTeamColor(9012, map)).toBe('blue');
  });

  it('a 0 map field never matches', () => {
    expect(getWvwTeamColor(0, { red: 0, green: 0, blue: 0 })).toBe('unknown');
  });

  it('the map beats the fixed table', () => {
    // 707 is "red" in the fixed table, but green in this log's map.
    expect(getWvwTeamColor(707, { red: 1, green: 707, blue: 2 })).toBe('green');
  });

  it('falls back to the table for ids absent from the map', () => {
    expect(getWvwTeamColor(433, map)).toBe('blue');
  });
});

describe('teamMapFromLog', () => {
  it('reads wvWMapData', () => {
    const log = { wvWMapData: { redTeamID: 11, greenTeamID: 22, blueTeamID: 33 } };
    expect(teamMapFromLog(log)).toEqual({ red: 11, green: 22, blue: 33 });
  });

  it('reads the wvwMapData casing variant', () => {
    const log = { wvwMapData: { redTeamID: 1, greenTeamID: 2, blueTeamID: 3 } };
    expect(teamMapFromLog(log)).toEqual({ red: 1, green: 2, blue: 3 });
  });

  it('returns null when absent', () => {
    expect(teamMapFromLog({})).toBeNull();
    expect(teamMapFromLog(null)).toBeNull();
    expect(teamMapFromLog(undefined)).toBeNull();
  });
});

describe('metadata tables', () => {
  it('has meta for every color', () => {
    const colors: WvwTeamColor[] = ['red', 'green', 'blue', 'unknown'];
    for (const c of colors) {
      expect(WVW_TEAM_COLOR_META[c].label).toBeTruthy();
      expect(WVW_TEAM_COLOR_META[c].hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('orders red, green, blue, unknown', () => {
    expect(WVW_TEAM_COLOR_ORDER).toEqual(['red', 'green', 'blue', 'unknown']);
  });
});
