export type RouteDecision =
    | { kind: 'context'; directive: string }
    | { kind: 'tool'; tool: string; args: Record<string, any>; argsComplete: boolean; directive: string }
    | { kind: 'unavailable'; reason: string }
    | { kind: 'unknown' };

// --- Metric alias map (closed vocab from statsMetrics) ---

const METRIC_ALIASES: Record<string, string> = {
    // Offense
    'damage': 'damage',
    'total damage': 'damage',
    'dps': 'dps',
    'damage per second': 'dps',
    'down contribution': 'downContribution',
    'down contrib': 'downContribution',
    'cc': 'breakbar_damage',
    'crowd control': 'breakbar_damage',
    'breakbar': 'breakbar_damage',
    'breakbar damage': 'breakbar_damage',
    // Defense
    'deaths': 'deaths',
    'death': 'deaths',
    'died': 'deaths',
    'downs': 'downs',
    'down': 'downs',
    'downed': 'downs',
    'damage taken': 'damage_taken',
    'incoming damage': 'damage_taken',
    'damage received': 'damage_taken',
    // Support
    'cleanses': 'cleanses',
    'cleansing': 'cleanses',
    'strips': 'strips',
    'stripped': 'strips',
    'stripping': 'strips',
    'boon strips': 'strips',
    'rezzes': 'rezzes',
    'resurrects': 'rezzes',
    'revives': 'rezzes',
    'dist': 'dist_to_tag',
    'distance': 'dist_to_tag',
    'distance to tag': 'dist_to_tag',
    'range': 'dist_to_tag',
};

const BOON_NAMES = ['stability', 'quickness', 'alacrity', 'might', 'fury', 'aegis', 'protection', 'regeneration', 'vigor', 'resolution', 'resistance', 'swiftness'];

function lower(s: string): string {
    return s.toLowerCase();
}

function extractMetric(text: string): string | undefined {
    const t = lower(text);
    // Contextual overrides before alias scan
    if (/\btook.{0,10}damage\b|\breceived.{0,10}damage\b|\bdamage.{0,10}received\b/.test(t)) return 'damage_taken';
    // Try longest-match first (multi-word aliases before single-word)
    const sorted = Object.keys(METRIC_ALIASES).sort((a, b) => b.length - a.length);
    for (const alias of sorted) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`).test(t)) {
            return METRIC_ALIASES[alias];
        }
    }
    return undefined;
}

function extractFightIndex(text: string): number | undefined {
    const t = lower(text);
    const m = t.match(/\bfight\s*(\d+)\b/);
    if (m) return parseInt(m[1]) - 1;
    if (/\bfirst fight\b/.test(t)) return 0;
    if (/\bsecond fight\b/.test(t)) return 1;
    if (/\bthird fight\b/.test(t)) return 2;
    return undefined;
}

function extractTopN(text: string): number | undefined {
    const m = lower(text).match(/\btop\s*(\d+)\b/);
    return m ? parseInt(m[1]) : undefined;
}

// --- Pattern matchers ---

type Matcher = {
    test: (text: string) => boolean;
    decide: (text: string) => RouteDecision;
};

const any = (...patterns: RegExp[]) => (text: string) => patterns.some(p => p.test(lower(text)));

const MATCHERS: Matcher[] = [
    // Unavailable data — check first to avoid false-positive routing
    {
        test: any(
            /\brotation\b|\bcast sequence\b|\bskill order\b/,
            /\bbuilds?\b|\bgear\b|\btraits?\b|\bequipment\b|\bspecialization\b/,
            /\brallies?\b/,
            /which (skill|ability|attack) (did|should) i (use|cast|spam)/,
        ),
        decide: (text) => {
            const t = lower(text);
            if (/rotation|cast sequence|skill order/.test(t)) {
                return { kind: 'unavailable', reason: 'Player cast sequences and rotations are not tracked in arcdps logs.' };
            }
            if (/build|gear|trait|equip|spec/.test(t)) {
                return { kind: 'unavailable', reason: 'Build, gear, and trait data are not available in arcdps combat logs.' };
            }
            if (/rally/.test(t)) {
                return { kind: 'unavailable', reason: 'Rally counts are not tracked in these logs.' };
            }
            return { kind: 'unavailable', reason: 'This specific data is not available in arcdps logs.' };
        },
    },

    // Incoming skill/attack damage — must come before rank_players because "top" appears in both
    {
        test: any(
            /incoming.{0,15}(skill|attack|abilit|spell|hit)/,
            /top.{0,10}incoming/,
            /(skill|attack|abilit|spell).{0,15}(hit|hurt|kill|damage).{0,10}(us|squad|our)/,
            /what.{0,10}(hit|hurt|killed|damaged).{0,10}(us|squad|our)/,
            /enemy.{0,10}(skill|attack|abilit|spell).{0,10}(damage|hit)/,
            /what.{0,10}(skill|attack|abilit|spell).{0,10}did.{0,10}(most|highest|top)/,
            /top.{0,10}(skill|attack|abilit|spell).{0,5}(damage|hit)/,
            /what\s+(was|were|is)\s+(?:our\s+)?top\s+incoming/,
        ),
        decide: (text) => {
            const args: Record<string, any> = {};
            const fi = extractFightIndex(text);
            if (fi != null) args.fight_index = fi;
            const topN = extractTopN(text);
            if (topN != null) args.top_n = topN;
            return {
                kind: 'tool',
                tool: 'incoming_skill_damage',
                args,
                argsComplete: true,
                directive: 'The user wants to know which enemy skills/attacks dealt the most damage to the squad. Use incoming_skill_damage to get a squad-wide aggregate ranked by damage.',
            };
        },
    },

    // Boon analysis
    {
        test: any(
            /boon.{0,20}(coverage|uptime|average|overall|breakdown|analysis|performance)/,
            /overall.{0,10}boon/,
            /how.{0,10}(was|were).{0,10}(boon|stability|quickness|alacrity|might|fury)/,
            /\b(stability|quickness|alacrity|might|fury|aegis|protection|regeneration|vigor|resolution|resistance|swiftness)\b.{0,20}(uptime|coverage|percent|%|avg|average)/,
            /(uptime|coverage).{0,20}\b(stability|quickness|alacrity|might|fury|aegis|protection|regeneration|vigor|resolution|resistance|swiftness)\b/,
        ),
        decide: (text) => {
            const t = lower(text);
            const args: Record<string, any> = {};
            const fi = extractFightIndex(text);
            if (fi != null) args.fight_index = fi;
            for (const boon of BOON_NAMES) {
                if (t.includes(boon)) { args.boon_name = boon; break; }
            }
            return {
                kind: 'tool',
                tool: 'boon_analysis',
                args,
                argsComplete: true,
                directive: 'The user is asking about boon uptime/coverage. Use boon_analysis to get per-player boon uptime data.',
            };
        },
    },

    // Group breakdown
    {
        test: any(
            /group.{0,20}(breakdown|performance|comparison|stats)/,
            /\bsubgroup\b/,
            /\bg[1-5]\b/,
            /how.{0,10}(did|was|were).{0,10}(each|every|the)\s+(group|squad\s+group)/,
            /by.{0,10}(group|subgroup)/,
            /compare.{0,10}groups?/,
        ),
        decide: (text) => {
            const args: Record<string, any> = {};
            const fi = extractFightIndex(text);
            if (fi != null) args.fight_index = fi;
            return {
                kind: 'tool',
                tool: 'group_breakdown',
                args,
                argsComplete: true,
                directive: 'The user is asking about group/subgroup performance. Use group_breakdown.',
            };
        },
    },

    // Compare fights
    {
        test: any(
            /compare.{0,15}(fight|log)/,
            /(across|between|over).{0,10}(fight|log)/,
            /fight\s*\d+.{0,10}(vs?\.?|versus|compared\s+to)/,
            /trend.{0,10}(across|over).{0,10}fight/,
            /which fight.{0,10}(best|worst|most|least|highest|lowest)/,
        ),
        decide: (text) => {
            const metric = extractMetric(text);
            return {
                kind: 'tool',
                tool: 'compare_fights',
                args: metric ? { metric } : {},
                argsComplete: !!metric,
                directive: 'The user wants to compare a metric across fights. Use compare_fights with the appropriate metric.',
            };
        },
    },

    // Player ranking — "who" questions about individuals
    {
        test: any(
            /who\s+(had|topped|dealt|did|took|got|was|is|has|have|stripped|cleansed|rezz|killed|downed)\s.{0,30}(most|best|worst|highest|lowest|top|least|more|less)/,
            /who\s+topped\s+\w/,   // "who topped damage" — no superlative needed
            /who\s+(died|downed|wiped)\s*(the\s+)?(most|least)/,
            /who\s+is\s+(?:our\s+)?(?:best|worst|top|highest|lowest)/,
            /\btop\s+\d*\s*players?\b/,
            /\bplayer\s+(ranking|leaderboard|list)\b/,
            /rank\s+(all\s+)?players\s+by/,
        ),
        decide: (text) => {
            const metric = extractMetric(text);
            const fi = extractFightIndex(text);
            const args: Record<string, any> = {};
            if (fi != null) args.fight_index = fi;
            if (metric) args.metric = metric;
            return {
                kind: 'tool',
                tool: 'rank_players',
                args,
                argsComplete: !!metric,
                directive: `The user wants to rank players${metric ? ` by ${metric}` : ' — determine the appropriate metric from context'}. Use rank_players.`,
            };
        },
    },

    // Specific player deep dive — player name or account name mentioned
    {
        test: (text) => {
            const t = lower(text);
            // GW2 account names: word.####
            if (/\b\w+\.\d{4}\b/.test(text)) return true;
            // "tell me about X" / "how did X do" / "show me X's stats" patterns
            // Exclude group references like G1/G2 and squad/group keywords
            if (/\b(tell me about|show me|analyze|look up|stats? for|performance of)\s+\w/.test(t) && !/\bg[1-5]\b|\bgroup\b|\bsquad\b/.test(t)) return true;
            return false;
        },
        decide: (text) => {
            const fi = extractFightIndex(text);
            const args: Record<string, any> = {};
            if (fi != null) args.fight_index = fi;
            // Try to extract account name
            const accountMatch = text.match(/\b(\w+\.\d{4})\b/);
            if (accountMatch) args.character_name = accountMatch[1];
            return {
                kind: 'tool',
                tool: 'player_deep_dive',
                args,
                argsComplete: !!accountMatch,
                directive: 'The user wants detailed stats for a specific player. Use player_deep_dive with the player name from the question.',
            };
        },
    },

    // Context questions — fight outcomes, totals visible in the summary
    {
        test: any(
            /did\s+(we|our\s+squad)\s+(win|lose|wipe|survive)/,
            /what\s+(was|were|is)\s+(?:the|our)\s+(outcome|result|score)/,
            /(how\s+many|total)\s+(deaths?|kills?|fights?|players?)/,
            /how\s+(long|much\s+time)\s+(was|did|took?)\s+(the\s+)?fight/,
            /\bk\/?d\b|\bkill.?death\b/,
            /(squad\s+)?(size|count|composition|how\s+many\s+(of\s+)?(us|them))/,
            /how\s+many\s+fights?\s+(did\s+we|have\s+we|were)/,
            /what\s+(fights?|logs?)\s+(do\s+(i|we)\s+have|are\s+loaded)/,
        ),
        decide: () => ({
            kind: 'context',
            directive: 'Answer directly from the fight summary data already in your context (outcomes, deaths, K/D, duration, squad size). Do NOT call any tool.',
        }),
    },
];

export function classifyQuestion(text: string): RouteDecision {
    for (const matcher of MATCHERS) {
        if (matcher.test(text)) {
            return matcher.decide(text);
        }
    }
    return { kind: 'unknown' };
}
