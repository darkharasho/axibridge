// src/renderer/stats/__tests__/topStatsCatalog.test.ts
import { describe, it, expect } from 'vitest';
import {
  TOP_STATS_CATALOG,
  DEFAULT_ENABLED_TOP_STATS,
  normalizeEnabledTopStats,
} from '../topStatsCatalog';

describe('topStatsCatalog', () => {
  it('has 27 entries across 5 categories', () => {
    expect(TOP_STATS_CATALOG).toHaveLength(27);
    const cats = new Set(TOP_STATS_CATALOG.map((d) => d.category));
    expect([...cats].sort()).toEqual(['boon', 'control', 'defense', 'offense', 'utility']);
  });

  it('default enabled set equals the legacy 9 cards', () => {
    expect(DEFAULT_ENABLED_TOP_STATS).toEqual([
      'downContrib', 'healing', 'barrier', 'cleanses', 'strips',
      'stability', 'cc', 'dodges', 'closestToTag',
    ]);
  });

  it('every default id exists in the catalog and is marked defaultOn', () => {
    for (const id of DEFAULT_ENABLED_TOP_STATS) {
      const def = TOP_STATS_CATALOG.find((d) => d.id === id);
      expect(def, id).toBeTruthy();
      expect(def!.defaultOn).toBe(true);
    }
  });

  it('all ids are unique', () => {
    const ids = TOP_STATS_CATALOG.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('normalizeEnabledTopStats falls back to defaults for undefined/non-array', () => {
    expect(normalizeEnabledTopStats(undefined)).toEqual(DEFAULT_ENABLED_TOP_STATS);
    expect(normalizeEnabledTopStats('nope' as unknown)).toEqual(DEFAULT_ENABLED_TOP_STATS);
  });

  it('normalizeEnabledTopStats filters unknown ids but keeps empty selection', () => {
    expect(normalizeEnabledTopStats(['healing', 'bogus', 'boon:might'])).toEqual(['healing', 'boon:might']);
    expect(normalizeEnabledTopStats([])).toEqual([]);
  });
});
