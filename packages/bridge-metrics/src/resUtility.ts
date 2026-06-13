import { RES_UTILITY_IDS, RES_UTILITY_NAME_MATCHES } from './statsMetrics';

export const isResUtilitySkill = (id: number, skillMap: Record<string, { name?: string }> | undefined) => {
    if (RES_UTILITY_IDS.has(id)) {
        return true;
    }
    const entry = skillMap?.[`s${id}`] || skillMap?.[`${id}`];
    const name = entry?.name?.toLowerCase() || '';
    return RES_UTILITY_NAME_MATCHES.some((match) => name.includes(match));
};
