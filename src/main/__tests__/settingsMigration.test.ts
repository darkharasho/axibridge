import { describe, it, expect } from 'vitest';
import { LEGACY_THEME_TO_PALETTE } from '../../shared/webThemes';

describe('settings migration', () => {
  it('maps classic to electric-blue', () => {
    expect(LEGACY_THEME_TO_PALETTE['classic']).toEqual({ palette: 'electric-blue', glass: false });
  });

  it('maps dark-glass to electric-blue with glass enabled', () => {
    expect(LEGACY_THEME_TO_PALETTE['dark-glass']).toEqual({ palette: 'electric-blue', glass: true });
  });

  it('maps matte to refined-cyan', () => {
    expect(LEGACY_THEME_TO_PALETTE['matte']).toEqual({ palette: 'refined-cyan', glass: false });
  });

  it('maps kinetic to amber-warm', () => {
    expect(LEGACY_THEME_TO_PALETTE['kinetic']).toEqual({ palette: 'amber-warm', glass: false });
  });

  it('maps crt to emerald-mint', () => {
    expect(LEGACY_THEME_TO_PALETTE['crt']).toEqual({ palette: 'emerald-mint', glass: false });
  });

  it('maps modern to electric-blue', () => {
    expect(LEGACY_THEME_TO_PALETTE['modern']).toEqual({ palette: 'electric-blue', glass: false });
  });

  it('covers all 6 legacy themes', () => {
    const legacyThemes = ['classic', 'modern', 'matte', 'crt', 'kinetic', 'dark-glass'];
    for (const theme of legacyThemes) {
      expect(LEGACY_THEME_TO_PALETTE[theme]).toBeDefined();
    }
  });
});
