export type ObjectiveTier = 'major' | 'minor';

/**
 * Keeps, towers and the castle are structures a squad fights *over*; camps
 * and ruins are waypoints it passes through. Only the first group earns a
 * label loud enough to compete with the squad at fight zoom.
 */
export function objectiveTier(name: string): ObjectiveTier {
    return /\b(keep|tower|castle|garrison)\b/i.test(name) ? 'major' : 'minor';
}
