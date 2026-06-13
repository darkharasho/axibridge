export interface RoleClassificationFactor {
    metric: string;
    value: number;
    median: number;
    ratio: number;
    weight: number;
    contribution: number;
}

export interface PlayerRoleClassification {
    role: 'support' | 'damage';
    supportScore: number;
    confidenceScore: number;
    threshold: number;
    factors: RoleClassificationFactor[];
}
