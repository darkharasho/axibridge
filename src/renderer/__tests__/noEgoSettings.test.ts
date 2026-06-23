import { describe, it, expect } from 'vitest';
import { DEFAULT_STATS_VIEW_SETTINGS } from '../global.d';

describe('noEgoMode setting', () => {
  it('defaults to false', () => {
    expect(DEFAULT_STATS_VIEW_SETTINGS.noEgoMode).toBe(false);
  });
});
