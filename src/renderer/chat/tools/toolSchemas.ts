export interface OllamaTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, { type: string; description: string }>;
            required: string[];
        };
    };
}

export const TOOL_SCHEMAS: OllamaTool[] = [
    {
        type: 'function',
        function: {
            name: 'player_deep_dive',
            description: 'Get all available stats for a specific player — damage by skill, boon uptimes, defenses, support stats, and health timeline. Use when asked about a specific player in detail.',
            parameters: {
                type: 'object',
                properties: {
                    character_name: { type: 'string', description: 'Character name, account name, or partial match' },
                    fight_index: { type: 'number', description: '0-based fight index. Omit to search all fights.' },
                },
                required: ['character_name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'rank_players',
            description: 'Rank all players by a named metric. Use when asked "who topped X" or "who had the best/worst Y". Valid metrics: dps, damage, deaths, downs, damage_taken, cleanses, strips, rezzes, breakbar_damage, dist_to_tag, stability_uptime, quickness_uptime, alacrity_uptime, might_uptime.',
            parameters: {
                type: 'object',
                properties: {
                    metric: { type: 'string', description: 'Metric name, e.g. "dps", "deaths", "stability_uptime"' },
                    fight_index: { type: 'number', description: '0-based fight index. Omit to aggregate across all fights.' },
                },
                required: ['metric'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'boon_analysis',
            description: 'Get per-player boon uptime table for a fight. Use when asked about boon coverage, who had high/low boon uptime, or support performance.',
            parameters: {
                type: 'object',
                properties: {
                    fight_index: { type: 'number', description: '0-based fight index. Omit for all fights.' },
                    boon_name: { type: 'string', description: 'Filter to a specific boon: stability, quickness, alacrity, might, fury, swiftness, protection, aegis, regeneration, vigor, resolution, resistance. Omit for all boons.' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'group_breakdown',
            description: 'Get aggregate stats (damage, deaths, cleanses, rezzes) broken down per subgroup (G1–G5). Use when asked how each group or subgroup performed.',
            parameters: {
                type: 'object',
                properties: {
                    fight_index: { type: 'number', description: '0-based fight index. Omit for all fights.' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'compare_fights',
            description: 'Compare a metric across all fights — either squad-wide or for a specific player. Use when asked "how did X change across fights" or "which fight had the best Y".',
            parameters: {
                type: 'object',
                properties: {
                    metric: { type: 'string', description: 'Metric name, e.g. "dps", "deaths", "stability_uptime"' },
                    player_name: { type: 'string', description: 'Optional: filter to a specific player. Omit for squad aggregate.' },
                },
                required: ['metric'],
            },
        },
    },
];
