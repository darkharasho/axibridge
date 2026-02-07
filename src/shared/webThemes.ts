export type WebTheme = {
    id: string;
    label: string;
    rgb: string;
    pattern: string;
};

export const DEFAULT_WEB_THEME_ID = 'Arcane';
export const CRT_WEB_THEME_ID = 'CRT';
export const MATTE_WEB_THEME_ID = 'MatteSlate';
export const DEFAULT_WEB_THEME: WebTheme = {
    id: DEFAULT_WEB_THEME_ID,
    label: 'Arcane',
    rgb: '136, 116, 255',
    pattern: 'radial-gradient(at 0% 0%, hsla(250, 70%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(220, 80%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(270, 65%, 20%, 1) 0, transparent 70%)'
};

export const MATTE_WEB_THEME: WebTheme = {
    id: MATTE_WEB_THEME_ID,
    label: 'Matte Slate',
    rgb: '77, 139, 168',
    pattern: 'radial-gradient(at 20% 0%, hsla(200, 10%, 16%, 1) 0, transparent 65%), radial-gradient(at 85% 15%, hsla(210, 12%, 18%, 1) 0, transparent 60%), radial-gradient(at 50% 100%, hsla(210, 8%, 12%, 1) 0, transparent 70%)'
};

export const BASE_WEB_THEMES: WebTheme[] = [
    DEFAULT_WEB_THEME,
    {
        id: 'Amethyst',
        label: 'Amethyst',
        rgb: '192, 132, 252',
        pattern: 'radial-gradient(at 0% 0%, hsla(270, 70%, 20%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(260, 80%, 25%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(280, 60%, 30%, 1) 0, transparent 70%)'
    },
    {
        id: 'Aurora',
        label: 'Aurora',
        rgb: '34, 211, 238',
        pattern: 'radial-gradient(at 0% 0%, hsla(160, 80%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(280, 75%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(200, 85%, 15%, 1) 0, transparent 70%)'
    },
    {
        id: 'Autumn',
        label: 'Autumn',
        rgb: '180, 130, 70',
        pattern: 'radial-gradient(at 0% 0%, hsla(30, 65%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(0, 70%, 20%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(50, 60%, 15%, 1) 0, transparent 70%)'
    },
    {
        id: 'Berry',
        label: 'Berry',
        rgb: '244, 114, 182',
        pattern: 'radial-gradient(at 0% 0%, hsla(330, 70%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(300, 80%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(340, 60%, 25%, 1) 0, transparent 70%)'
    },
    {
        id: 'Bubblegum',
        label: 'Bubblegum',
        rgb: '244, 114, 182',
        pattern: 'radial-gradient(at 0% 0%, hsla(330, 80%, 22%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(200, 85%, 25%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(280, 75%, 20%, 1) 0, transparent 70%)'
    },
    {
        id: 'Cherry',
        label: 'Cherry',
        rgb: '248, 113, 113',
        pattern: 'radial-gradient(at 0% 0%, hsla(350, 70%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(340, 80%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(0, 60%, 25%, 1) 0, transparent 70%)'
    },
    {
        id: 'Cobalt',
        label: 'Cobalt',
        rgb: '59, 130, 246',
        pattern: 'radial-gradient(at 0% 0%, hsla(220, 85%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(280, 70%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(200, 80%, 15%, 1) 0, transparent 70%)'
    },
    {
        id: 'Coffee',
        label: 'Coffee',
        rgb: '253, 186, 116',
        pattern: 'radial-gradient(at 0% 0%, hsla(25, 60%, 15%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(35, 70%, 18%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(30, 50%, 22%, 1) 0, transparent 70%)'
    },
    {
        id: 'Cyberpunk',
        label: 'Cyberpunk',
        rgb: '232, 121, 249',
        pattern: 'radial-gradient(at 0% 0%, hsla(290, 80%, 20%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(180, 90%, 20%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(320, 70%, 25%, 1) 0, transparent 70%)'
    },
    {
        id: 'Dark Pearl',
        label: 'Dark Pearl',
        rgb: '148, 163, 184',
        pattern: 'radial-gradient(at 0% 0%, hsla(220, 30%, 15%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(240, 40%, 20%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(200, 30%, 25%, 1) 0, transparent 70%)'
    },
    {
        id: 'Deep Space',
        label: 'Deep Space',
        rgb: '99, 102, 241',
        pattern: 'radial-gradient(at 0% 0%, hsla(245, 75%, 15%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(180, 80%, 20%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(300, 70%, 18%, 1) 0, transparent 70%)'
    },
    {
        id: 'Electric Storm',
        label: 'Electric Storm',
        rgb: '56, 189, 248',
        pattern: 'radial-gradient(at 0% 0%, hsla(200, 90%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(270, 85%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(180, 80%, 20%, 1) 0, transparent 70%)'
    },
    {
        id: 'Emerald',
        label: 'Emerald',
        rgb: '52, 211, 153',
        pattern: 'radial-gradient(at 0% 0%, hsla(150, 80%, 15%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(140, 90%, 20%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(160, 70%, 25%, 1) 0, transparent 70%)'
    },
    {
        id: 'Forest',
        label: 'Forest',
        rgb: '74, 222, 128',
        pattern: 'radial-gradient(at 0% 0%, hsla(150, 70%, 12%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(120, 60%, 15%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(160, 80%, 18%, 1) 0, transparent 70%)'
    },
    {
        id: 'Glacier',
        label: 'Glacier',
        rgb: '125, 211, 252',
        pattern: 'radial-gradient(at 0% 0%, hsla(190, 70%, 20%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(210, 80%, 25%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(200, 60%, 30%, 1) 0, transparent 70%)'
    },
    {
        id: 'Gold',
        label: 'Gold',
        rgb: '250, 204, 21',
        pattern: 'radial-gradient(at 0% 0%, hsla(45, 80%, 15%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(40, 90%, 20%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(50, 70%, 25%, 1) 0, transparent 70%)'
    },
    {
        id: 'Jungle',
        label: 'Jungle',
        rgb: '74, 222, 128',
        pattern: 'radial-gradient(at 0% 0%, hsla(145, 75%, 15%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(45, 80%, 20%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(175, 70%, 18%, 1) 0, transparent 70%)'
    },
    {
        id: 'Lavender',
        label: 'Lavender',
        rgb: '167, 139, 250',
        pattern: 'radial-gradient(at 0% 0%, hsla(250, 60%, 20%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(270, 70%, 25%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(290, 50%, 30%, 1) 0, transparent 70%)'
    },
    {
        id: 'Mermaid',
        label: 'Mermaid',
        rgb: '45, 212, 191',
        pattern: 'radial-gradient(at 0% 0%, hsla(175, 75%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(280, 70%, 25%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(200, 80%, 20%, 1) 0, transparent 70%)'
    },
    {
        id: 'Midnight',
        label: 'Midnight',
        rgb: '192, 132, 252',
        pattern: 'radial-gradient(at 0% 0%, hsla(260, 60%, 15%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(320, 70%, 18%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(220, 60%, 20%, 1) 0, transparent 70%)'
    },
    {
        id: 'Mint',
        label: 'Mint',
        rgb: '110, 231, 183',
        pattern: 'radial-gradient(at 0% 0%, hsla(160, 60%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(140, 70%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(170, 50%, 25%, 1) 0, transparent 70%)'
    },
    {
        id: 'Nebula',
        label: 'Nebula',
        rgb: '196, 181, 253',
        pattern: 'radial-gradient(at 0% 0%, hsla(260, 70%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(310, 80%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(240, 60%, 25%, 1) 0, transparent 70%)'
    },
    {
        id: 'Neon Nights',
        label: 'Neon Nights',
        rgb: '236, 72, 153',
        pattern: 'radial-gradient(at 0% 0%, hsla(330, 85%, 20%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(200, 95%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(280, 80%, 18%, 1) 0, transparent 70%)'
    },
    {
        id: 'Obsidian',
        label: 'Obsidian',
        rgb: '226, 232, 240',
        pattern: 'radial-gradient(at 0% 0%, hsla(0, 0%, 5%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(0, 0%, 10%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(210, 20%, 15%, 1) 0, transparent 70%)'
    },
    {
        id: 'Ocean',
        label: 'Ocean',
        rgb: '34, 211, 238',
        pattern: 'radial-gradient(at 0% 0%, hsla(210, 70%, 15%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(190, 80%, 18%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(200, 60%, 22%, 1) 0, transparent 70%)'
    },
    {
        id: 'Royal',
        label: 'Royal',
        rgb: '250, 204, 21',
        pattern: 'radial-gradient(at 0% 0%, hsla(45, 80%, 15%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(240, 70%, 25%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(270, 60%, 30%, 1) 0, transparent 70%)'
    },
    {
        id: 'Ruby',
        label: 'Ruby',
        rgb: '248, 113, 113',
        pattern: 'radial-gradient(at 0% 0%, hsla(350, 80%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(0, 90%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(340, 70%, 25%, 1) 0, transparent 70%)'
    },
    {
        id: 'Sapphire',
        label: 'Sapphire',
        rgb: '96, 165, 250',
        pattern: 'radial-gradient(at 0% 0%, hsla(220, 80%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(230, 90%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(210, 70%, 25%, 1) 0, transparent 70%)'
    },
    {
        id: 'Shadow',
        label: 'Shadow',
        rgb: '148, 163, 184',
        pattern: 'radial-gradient(at 0% 0%, hsla(220, 20%, 10%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(0, 0%, 15%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(240, 10%, 20%, 1) 0, transparent 70%)'
    },
    {
        id: 'Slate',
        label: 'Slate',
        rgb: '148, 163, 184',
        pattern: 'radial-gradient(at 0% 0%, hsla(210, 30%, 20%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(200, 40%, 25%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(220, 30%, 30%, 1) 0, transparent 70%)'
    },
    {
        id: 'Sunrise',
        label: 'Sunrise',
        rgb: '251, 113, 133',
        pattern: 'radial-gradient(at 0% 0%, hsla(350, 75%, 20%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(45, 85%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(320, 70%, 18%, 1) 0, transparent 70%)'
    },
    {
        id: 'Sunset',
        label: 'Sunset',
        rgb: '251, 146, 60',
        pattern: 'radial-gradient(at 0% 0%, hsla(10, 70%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(330, 60%, 20%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(280, 50%, 25%, 1) 0, transparent 70%)'
    },
    {
        id: 'Toxic',
        label: 'Toxic',
        rgb: '163, 230, 53',
        pattern: 'radial-gradient(at 0% 0%, hsla(100, 90%, 12%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(90, 90%, 15%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(120, 80%, 18%, 1) 0, transparent 70%)'
    },
    {
        id: 'Tropics',
        label: 'Tropics',
        rgb: '20, 184, 166',
        pattern: 'radial-gradient(at 0% 0%, hsla(170, 80%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(15, 85%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(45, 75%, 20%, 1) 0, transparent 70%)'
    },
    {
        id: 'Ultraviolet',
        label: 'Ultraviolet',
        rgb: '139, 92, 246',
        pattern: 'radial-gradient(at 0% 0%, hsla(265, 85%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(190, 90%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(320, 80%, 20%, 1) 0, transparent 70%)'
    },
    {
        id: 'Vaporwave',
        label: 'Vaporwave',
        rgb: '244, 114, 182',
        pattern: 'radial-gradient(at 0% 0%, hsla(280, 80%, 25%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(170, 90%, 25%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(320, 70%, 30%, 1) 0, transparent 70%)'
    },
    {
        id: 'Volcano',
        label: 'Volcano',
        rgb: '239, 68, 68',
        pattern: 'radial-gradient(at 0% 0%, hsla(0, 85%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(25, 90%, 22%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(350, 75%, 15%, 1) 0, transparent 70%)'
    },
    {
        id: 'Wildfire',
        label: 'Wildfire',
        rgb: '251, 146, 60',
        pattern: 'radial-gradient(at 0% 0%, hsla(25, 90%, 18%, 1) 0, transparent 70%), radial-gradient(at 100% 0%, hsla(0, 85%, 20%, 1) 0, transparent 70%), radial-gradient(at 50% 100%, hsla(45, 80%, 15%, 1) 0, transparent 70%)'
    }
];

export const CRT_WEB_THEME: WebTheme = {
    id: CRT_WEB_THEME_ID,
    label: 'CRT Hacker',
    rgb: '87, 255, 154',
    pattern: 'radial-gradient(circle at 12% 10%, rgba(44, 120, 78, 0.42), transparent 60%), radial-gradient(circle at 88% 22%, rgba(22, 86, 52, 0.38), transparent 62%), linear-gradient(180deg, rgba(5, 12, 8, 0.92), rgba(3, 7, 6, 0.98))'
};

export const WEB_THEMES: WebTheme[] = [...BASE_WEB_THEMES, CRT_WEB_THEME, MATTE_WEB_THEME];
