import { classifyResurrectSkill } from './resurrectCatalog';

/**
 * True when a cast skill is a resurrect UTILITY (not the hand-resurrect channel
 * and not a self-resurrect). Kept as its own export because the `resUtility`
 * healing metric counts utility casts only.
 */
export const isResUtilitySkill = (id: number, skillMap: Record<string, { name?: string }> | undefined) =>
    classifyResurrectSkill(id, skillMap)?.kind === 'utility';
