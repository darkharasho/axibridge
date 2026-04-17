export enum WvwMap {
    EternalBattlegrounds = 'EternalBattlegrounds',
    GreenBorderlands = 'GreenBorderlands',
    BlueBorderlands = 'BlueBorderlands',
    RedBorderlands = 'RedBorderlands',
}

export interface WvwLandmark {
    name: string;
    x: number;
    y: number;
    type: 'keep' | 'tower' | 'camp' | 'ruins' | 'named';
}

// Coordinates derived from GW2 API v2/wvw/objectives continent coords,
// converted to EI combatReplayData pixel space using continent_rect → pixel mapping.
// Alpine BLs: 523x750, EBG: 716x750.

const BLUE_ALPINE: WvwLandmark[] = [
    { name: 'Ascension Bay', x: 48, y: 435, type: 'keep' },
    { name: 'Askalion Hills', x: 501, y: 419, type: 'keep' },
    { name: 'Garrison', x: 257, y: 325, type: 'keep' },
    { name: 'Redbriar', x: 182, y: 515, type: 'tower' },
    { name: 'Woodhaven', x: 132, y: 251, type: 'tower' },
    { name: 'Greenlake', x: 364, y: 530, type: 'tower' },
    { name: "Dawn's Eyrie", x: 385, y: 241, type: 'tower' },
    { name: 'Spiritholme', x: 262, y: 73, type: 'camp' },
    { name: 'Redvale Refuge', x: 95, y: 540, type: 'camp' },
    { name: 'Godslore', x: 85, y: 276, type: 'camp' },
    { name: 'Stargrove', x: 455, y: 270, type: 'camp' },
    { name: "Champion's Demesne", x: 263, y: 660, type: 'camp' },
    { name: 'Greenwater Lowlands', x: 453, y: 549, type: 'camp' },
    { name: 'Temple of Lost Prayers', x: 259, y: 515, type: 'ruins' },
    { name: 'Orchard Overlook', x: 312, y: 393, type: 'ruins' },
    { name: "Bauer's Estate", x: 217, y: 382, type: 'ruins' },
    { name: "Carver's Ascent", x: 320, y: 468, type: 'ruins' },
    { name: "Battle's Hollow", x: 197, y: 460, type: 'ruins' },
];

const GREEN_ALPINE: WvwLandmark[] = [
    { name: 'Dreadfall Bay', x: 48, y: 435, type: 'keep' },
    { name: 'Shadaran Hills', x: 501, y: 419, type: 'keep' },
    { name: 'Garrison', x: 257, y: 325, type: 'keep' },
    { name: 'Bluebriar', x: 182, y: 515, type: 'tower' },
    { name: 'Sunnyhill', x: 132, y: 251, type: 'tower' },
    { name: 'Redlake', x: 364, y: 530, type: 'tower' },
    { name: 'Cragtop', x: 385, y: 241, type: 'tower' },
    { name: 'Titanpaw', x: 262, y: 73, type: 'camp' },
    { name: 'Bluevale Refuge', x: 95, y: 540, type: 'camp' },
    { name: 'Faithleap', x: 85, y: 276, type: 'camp' },
    { name: 'Foghaven', x: 455, y: 270, type: 'camp' },
    { name: "Hero's Lodge", x: 263, y: 660, type: 'camp' },
    { name: 'Redwater Lowlands', x: 453, y: 549, type: 'camp' },
    { name: 'Temple of the Fallen', x: 259, y: 515, type: 'ruins' },
    { name: "Cohen's Overlook", x: 312, y: 393, type: 'ruins' },
    { name: "Gertzz's Estate", x: 217, y: 382, type: 'ruins' },
    { name: "Patrick's Ascent", x: 320, y: 468, type: 'ruins' },
    { name: "Norfolk's Hollow", x: 197, y: 460, type: 'ruins' },
];

const RED_DESERT: WvwLandmark[] = [
    { name: 'Blistering Undercroft', x: 28, y: 409, type: 'keep' },
    { name: 'Stoic Rampart', x: 370, y: 272, type: 'keep' },
    { name: "Osprey's Palace", x: 700, y: 427, type: 'keep' },
    { name: "O'del Academy", x: 151, y: 134, type: 'tower' },
    { name: 'Eternal Necropolis', x: 590, y: 155, type: 'tower' },
    { name: 'Crankshaft Depot', x: 485, y: 610, type: 'tower' },
    { name: 'Parched Outpost', x: 251, y: 579, type: 'tower' },
    { name: "Hamm's Lab", x: 367, y: 130, type: 'camp' },
    { name: 'Bauer Farmstead', x: 654, y: 569, type: 'camp' },
    { name: "McLain's Encampment", x: 90, y: 576, type: 'camp' },
    { name: "Roy's Refuge", x: 704, y: 259, type: 'camp' },
    { name: "Boettiger's Hideaway", x: 23, y: 256, type: 'camp' },
    { name: 'Dustwhisper Well', x: 376, y: 707, type: 'camp' },
    { name: "Higgins's Ascent", x: 415, y: 547, type: 'ruins' },
    { name: "Bearce's Dwelling", x: 301, y: 440, type: 'ruins' },
    { name: "Zak's Overlook", x: 433, y: 444, type: 'ruins' },
    { name: "Darra's Maze", x: 289, y: 513, type: 'ruins' },
    { name: "Tilly's Encampment", x: 369, y: 365, type: 'ruins' },
];

export const WVW_LANDMARKS: Record<WvwMap, WvwLandmark[]> = {
    [WvwMap.EternalBattlegrounds]: [
        { name: 'Stonemist Castle', x: 370, y: 435, type: 'keep' },
        { name: 'Overlook', x: 400, y: 230, type: 'keep' },
        { name: 'Lowlands', x: 151, y: 569, type: 'keep' },
        { name: 'Valley', x: 592, y: 567, type: 'keep' },
        { name: "Mendon's Gap", x: 290, y: 175, type: 'tower' },
        { name: 'Veloka Slope', x: 470, y: 200, type: 'tower' },
        { name: 'Speldan Clearcut', x: 206, y: 200, type: 'tower' },
        { name: 'Wildcreek Run', x: 221, y: 446, type: 'tower' },
        { name: "Aldon's Ledge", x: 106, y: 487, type: 'tower' },
        { name: 'Klovan Gully', x: 283, y: 557, type: 'tower' },
        { name: "Jerrifer's Slough", x: 198, y: 636, type: 'tower' },
        { name: 'Quentin Lake', x: 441, y: 592, type: 'tower' },
        { name: 'Langor Gulch', x: 581, y: 657, type: 'tower' },
        { name: 'Bravost Escarpment', x: 635, y: 487, type: 'tower' },
        { name: 'Durios Gulch', x: 512, y: 445, type: 'tower' },
        { name: 'Ogrewatch Cut', x: 468, y: 307, type: 'tower' },
        { name: 'Anzalias Pass', x: 287, y: 314, type: 'tower' },
        { name: 'Pangloss Rise', x: 541, y: 229, type: 'camp' },
        { name: 'Danelon Passage', x: 485, y: 673, type: 'camp' },
        { name: 'Golanta Clearing', x: 290, y: 644, type: 'camp' },
        { name: 'Umberglade Woods', x: 595, y: 402, type: 'camp' },
        { name: "Rogue's Quarry", x: 143, y: 397, type: 'camp' },
    ],
    [WvwMap.GreenBorderlands]: GREEN_ALPINE,
    [WvwMap.BlueBorderlands]: BLUE_ALPINE,
    [WvwMap.RedBorderlands]: RED_DESERT,
};

export function findNearestLandmark(map: WvwMap, x: number, y: number): WvwLandmark | null {
    const landmarks = WVW_LANDMARKS[map];
    if (!landmarks || landmarks.length === 0) return null;

    let nearest = landmarks[0];
    let minDist = Math.hypot(x - nearest.x, y - nearest.y);

    for (let i = 1; i < landmarks.length; i++) {
        const d = Math.hypot(x - landmarks[i].x, y - landmarks[i].y);
        if (d < minDist) {
            minDist = d;
            nearest = landmarks[i];
        }
    }

    return nearest;
}
