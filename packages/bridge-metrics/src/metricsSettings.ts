import metricsSpec from './metrics-methods.json';

export type DisruptionMethod = 'count' | 'duration' | 'tiered';

export interface MetricsMethodSpec {
    label: string;
    summary: string;
    implications: string[];
    tiers?: {
        shortMs: number;
        mediumMs: number;
        weights: {
            short: number;
            medium: number;
            long: number;
        };
    };
}

export interface MetricsSpec {
    specVersion: string;
    methods: Record<DisruptionMethod, MetricsMethodSpec>;
}

export const METRICS_SPEC = metricsSpec as MetricsSpec;
export const DEFAULT_DISRUPTION_METHOD: DisruptionMethod = 'count';
