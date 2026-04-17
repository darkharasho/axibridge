export interface SquadSample {
    timeMs: number;
    centroid: [number, number];
    spread: number;
    partyHulls: Record<number, [number, number][]>;
    speed: number;
}

export type PhaseKind = 'opening' | 'push' | 'retreat' | 'cleanup';

export interface Phase {
    kind: PhaseKind;
    startMs: number;
    endMs: number;
}

export interface SquadDerived {
    samples: SquadSample[];
    phases: Phase[];
}
