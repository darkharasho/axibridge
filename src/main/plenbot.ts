/*
MIT License

Copyright (c) 2023 Plenyx

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { Player } from './dpsReportTypes';
import { getPlayerBoonGenerationMs } from '../shared/boonGeneration';

export interface CCMapEntry {
    category: string[];
    skills: { id: number; coefficient: number }[];
}

export const CC_MAPPING: CCMapEntry[] = [
    {
        category: ["Relics"],
        skills: [
            { id: 70491, coefficient: 1 }, // Relic of the wizard's tower
        ]
    },
    {
        category: ["Tempest", "Weaver", "Catalyst", "Elementalist"],
        skills: [
            { id: 51662, coefficient: 1.6 }, // Transmute Lightning & Shocking Aura (4/2.5)
            { id: 5671, coefficient: 1 },
            { id: 5732, coefficient: 1 },
            { id: 40794, coefficient: 1 },
            { id: 62716, coefficient: 1 },
            { id: 5687, coefficient: 1 },
            { id: 5534, coefficient: 1 },
            { id: 35304, coefficient: 1 },
            { id: 5733, coefficient: 1 },
            { id: 5690, coefficient: 1 },
            { id: 5562, coefficient: 1 },
            { id: 46018, coefficient: 1 },
            { id: 62947, coefficient: 1 },
            { id: 30864, coefficient: 1 },
            { id: 5553, coefficient: 1 },
            { id: 5754, coefficient: 1 },
            { id: 30008, coefficient: 1 },
            { id: 5747, coefficient: 1 },
            { id: 5490, coefficient: 1 },
            { id: 5547, coefficient: 1 },
            { id: 44998, coefficient: 1 },
            { id: 42321, coefficient: 1 },
            { id: 5721, coefficient: 1 },
            { id: 71966, coefficient: 1 },
            { id: 46140, coefficient: 1 },
        ]
    },
    {
        category: ["Specter", "Daredevil", "Deadeye", "Thief"],
        skills: [
            { id: 13012, coefficient: 1 },
            { id: 63230, coefficient: 1 },
            { id: 30568, coefficient: 1 },
            { id: 29516, coefficient: 1 },
            { id: 1131, coefficient: 1 },
            { id: 63275, coefficient: 1 },
            { id: 63220, coefficient: 1 },
            { id: 1141, coefficient: 1 },
            { id: 63249, coefficient: 1 },
            { id: 13031, coefficient: 1 },
            { id: 13024, coefficient: 0.25 },
            { id: 56880, coefficient: 1 },
            { id: 30077, coefficient: 1 },
            { id: 46335, coefficient: 2 },
            { id: 13114, coefficient: 1 },
            { id: 50484, coefficient: 1 },
        ]
    },
    {
        category: ["Spellbreaker", "Berserker", "Bladesworn", "Warrior"],
        skills: [
            { id: 14359, coefficient: 1 },
            { id: 14360, coefficient: 1 },
            { id: 14502, coefficient: 1 },
            { id: 14511, coefficient: 1 },
            { id: 14415, coefficient: 1 },
            { id: 14516, coefficient: 1 },
            { id: 29941, coefficient: 1 },
            { id: 14387, coefficient: 1 },
            { id: 14512, coefficient: 1 },
            { id: 14513, coefficient: 1 },
            { id: 14514, coefficient: 1 },
            { id: 40601, coefficient: 1 },
            { id: 14361, coefficient: 1 },
            { id: 14414, coefficient: 1 },
            { id: 14425, coefficient: 1 },
            { id: 14426, coefficient: 1 },
            { id: 14427, coefficient: 1 },
            { id: 30343, coefficient: 1 },
            { id: 44165, coefficient: 1 },
            { id: 41243, coefficient: 1 },
            { id: 44937, coefficient: 1 },
            { id: 14503, coefficient: 1 },
            { id: 14405, coefficient: 1 },
            { id: 62732, coefficient: 1 },
            { id: 14388, coefficient: 1 },
            { id: 14409, coefficient: 1 },
            { id: 41919, coefficient: 1 },
            { id: 72026, coefficient: 1 },
            { id: 29679, coefficient: 1 },
        ]
    },
    {
        category: ["Scrapper", "Holosmith", "Mechanist", "Engineer"],
        skills: [
            { id: 6054, coefficient: 1 },
            { id: 21661, coefficient: 1 },
            { id: 6161, coefficient: 1 },
            { id: 30337, coefficient: 1 },
            { id: 6162, coefficient: 1 },
            { id: 31248, coefficient: 1 },
            { id: 5868, coefficient: 1 },
            { id: 63234, coefficient: 1 },
            { id: 71888, coefficient: 1 },
            { id: 30713, coefficient: 0.166666 },
            { id: 5930, coefficient: 1 },
            { id: 6126, coefficient: 1 },
            { id: 5754, coefficient: 1 },
            { id: 6154, coefficient: 1 },
            { id: 5813, coefficient: 1 },
            { id: 5811, coefficient: 1 },
            { id: 29991, coefficient: 1 },
            { id: 5889, coefficient: 1 },
            { id: 5534, coefficient: 1 },
            { id: 35304, coefficient: 1 },
            { id: 42521, coefficient: 1 },
            { id: 63345, coefficient: 1 },
            { id: 31167, coefficient: 0.25 },
            { id: 6057, coefficient: 1 },
            { id: 63121, coefficient: 1 },
            { id: 5996, coefficient: 1 },
            { id: 41843, coefficient: 1 },
            { id: 5982, coefficient: 1 },
            { id: 5825, coefficient: 1 },
            { id: 30828, coefficient: 1 },
            { id: 5913, coefficient: 1 },
            { id: 5893, coefficient: 1 },
            { id: 63253, coefficient: 1 },
        ]
    },
    {
        category: ["Firebrand", "Dragonhunter", "Willbender", "Guardian"],
        skills: [
            { id: 40624, coefficient: 0.2 },
            { id: 30628, coefficient: 0.25 },
            { id: 45402, coefficient: 1 },
            { id: 42449, coefficient: 1 },
            { id: 9226, coefficient: 1 },
            { id: 33134, coefficient: 1 },
            { id: 41968, coefficient: 1 },
            { id: 9124, coefficient: 1 },
            { id: 29630, coefficient: 1 },
            { id: 9091, coefficient: 1 },
            { id: 13688, coefficient: 1 },
            { id: 9128, coefficient: 1 },
            { id: 9093, coefficient: 1 },
            { id: 9125, coefficient: 1 },
            { id: 46170, coefficient: 1 },
            { id: 30871, coefficient: 0.1111 },
            { id: 30273, coefficient: 1 },
            { id: 62549, coefficient: 1 },
            { id: 62561, coefficient: 1 },
            { id: 71817, coefficient: 1 },
            { id: 71819, coefficient: 1 },
        ]
    },
    {
        category: ["Renegade", "Vindicator", "Herald", "Revenant"],
        skills: [
            { id: 41820, coefficient: 1 },
            { id: 28110, coefficient: 1 },
            { id: 27356, coefficient: 1 },
            { id: 29114, coefficient: 1 },
            { id: 28978, coefficient: 1 },
            { id: 26679, coefficient: 1 },
            { id: 27917, coefficient: 1 },
            { id: 62878, coefficient: 1 },
            { id: 41220, coefficient: 1 },
            { id: 28406, coefficient: 1 },
            { id: 31294, coefficient: 1 },
            { id: 28075, coefficient: 1 },
            { id: 71880, coefficient: 1 },
        ]
    },
    {
        category: ["Druid", "Untamed", "Soulbeast", "Ranger"],
        skills: [
            { id: 31318, coefficient: 1 },
            { id: 63075, coefficient: 1 },
            { id: 12598, coefficient: 1 },
            { id: 31658, coefficient: 1 },
            { id: 45743, coefficient: 1 },
            { id: 67179, coefficient: 1 },
            { id: 12476, coefficient: 1 },
            { id: 63330, coefficient: 1 },
            { id: 42894, coefficient: 1 },
            { id: 46432, coefficient: 1 },
            { id: 42907, coefficient: 1 },
            { id: 12523, coefficient: 1 },
            { id: 31321, coefficient: 1 },
            { id: 41908, coefficient: 1 },
            { id: 12511, coefficient: 1 },
            { id: 30448, coefficient: 1 },
            { id: 12475, coefficient: 2 },
            { id: 12508, coefficient: 1 },
            { id: 12638, coefficient: 1 },
            { id: 29558, coefficient: 1 },
            { id: 12621, coefficient: 1 },
            { id: 71963, coefficient: 1 },
            { id: 71002, coefficient: 1 },
            { id: 44360, coefficient: 1 },
            { id: 43375, coefficient: 1 },
            { id: 71841, coefficient: 1 },
        ]
    },
    {
        category: ["Chronomancer", "Mirage", "Virtuoso", "Mesmer"],
        skills: [
            { id: 10363, coefficient: 1 },
            { id: 56873, coefficient: 1 },
            { id: 30643, coefficient: 1 },
            { id: 10232, coefficient: 1 },
            { id: 72007, coefficient: 1 },
            { id: 30359, coefficient: 1 },
            { id: 10220, coefficient: 1 },
            { id: 62573, coefficient: 1 },
            { id: 10287, coefficient: 1 },
            { id: 45230, coefficient: 1 },
            { id: 62602, coefficient: 1 },
            { id: 10358, coefficient: 1 },
            { id: 10166, coefficient: 1 },
            { id: 10169, coefficient: 0.16666 },
            { id: 13733, coefficient: 0.16666 },
            { id: 10229, coefficient: 0.5 },
            { id: 10341, coefficient: 1 },
            { id: 30192, coefficient: 1 },
            { id: 29856, coefficient: 0.25 },
        ]
    },
    {
        category: ["Reaper", "Scourge", "Harbinger", "Necromancer"],
        skills: [
            { id: 10633, coefficient: 1 },
            { id: 29709, coefficient: 1 },
            { id: 19115, coefficient: 1 },
            { id: 10556, coefficient: 1 },
            { id: 10608, coefficient: 1 },
            { id: 44428, coefficient: 1 },
            { id: 30557, coefficient: 1 },
            { id: 10620, coefficient: 1 },
            { id: 10647, coefficient: 1 },
            { id: 30105, coefficient: 1 },
            { id: 44296, coefficient: 1 },
            { id: 62511, coefficient: 1 },
            { id: 62539, coefficient: 1 },
            { id: 62563, coefficient: 1 },
            { id: 71998, coefficient: 1 },
        ]
    }
];

// Mapping for Incoming Strips - comprehensive list from PlenBot with coefficients
// These track boon strips received from enemies
export const INCOMING_STRIPS_SKILLS: { [id: number]: number } = {
    // 4x multiplier
    63350: 4, // Bladesong Sorrow

    // 3x multiplier
    10555: 3, 10605: 3, 10607: 3, // Mesmer wells/shatter
    10672: 3, 30670: 3, // Null Field variants
    29740: 3, 29867: 3, // Chronomancer wells
    72068: 3, 73047: 3, 73107: 3, // Virtuoso skills
    13906: 3, 45252: 3, // Signet of Humility variants
    10185: 3, // Arcane Thievery

    // 2x multiplier
    10173: 2, 10175: 2, 10186: 2, 10218: 2, // Illusionary Leap, Phantasmal Duelist, Temporal Curtain, Mind Stab
    10529: 2, 10602: 2, 10701: 2, // Mesmer skills
    13007: 2, // Thief skill
    29560: 2, 29666: 2, // Revenant skills
    41205: 2, // Binding Shadow (Thief)
    44004: 2, 45243: 2, // Mirage/Mesmer skills
    51667: 2, 54870: 2, // Various skills
    62514: 2, 63129: 2, 63225: 2, 63258: 2, 63326: 2, 63336: 2, 63438: 2, // Virtuoso/Untamed skills
    69223: 2, 69290: 2, // Additional skills
    71897: 2, 72079: 2, 72843: 2, 72904: 2, 72932: 2, 72946: 2, 73007: 2, // Spear/new skills

    // Special fractional multipliers
    10221: 0.5, 29856: 0.5, // /2 (Mantra of Distraction, Well of Senility)
    69175: 0.333333, // /3

    // 1x multiplier
    10172: 1, 10203: 1, 10267: 1, 10545: 1, 10612: 1, 10671: 1, 10709: 1, // Mesmer basics
    27505: 1, // Banish Enchantment (Revenant)
    29855: 1, // Continuum Split
    40274: 1, 41615: 1, 42355: 1, 42917: 1, 42935: 1, 43123: 1, 43148: 1, // Various
    45333: 1, 51647: 1, 71799: 1, 71871: 1, 100074: 1, // Additional 1x skills
};

// Mapping for Incoming CC - comprehensive list from PlenBot with coefficients
// Skills with coefficient 1.0 are hard CC (stun, knockdown, knockback, pull, launch, daze, fear, taunt, float)
// Skills with other coefficients have partial CC effects or hit multiple times
export const INCOMING_CC_SKILLS: { [id: number]: number } = {
    // Elementalist
    5527: 2.6, 51662: 2.6, // Transmute Lightning & Shocking Aura (hits + hits * 4/2.5)
    5671: 1, 5732: 1, 40794: 1, 62716: 1, // Static Field variants, Earthen Synergy, Shock Blast
    5687: 1, 5534: 1, 35304: 1, 5733: 1, // Updraft, Tornado, Dust Charge, Wind Blast
    5690: 1, 5562: 1, 46018: 1, 62947: 1, // Earthquake, Gale, Mud Slide, Wind Storm
    30864: 1, 5553: 1, 5754: 1, // Tidal Surge, Gust, Debris Tornado
    30008: 1, 5747: 1, // Cyclone, Magnetic Shield
    5490: 1, 5547: 1, 44998: 1, 42321: 1, 71966: 1, 73060: 1, 73092: 1, // Comet, Magnetic Surge, Polaric Leap, Pile Driver, Dazing Discharge, Lesser Derecho, Derecho
    5721: 1, 46140: 1, // Deep Freeze, Katabatic Wind
    73148: 1, 72998: 1, // Undertow, Twister

    // Thief
    13012: 1, 63230: 1, 30568: 1, 29516: 1, 1131: 1, // Head Shot, Well of Silence, Distracting Daggers, Impact Strike, Mace Head Crack
    63275: 1, // Shadowfall
    63220: 1, 1141: 1, // Dawn's Repose, Skull Fear
    63249: 1, 13031: 1, // Mind Shock, Pistol Whip
    13024: 0.25, 71841: 0.25, // Choking Gas, Wild Strikes (/4)
    56880: 1, 30077: 1, // Pitfall, Uppercut
    46335: 2, // Shadow Gust (*2)
    13114: 0.5, 50484: 0.5, // Tactical Strike, Malicious Tactical Strike (/2)

    // Warrior
    14359: 1, 14360: 1, 14502: 1, 73009: 1, // Staggering Blow, Rifle Butt, Kick, Spear Swipe
    14511: 1, 14415: 1, 14516: 1, 29941: 1, // Backbreaker, Tremor, Bull's Charge, Wild Blow
    14387: 1, 14512: 1, 14513: 1, 14514: 1, 40601: 1, // Earthshaker variants
    14361: 1, 14414: 1, 14425: 1, 14426: 1, 14427: 1, 30343: 1, // Shield Bash, Skull Crack variants, Head Butt
    44165: 1, 41243: 1, 44937: 1, 14503: 1, 14405: 1, 62732: 1, // Full Counter variants, Disrupting Stab, Pommel Bash, Banner of Strength, Artillery Slash
    14388: 1, // Stomp
    14409: 1, 41919: 1, // Fear Me, Imminent Threat
    72026: 1, 29679: 1, // Snap Pull, Skull Grinder

    // Engineer
    6054: 1, 21661: 1, 6161: 1, 30337: 1, 6162: 1, 31248: 1, 5868: 1, 63234: 1, 71888: 1, // Static Shield, Static Shock, Throw Mine variants, Detonate, Blast Gyro, Supply Crate, Rocket Fist Prototype, Essence of Borrowed Time
    30713: 0.166666, // Thunderclap (/6)
    5930: 1, 6126: 1, // Air Blast, Magnetic Inversion
    6154: 1, 5813: 1, 5811: 1, 29991: 1, 5889: 1, 42521: 1, 63345: 1, // Overcharged Shot, Big Ol' Bomb, Personal Battering Ram variants, Thump, Holographic Shockwave, Core Reactor Shot
    31167: 0.25, // Spare Capacitor (/4)
    6057: 1, 63121: 1, // Throw Shield, Jade Mortar
    5996: 1, 41843: 1, // Magnet, Prismatic Singularity
    5982: 1, // Launch Personal Battering Ram
    5825: 1, 30828: 1, 5913: 1, // Slick Shoes variants, Explosive Rockets
    5893: 1, 63253: 1, // Electrified Net, Force Signet

    // Guardian
    45402: 1, 42449: 1, 9226: 1, 33134: 1, // Blazing Edge, Chapter 3: Heated Rebuke, Pull (greatsword 5), Hunter's Verdict
    41968: 1, // Chapter 2: Daring Challenge
    9124: 1, // Banish
    9091: 1, 13688: 1, 9128: 1, 71817: 1, // Shield of Absorption, Lesser Shield of Absorption, Sanctuary, Jurisdiction (projectile)
    9093: 1, 9125: 1, 46170: 1, 71989: 1, // Bane Signet, Hammer of Wisdom variants, Jurisdiction (detonation)
    30871: 0.111111, // Light's Judgement (/9)
    29630: 1, 30273: 1, // Deflecting Shot, Dragon's Maw
    62549: 1, 62561: 1, // Heel Crack, Heaven's Palm

    // Revenant
    41820: 1, 28110: 1, 27356: 1, 29114: 1, // Scorchrazor, Drop the Hammer, Energy Expulsion variants
    28978: 1, // Surge of the Mists
    26679: 1, // Forced Engagement
    27917: 1, // Call to Anguish
    72954: 0.2, // Abyssal Blot (*0.2)
    62878: 1, 41220: 1, 41095: 1, // Reaver's Rage, Darkrazor's Daring variants
    28406: 1, 31294: 1, // Jade Winds variants
    28075: 1, 71880: 1, // Chaotic Release, Otherworldly Attraction

    // Ranger
    31318: 1, 63075: 1, 12598: 1, 31658: 1, 45743: 1, 73150: 1, // Lunar Impact, Overbearing Smash, Call Lightning, Glyph of Equality, Charge, Predator's Ambush
    67179: 1, 12476: 1, 71002: 1, // Slam, Spike Trap, Dimension Breach
    63330: 1, 42894: 1, 46432: 1, 42907: 1, // Thump, Brutal Charge variants, Takedown
    12523: 1, 31321: 1, 12511: 1, 30448: 1, 43068: 1, 41908: 1, // Counterattack Kick, Wing Buffet variants, Point-Blank Shot, Glyph of the Tides, Tail Lash
    12475: 2, // Hilt Bash (*2 for daze + stun)
    12508: 1, // Concussion Shot
    12638: 1, 29558: 1, // Path of Scars, Glyph of the Tides (celestial)
    12621: 1, // Call of the Wild
    44360: 1, 43375: 1, // Fear, Prelude Lash
    71963: 1, // Oaken Cudgel

    // Mesmer
    10363: 1, // Into the Void
    56873: 1, // Time Sink
    30643: 1, 10232: 1, 72007: 1, 72957: 1, // Tides of Time, Signet of Domination, Phantasmal Sharpshooter, Mental Collapse
    30359: 1, // Gravity Well
    10220: 1, 62573: 1, // Illusionary Wave, Psychic Force
    10287: 1, 45230: 1, 62602: 1, 10358: 1, 10166: 1, // Diversion, Mirage Thrust, Bladesong Dissonance, Counter Blade, Phantasmal Mage
    10169: 0.166666, 13733: 0.166666, // Chaos Storm variants (/6)
    10229: 0.5, // Magic Bullet (*0.5)
    10341: 1, 30192: 1, // Phantasmal Defender variants
    29856: 0.25, // Well of Senility (/4)

    // Necromancer
    10633: 1, 29709: 1, 19115: 1, 10556: 1, // Ripple of Horror, Terrify, Reaper's Mark, Wail of Doom
    10608: 1, 44428: 1, 40071: 1, 71998: 1, // Spectral Ring, Garish Pillar, Frightening Gaze, Devouring Visage
    30557: 1, 10620: 1, 10647: 1, // Executioner's Scythe, Spectral Grasp, Charge
    30105: 1, 44296: 1, // Chilled to the Bone, Oppressive Collapse
    62511: 1, 62539: 1, 62563: 1, 73013: 1, // Vile Blast, Voracious Arc, Vital Draw, (additional necro skill)
};


export function calculateOutCC(player: Player): number {
    if (!player.totalDamageDist || player.totalDamageDist.length === 0) return 0;

    let total = 0;

    // Flatten the array of arrays (usually one phase for total stats)
    for (const damageDistList of player.totalDamageDist) {
        if (!damageDistList) continue;
        for (const skill of damageDistList) {
            // Find a mapping that matches the player's profession (or Relics) AND contains the skill ID
            const mapEntry = CC_MAPPING.find(m =>
                (m.category.includes(player.profession) || m.category.includes("Relics")) &&
                m.skills.some(s => s.id === skill.id)
            );

            if (mapEntry) {
                const mappedSkill = mapEntry.skills.find(s => s.id === skill.id);
                if (mappedSkill) {
                    total += skill.connectedHits * mappedSkill.coefficient;
                }
            }
        }
    }
    return Math.round(total);
}

// Global pass function
export function calculateAllStability(
    players: Player[],
    context?: { durationMS?: number; buffMap?: Record<string, any> }
) {
    const durationMs = context?.durationMS || 0;
    const buffMap = context?.buffMap || {};
    const squadPlayers = players.filter((p) => !p.notInSquad);
    const squadCount = squadPlayers.length;
    const groupCounts = new Map<number, number>();

    squadPlayers.forEach((player) => {
        const group = player.group ?? 0;
        groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    });

    squadPlayers.forEach((player) => {
        const groupCount = groupCounts.get(player.group ?? 0) || 1;
        const { generationMs } = getPlayerBoonGenerationMs(
            player,
            'squadBuffs',
            1122,
            durationMs,
            groupCount,
            squadCount,
            buffMap,
        );
        player.stabGeneration = generationMs / 1000;
    });
}


export function calculateIncomingStats(player: Player): { strips: { total: number, missed: number, blocked: number }, cc: { total: number, missed: number, blocked: number } } {
    const strips = { total: 0, missed: 0, blocked: 0 };
    const cc = { total: 0, missed: 0, blocked: 0 };

    if (!player.totalDamageTaken || player.totalDamageTaken.length === 0) return { strips, cc };

    for (const damageTakenList of player.totalDamageTaken) {
        if (!damageTakenList) continue;
        for (const hit of damageTakenList) {
            // Strips
            const stripMult = INCOMING_STRIPS_SKILLS[hit.id];
            if (stripMult) {
                strips.total += hit.hits * stripMult;
                strips.missed += hit.missed * stripMult;
                strips.blocked += hit.blocked * stripMult;
            }

            // CC - use coefficient mapping like PlenBot
            const ccMult = INCOMING_CC_SKILLS[hit.id];
            if (ccMult) {
                cc.total += hit.hits * ccMult;
                cc.missed += hit.missed * ccMult;
                cc.blocked += hit.blocked * ccMult;
            }
        }
    }
    strips.total = Math.round(strips.total);
    strips.missed = Math.round(strips.missed);
    strips.blocked = Math.round(strips.blocked);
    cc.total = Math.round(cc.total);
    cc.missed = Math.round(cc.missed);
    cc.blocked = Math.round(cc.blocked);

    return { strips, cc };
}

export function calculateDownContribution(player: Player): number {
    if (!player.statsTargets) return 0;
    let total = 0;
    // PlenBot: x.StatsTargets.Sum(y => y[0].DownContribution)
    // Means iterating over target arrays.
    for (const targetStats of player.statsTargets) {
        if (targetStats && targetStats.length > 0) {
            total += targetStats[0].downContribution || 0;
        }
    }
    return total;
}

export function calculateSquadBarrier(player: Player): number {
    if (!player.extBarrierStats || !player.extBarrierStats.outgoingBarrierAllies) return 0;

    let total = 0;
    // outgoingBarrierAllies is OutgoingBarrier[SquadMembers][Phases]
    for (const squadMember of player.extBarrierStats.outgoingBarrierAllies) {
        if (!squadMember) continue;
        for (const phaseData of squadMember) {
            // phaseData is an object { barrier: number }
            if (phaseData) {
                total += phaseData.barrier || 0;
            }
        }
    }
    return total;
}

export function calculateSquadHealing(player: Player): number {
    if (!player.extHealingStats || !player.extHealingStats.outgoingHealingAllies) return 0;

    let total = 0;
    // outgoingHealingAllies is OutgoingHealing[SquadMembers][Phases]
    for (const squadMember of player.extHealingStats.outgoingHealingAllies) {
        if (!squadMember) continue;
        for (const phaseData of squadMember) {
            // phaseData is an object { healing: number }
            if (phaseData) {
                total += phaseData.healing || 0;
            }
        }
    }
    return total;
}
