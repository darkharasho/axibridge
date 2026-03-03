import { buildFightLabel, resolveMapName, sanitizeWvwLabel } from './utils/labelUtils';
import { resolveFightTimestamp } from './utils/timestampUtils';

export interface HealEffectivenessSkillRow {
    skillName: string;
    icon?: string;
    amount: number;
    hits: number;
}

export interface HealEffectivenessFight {
    id: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    incomingDamage: number;
    healing: number;
    barrier: number;
    healingSkills: HealEffectivenessSkillRow[];
    incomingDamageSkills: HealEffectivenessSkillRow[];
}

const sumPhaseValue = (phases: any[] | undefined, field: string) => {
    if (!Array.isArray(phases)) return 0;
    return phases.reduce((sum, phase) => sum + Number(phase?.[field] ?? 0), 0);
};

const computeOutgoingHealing = (player: any) => {
    const allies = player?.extHealingStats?.outgoingHealingAllies;
    if (!Array.isArray(allies)) return 0;
    return allies.reduce((sum: number, phases: any[]) => sum + sumPhaseValue(phases, 'healing'), 0);
};

const computeOutgoingBarrier = (player: any) => {
    const allies = player?.extBarrierStats?.outgoingBarrierAllies;
    if (!Array.isArray(allies)) return 0;
    return allies.reduce((sum: number, phases: any[]) => sum + sumPhaseValue(phases, 'barrier'), 0);
};

const resolveSkillMeta = (rawId: any, details: any) => {
    const idNum = Number(rawId);
    if (!Number.isFinite(idNum)) {
        return { name: String(rawId || 'Unknown Skill'), icon: undefined as string | undefined };
    }
    let name = `Skill ${idNum}`;
    const skillMap = details?.skillMap || {};
    const buffMap = details?.buffMap || {};
    const mapped = skillMap?.[`s${idNum}`] || skillMap?.[`${idNum}`];
    let icon = mapped?.icon;
    if (mapped?.name) name = String(mapped.name);
    const buffMapped = buffMap?.[`b${idNum}`] || buffMap?.[`${idNum}`];
    if (name.startsWith('Skill ') && buffMapped?.name) {
        name = String(buffMapped.name);
        icon = buffMapped?.icon || icon;
    }
    return { name, icon };
};

const aggregateRows = (
    map: Map<number, HealEffectivenessSkillRow>,
    entries: any[] | undefined,
    details: any,
    amountField: string
) => {
    if (!Array.isArray(entries)) return;
    entries.forEach((entry: any) => {
        const skillId = Number(entry?.id);
        if (!Number.isFinite(skillId)) return;
        const amount = Number(entry?.[amountField] || 0);
        if (!Number.isFinite(amount) || amount <= 0) return;
        const hits = Number(entry?.hits || entry?.connectedHits || 0);
        const meta = resolveSkillMeta(skillId, details);
        const current = map.get(skillId) || {
            skillName: meta.name,
            icon: meta.icon,
            amount: 0,
            hits: 0
        };
        current.amount += amount;
        current.hits += Number.isFinite(hits) ? hits : 0;
        if ((!current.icon || current.skillName.startsWith('Skill ')) && meta.icon) current.icon = meta.icon;
        if (current.skillName.startsWith('Skill ') && !meta.name.startsWith('Skill ')) current.skillName = meta.name;
        map.set(skillId, current);
    });
};

const extractPhaseEntries = (value: any) => {
    if (!Array.isArray(value)) return [] as any[];
    const phase0 = value[0];
    if (Array.isArray(phase0)) return phase0;
    return [];
};

export const computeHealEffectivenessData = (validLogs: any[]): HealEffectivenessFight[] => {
    return validLogs
        .map((log) => ({ log, timestamp: resolveFightTimestamp(log?.details, log) }))
        .sort((a, b) => a.timestamp - b.timestamp)
        .flatMap(({ log }, index) => {
            const details = log?.details;
            if (!details) return [];

            const players = Array.isArray(details.players) ? details.players : [];
            const squadPlayers = players.filter((player: any) => !player?.notInSquad);
            const incomingDamage = squadPlayers.reduce((sum: number, player: any) => (
                sum + Number(player?.defenses?.[0]?.damageTaken || 0)
            ), 0);
            const healing = squadPlayers.reduce((sum: number, player: any) => sum + computeOutgoingHealing(player), 0);
            const barrier = squadPlayers.reduce((sum: number, player: any) => sum + computeOutgoingBarrier(player), 0);

            const healingSkillMap = new Map<number, HealEffectivenessSkillRow>();
            const incomingSkillMap = new Map<number, HealEffectivenessSkillRow>();

            squadPlayers.forEach((player: any) => {
                aggregateRows(
                    healingSkillMap,
                    extractPhaseEntries(player?.extHealingStats?.totalHealingDist),
                    details,
                    'totalHealing'
                );

                const damageTakenPhases = Array.isArray(player?.totalDamageTaken) ? player.totalDamageTaken : [];
                damageTakenPhases.forEach((phaseEntries: any) => {
                    aggregateRows(incomingSkillMap, phaseEntries, details, 'totalDamage');
                });
            });

            const fightName = sanitizeWvwLabel(details?.fightName || log?.fightName || `Fight ${index + 1}`);
            const mapName = resolveMapName(details, log);

            return [{
                id: log.filePath || log.id || `fight-${index + 1}`,
                shortLabel: `F${index + 1}`,
                fullLabel: buildFightLabel(fightName, String(mapName || '')),
                timestamp: resolveFightTimestamp(details, log),
                incomingDamage,
                healing,
                barrier,
                healingSkills: Array.from(healingSkillMap.values())
                    .sort((a, b) => b.amount - a.amount || b.hits - a.hits || a.skillName.localeCompare(b.skillName))
                    .slice(0, 25),
                incomingDamageSkills: Array.from(incomingSkillMap.values())
                    .sort((a, b) => b.amount - a.amount || b.hits - a.hits || a.skillName.localeCompare(b.skillName))
                    .slice(0, 25)
            }];
        });
};
