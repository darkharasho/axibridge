type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

export interface OllamaTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, { type: JsonSchemaType; description: string }>;
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
    {
        type: 'function',
        function: {
            name: 'squad_skill_damage',
            description: 'Show which skills our squad used that dealt the most damage or down contribution — outgoing squad skills ranked by damage. Use for "what skills did we use", "top damage skills", "outgoing skill breakdown", "which skill did the most damage for us".',
            parameters: {
                type: 'object',
                properties: {
                    fight_index: { type: 'number', description: '0-based fight index. Omit for all fights.' },
                    metric: { type: 'string', description: '"damage" (default) or "down_contribution"' },
                    top_n: { type: 'number', description: 'Number of skills to show (default 15).' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'healing_stats',
            description: 'Show healing output per player — total healing, HPS, barrier, downed healing. Use when asked about healing, healers, HPS, or barrier output.',
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
            name: 'conditions_applied',
            description: 'Show which conditions our squad applied to enemies — sorted by damage. Use when asked about condition damage, what conditions we applied, condi output, or a specific condition like burning/bleeding/torment.',
            parameters: {
                type: 'object',
                properties: {
                    fight_index: { type: 'number', description: '0-based fight index. Omit for all fights.' },
                    condition_name: { type: 'string', description: 'Filter to a specific condition, e.g. "burning", "bleeding", "torment". Omit for all.' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'damage_mitigation',
            description: 'Show damage mitigation per player — evades, blocks, dodges, invulns, and total damage mitigated. Use when asked who dodged most, evade counts, mitigation stats, or defensive play.',
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
            name: 'spike_damage',
            description: 'Show spike/burst damage output per player — peak single hit, 1-second burst, and down-spike values. Use when asked about burst damage, peak hits, biggest hits, or spike pressure.',
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
            name: 'incoming_skill_damage',
            description: 'Show which enemy skills dealt the most damage to the squad — squad-wide aggregate sorted by total damage taken. Use when asked "what hit us the most", "top incoming skill", "what killed us", "what ability damaged us", or any question about enemy attacks/skills against the squad.',
            parameters: {
                type: 'object',
                properties: {
                    fight_index: { type: 'number', description: '0-based fight index. Omit for all fights.' },
                    top_n: { type: 'number', description: 'Number of top skills to show (default 10).' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'performance_analysis',
            description: 'Generate a coaching report analyzing overall squad performance — offense, defense, boon coverage, healing, and actionable recommendations. Use for "what can we improve?", "coaching report", "how did we do?", "what were our weaknesses?", "performance review".',
            parameters: {
                type: 'object',
                properties: {
                    fight_index: { type: 'number', description: '0-based fight index. Omit for all fights combined.' },
                },
                required: [],
            },
        },
    },
];
