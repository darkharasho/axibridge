export const PROFESSION_COLORS: Record<string, string> = {
    'Guardian': '#72C1D9',
    'Dragonhunter': '#72C1D9',
    'Firebrand': '#72C1D9',
    'Willbender': '#72C1D9',

    'Revenant': '#D16E5A',
    'Herald': '#D16E5A',
    'Renegade': '#D16E5A',
    'Vindicator': '#D16E5A',

    'Warrior': '#FFD166',
    'Berserker': '#FFD166',
    'Spellbreaker': '#FFD166',
    'Bladesworn': '#FFD166',

    'Engineer': '#D09C59',
    'Scrapper': '#D09C59',
    'Holosmith': '#D09C59',
    'Mechanist': '#D09C59',

    'Ranger': '#8CDC82',
    'Druid': '#8CDC82',
    'Soulbeast': '#8CDC82',
    'Untamed': '#8CDC82',

    'Thief': '#C08F95',
    'Daredevil': '#C08F95',
    'Deadeye': '#C08F95',
    'Specter': '#C08F95',

    'Elementalist': '#F68A87',
    'Tempest': '#F68A87',
    'Weaver': '#F68A87',
    'Catalyst': '#F68A87',

    'Mesmer': '#B679D5',
    'Chronomancer': '#B679D5',
    'Mirage': '#B679D5',
    'Virtuoso': '#B679D5',

    'Necromancer': '#52A76F',
    'Reaper': '#52A76F',
    'Scourge': '#52A76F',
    'Harbinger': '#52A76F',
    'Ritualist': '#52A76F',

    'Luminary': '#72C1D9',
    'Conduit': '#D16E5A',
    'Paragon': '#FFD166',
    'Amalgam': '#D09C59',
    'Galeshot': '#8CDC82',
    'Antiquary': '#C08F95',
    'Evoker': '#F68A87',
    'Troubadour': '#B679D5',

    'Unknown': '#64748B'
};

const PROFESSION_BASE: Record<string, string> = {
    Guardian: 'Guardian',
    Dragonhunter: 'Guardian',
    Firebrand: 'Guardian',
    Willbender: 'Guardian',
    Revenant: 'Revenant',
    Herald: 'Revenant',
    Renegade: 'Revenant',
    Vindicator: 'Revenant',
    Warrior: 'Warrior',
    Berserker: 'Warrior',
    Spellbreaker: 'Warrior',
    Bladesworn: 'Warrior',
    Engineer: 'Engineer',
    Scrapper: 'Engineer',
    Holosmith: 'Engineer',
    Mechanist: 'Engineer',
    Ranger: 'Ranger',
    Druid: 'Ranger',
    Soulbeast: 'Ranger',
    Untamed: 'Ranger',
    Thief: 'Thief',
    Daredevil: 'Thief',
    Deadeye: 'Thief',
    Specter: 'Thief',
    Elementalist: 'Elementalist',
    Tempest: 'Elementalist',
    Weaver: 'Elementalist',
    Catalyst: 'Elementalist',
    Mesmer: 'Mesmer',
    Chronomancer: 'Mesmer',
    Mirage: 'Mesmer',
    Virtuoso: 'Mesmer',
    Necromancer: 'Necromancer',
    Reaper: 'Necromancer',
    Scourge: 'Necromancer',
    Harbinger: 'Necromancer',
    Ritualist: 'Necromancer',
    Luminary: 'Guardian',
    Conduit: 'Revenant',
    Paragon: 'Warrior',
    Amalgam: 'Engineer',
    Galeshot: 'Ranger',
    Antiquary: 'Thief',
    Evoker: 'Elementalist',
    Troubadour: 'Mesmer',
    Unknown: 'Unknown'
};

const PROFESSION_ABBREVIATIONS: Record<string, string> = {
    Guardian: 'gdn',
    Dragonhunter: 'dh',
    Firebrand: 'fb',
    Willbender: 'wb',
    Revenant: 'rev',
    Herald: 'her',
    Renegade: 'ren',
    Vindicator: 'vin',
    Warrior: 'war',
    Berserker: 'ber',
    Spellbreaker: 'spb',
    Bladesworn: 'bsw',
    Engineer: 'eng',
    Scrapper: 'scr',
    Holosmith: 'hol',
    Mechanist: 'mec',
    Ranger: 'rng',
    Druid: 'dru',
    Soulbeast: 'slb',
    Untamed: 'unt',
    Thief: 'thi',
    Daredevil: 'dar',
    Deadeye: 'dea',
    Specter: 'spe',
    Elementalist: 'ele',
    Tempest: 'tem',
    Weaver: 'wev',
    Catalyst: 'cat',
    Mesmer: 'mes',
    Chronomancer: 'chr',
    Mirage: 'mir',
    Virtuoso: 'vir',
    Necromancer: 'nec',
    Reaper: 'rea',
    Scourge: 'sco',
    Harbinger: 'har',
    Ritualist: 'rit',
    Luminary: 'lum',
    Conduit: 'con',
    Paragon: 'par',
    Amalgam: 'ama',
    Galeshot: 'gal',
    Antiquary: 'ant',
    Evoker: 'evo',
    Troubadour: 'tro',
    Unknown: 'unk'
};

const PROFESSION_EMOJI: Record<string, string> = {
    Guardian: '🔵',
    Revenant: '🔴',
    Warrior: '🟡',
    Engineer: '🟠',
    Ranger: '🟢',
    Thief: '⚫️',
    Elementalist: '🔴',
    Mesmer: '🟣',
    Necromancer: '🟢',
    Unknown: '⚪️'
};

export function getProfessionColor(profession: string): string {
    return PROFESSION_COLORS[profession] || PROFESSION_COLORS['Unknown'];
}

export function getProfessionBase(profession: string): string {
    if (!profession) return 'Unknown';
    return PROFESSION_BASE[profession] || profession;
}

export function getProfessionAbbrev(profession: string): string {
    if (!profession) return PROFESSION_ABBREVIATIONS.Unknown;
    return PROFESSION_ABBREVIATIONS[profession] || profession.slice(0, 3).toLowerCase();
}

export function getProfessionEmoji(profession: string): string {
    const base = getProfessionBase(profession);
    return PROFESSION_EMOJI[base] || PROFESSION_EMOJI.Unknown;
}

export function getProfessionIconPath(profession: string): string | null {
    if (!profession) return null;
    const direct = PROFESSION_COLORS[profession] ? profession : null;
    if (direct && direct !== 'Unknown') {
        return `./img/class-icons/${direct}.png`;
    }
    const base = getProfessionBase(profession);
    if (base && base !== 'Unknown') {
        return `./img/class-icons/${base}.png`;
    }
    return null;
}

const SUPERSCRIPT_MAP: Record<string, string> = {
    a: 'ᵃ',
    b: 'ᵇ',
    c: 'ᶜ',
    d: 'ᵈ',
    e: 'ᵉ',
    f: 'ᶠ',
    g: 'ᵍ',
    h: 'ʰ',
    i: 'ⁱ',
    j: 'ʲ',
    k: 'ᵏ',
    l: 'ˡ',
    m: 'ᵐ',
    n: 'ⁿ',
    o: 'ᵒ',
    p: 'ᵖ',
    q: 'ᑫ',
    r: 'ʳ',
    s: 'ˢ',
    t: 'ᵗ',
    u: 'ᵘ',
    v: 'ᵛ',
    w: 'ʷ',
    x: 'ˣ',
    y: 'ʸ',
    z: 'ᶻ',
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹'
};

export function toSuperscript(value: string): string {
    return value
        .toLowerCase()
        .split('')
        .map((char) => SUPERSCRIPT_MAP[char] || char)
        .join('');
}

export function getProfessionAbbrevSuperscript(profession: string): string {
    return toSuperscript(getProfessionAbbrev(profession));
}
