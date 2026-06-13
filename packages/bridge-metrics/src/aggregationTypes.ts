export interface PlayerSkillDamageEntry {
    id: string;
    name: string;
    icon?: string;
    damage: number;
    downContribution: number;
    hits: number;
    casts: number;
    min: number;
    max: number;
}

export interface PlayerHealingSkillEntry {
    id: string;
    name: string;
    icon?: string;
    total: number;
    hits: number;
    max: number;
}
