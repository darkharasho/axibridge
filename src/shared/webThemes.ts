export type ColorPalette = 'electric-blue' | 'refined-cyan' | 'amber-warm' | 'emerald-mint';

export interface PaletteDefinition {
    id: ColorPalette;
    label: string;
    primary: string;
    secondary: string;
    gradient: string;
    accentBg: string;
    accentBgStrong: string;
    accentBorder: string;
}

export const PALETTES: Record<ColorPalette, PaletteDefinition> = {
    'electric-blue': {
        id: 'electric-blue',
        label: 'Electric Blue',
        primary: '#3b82f6',
        secondary: '#6366f1',
        gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)',
        accentBg: 'rgba(59, 130, 246, 0.10)',
        accentBgStrong: 'rgba(59, 130, 246, 0.18)',
        accentBorder: 'rgba(59, 130, 246, 0.35)',
    },
    'refined-cyan': {
        id: 'refined-cyan',
        label: 'Refined Cyan',
        primary: '#5eadd5',
        secondary: '#7b9fdb',
        gradient: 'linear-gradient(135deg, #5eadd5, #7b9fdb)',
        accentBg: 'rgba(94, 173, 213, 0.10)',
        accentBgStrong: 'rgba(94, 173, 213, 0.18)',
        accentBorder: 'rgba(94, 173, 213, 0.35)',
    },
    'amber-warm': {
        id: 'amber-warm',
        label: 'Amber Warm',
        primary: '#f59e0b',
        secondary: '#e67e22',
        gradient: 'linear-gradient(135deg, #f59e0b, #e67e22)',
        accentBg: 'rgba(245, 158, 11, 0.10)',
        accentBgStrong: 'rgba(245, 158, 11, 0.18)',
        accentBorder: 'rgba(245, 158, 11, 0.35)',
    },
    'emerald-mint': {
        id: 'emerald-mint',
        label: 'Emerald Mint',
        primary: '#34d399',
        secondary: '#2dd4bf',
        gradient: 'linear-gradient(135deg, #34d399, #2dd4bf)',
        accentBg: 'rgba(52, 211, 153, 0.10)',
        accentBgStrong: 'rgba(52, 211, 153, 0.18)',
        accentBorder: 'rgba(52, 211, 153, 0.35)',
    },
};

export const DEFAULT_PALETTE_ID: ColorPalette = 'electric-blue';

/** Maps old UiTheme values to new palettes for settings migration */
export const LEGACY_THEME_TO_PALETTE: Record<string, { palette: ColorPalette; glass: boolean }> = {
    classic: { palette: 'electric-blue', glass: false },
    modern: { palette: 'electric-blue', glass: false },
    matte: { palette: 'refined-cyan', glass: false },
    crt: { palette: 'emerald-mint', glass: false },
    kinetic: { palette: 'amber-warm', glass: false },
    'dark-glass': { palette: 'electric-blue', glass: true },
};
