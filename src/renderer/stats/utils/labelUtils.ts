export { buildFightLabelV2, computeFightAvgPosition } from '../../../shared/mapUtils';
export type { FightLabelInputs } from '../../../shared/mapUtils';

/**
 * Strips common WvW prefix noise from a map/fight label.
 */
export const sanitizeWvwLabel = (value: any): string =>
    String(value || '')
        .replace(/^Detailed\s*WvW\s*-\s*/i, '')
        .replace(/^World\s*vs\s*World\s*-\s*/i, '')
        .replace(/^WvW\s*-\s*/i, '')
        .trim();

export const normalizeMapLabel = (value: any): string => {
    if (!value) return 'Unknown';
    const cleaned = sanitizeWvwLabel(value);
    const borderlandsMatch = cleaned.match(/^(Red|Blue|Green)\s+(?:Alpine|Desert)?\s*Borderlands$/i);
    if (borderlandsMatch) {
        return `${borderlandsMatch[1]} Borderlands`;
    }
    return cleaned || 'Unknown';
};

export const tokenizeLabel = (value: string): string[] =>
    sanitizeWvwLabel(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token));

export const resolveMapName = (details: any, log: any): string =>
    normalizeMapLabel(
        details?.zone
        || details?.mapName
        || details?.map
        || details?.location
        || details?.fightName
        || log?.fightName
        || log?.encounterName
        || 'Unknown'
    );
