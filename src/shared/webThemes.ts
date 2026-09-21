export type ColorPalette = 'electric-blue' | 'refined-cyan' | 'amber-warm' | 'emerald-mint' | 'rose-pink' | 'violet-purple' | 'crimson-red' | 'slate-silver' | 'teal-ocean' | 'gold-bronze' | 'axi-gold';

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
    'rose-pink': {
        id: 'rose-pink',
        label: 'Rose Pink',
        primary: '#f43f5e',
        secondary: '#ec4899',
        gradient: 'linear-gradient(135deg, #f43f5e, #ec4899)',
        accentBg: 'rgba(244, 63, 94, 0.10)',
        accentBgStrong: 'rgba(244, 63, 94, 0.18)',
        accentBorder: 'rgba(244, 63, 94, 0.35)',
    },
    'violet-purple': {
        id: 'violet-purple',
        label: 'Violet Purple',
        primary: '#8b5cf6',
        secondary: '#a855f7',
        gradient: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
        accentBg: 'rgba(139, 92, 246, 0.10)',
        accentBgStrong: 'rgba(139, 92, 246, 0.18)',
        accentBorder: 'rgba(139, 92, 246, 0.35)',
    },
    'crimson-red': {
        id: 'crimson-red',
        label: 'Crimson Red',
        primary: '#ef4444',
        secondary: '#f97316',
        gradient: 'linear-gradient(135deg, #ef4444, #f97316)',
        accentBg: 'rgba(239, 68, 68, 0.10)',
        accentBgStrong: 'rgba(239, 68, 68, 0.18)',
        accentBorder: 'rgba(239, 68, 68, 0.35)',
    },
    'slate-silver': {
        id: 'slate-silver',
        label: 'Slate Silver',
        primary: '#94a3b8',
        secondary: '#64748b',
        gradient: 'linear-gradient(135deg, #94a3b8, #64748b)',
        accentBg: 'rgba(148, 163, 184, 0.10)',
        accentBgStrong: 'rgba(148, 163, 184, 0.18)',
        accentBorder: 'rgba(148, 163, 184, 0.35)',
    },
    'teal-ocean': {
        id: 'teal-ocean',
        label: 'Teal Ocean',
        primary: '#14b8a6',
        secondary: '#0891b2',
        gradient: 'linear-gradient(135deg, #14b8a6, #0891b2)',
        accentBg: 'rgba(20, 184, 166, 0.10)',
        accentBgStrong: 'rgba(20, 184, 166, 0.18)',
        accentBorder: 'rgba(20, 184, 166, 0.35)',
    },
    'axi-gold': {
        id: 'axi-gold',
        label: 'Axi Gold',
        primary: '#ffc53d',
        secondary: '#ffa41b',
        gradient: 'linear-gradient(135deg, #ffc53d, #ffa41b)',
        accentBg: 'rgba(255, 197, 61, 0.10)',
        accentBgStrong: 'rgba(255, 197, 61, 0.18)',
        accentBorder: 'rgba(255, 197, 61, 0.35)',
    },
    'gold-bronze': {
        id: 'gold-bronze',
        label: 'Gold Bronze',
        primary: '#d4a017',
        secondary: '#b8860b',
        gradient: 'linear-gradient(135deg, #d4a017, #b8860b)',
        accentBg: 'rgba(212, 160, 23, 0.10)',
        accentBgStrong: 'rgba(212, 160, 23, 0.18)',
        accentBorder: 'rgba(212, 160, 23, 0.35)',
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
