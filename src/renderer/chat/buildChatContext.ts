// src/renderer/chat/buildChatContext.ts

const GW2_WVW_CONTEXT = `
## GW2 WvW Context
- Stability prevents CC (knockback, stun, daze) — critical for fights
- Quickness reduces skill activation time — increases damage/heal throughput
- Might stacks amplify all damage — 25 stacks is the goal
- Alacrity reduces skill cooldowns — valuable but not universal in WvW
- Cleanses remove conditions; Strips remove enemy boons
- Deaths: dying grants the enemy rally if they are in a downed state
- DistToTag: lower = tighter squad. High values indicate players out of position
- K/D ratio above 1 means more enemies died than squad members
`.trim();

const ANALYST_INSTRUCTIONS = `
## Instructions
- Answer directly from the fight data provided in this message
- Reference specific player names and numbers when available
- If a metric or player is not in the data, say so — do not invent numbers
- Keep answers concise and actionable; use bullet points for comparisons
- Correct any GW2 misconceptions if the user states something inaccurate
- For improvement questions ("what could we do better?", "where did we struggle?", "what went wrong?"): identify specific weaknesses, underperformers, and areas that fell short of expectations — do NOT just list top performers or summarize who did the most
`.trim();

export function buildSystemPrompt(logs: ILogData[]): string {
    const loaded = logs.filter(l => l.detailsStatus === 'loaded');

    const fightList = loaded.length === 0
        ? 'No fights loaded.'
        : loaded.map((log, i) => {
            const s = log.dashboardSummary;
            const outcome = s?.isWin === true ? 'WIN' : s?.isWin === false ? 'LOSS' : '?';
            const squadDeaths = s?.squadDeaths ?? 0;
            const enemyDeaths = s?.enemyDeaths ?? 0;
            const kd = squadDeaths > 0
                ? `${(enemyDeaths / squadDeaths).toFixed(1)}:1 K/D`
                : enemyDeaths > 0 ? `${enemyDeaths}:0 K/D` : '';
            const name = log.fightName ?? `Fight ${i + 1}`;
            return `${i + 1}. ${name} — ${outcome}${kd ? ` — ${kd}` : ''}`;
        }).join('\n');

    return [
        'You are an expert Guild Wars 2 World vs World (WvW) analyst embedded in AxiBridge.',
        'Detailed fight data will be provided in each user message. Use it as your primary source.',
        '',
        GW2_WVW_CONTEXT,
        '',
        `## Loaded Fights (${loaded.length})`,
        fightList,
        '',
        ANALYST_INSTRUCTIONS,
    ].join('\n');
}
