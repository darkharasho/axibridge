import type { ChatMessage, OllamaChatResponse } from '../global';
import { TOOL_SCHEMAS } from './tools/toolSchemas';
import { executeToolCall } from './tools/toolExecutors';
import { computeStatsSync } from '../stats/incrementalAggregation';

export class ToolUseNotSupportedError extends Error {
    constructor() {
        super("This model doesn't support tool use. Switch to llama3.1, mistral, or qwen2.5.");
        this.name = 'ToolUseNotSupportedError';
    }
}

const MAX_ITERATIONS = 3;

const ROUTING_SYSTEM_PROMPT = `You classify questions about GW2 WvW arcdps fight logs.

Data available in context: fight name, duration, outcome (WIN/LOSS), squad size, squad deaths, enemy size, enemy deaths, K/D ratio. Per player: damage total, DPS, deaths, downs, damage taken (total only, not by skill), cleanses, strips, rezzes, CC/breakbar damage, distance to tag, boon uptimes.

Tools available:
- rank_players: rank all players by a stat (dps, damage, deaths, downs, damage_taken, cleanses, strips, rezzes, breakbar_damage, dist_to_tag)
- player_deep_dive: full stats for one specific named player
- boon_analysis: per-player boon uptime detail with squad averages
- group_breakdown: stats grouped by subgroup G1/G2/etc.
- compare_fights: how a stat trended across multiple fights

NOT in the data: incoming damage broken down by enemy skill, enemy skill names, player rotation/cast sequences, build/gear/traits, target-specific damage splits, rally counts.

Respond with EXACTLY one line — no explanation, no preamble:
CONTEXT: [where in the fight data the answer is visible]
TOOL: [tool_name] | [one-sentence reason]
UNAVAILABLE: [what specific data is missing and why]`;

async function routeQuestion(userText: string): Promise<string> {
    try {
        const resp = await window.electronAPI.chatOnce([
            { role: 'system', content: ROUTING_SYSTEM_PROMPT },
            { role: 'user', content: `Question: "${userText}"` },
        ], []);
        return resp.message.content?.trim() ?? '';
    } catch {
        return '';
    }
}

export async function agentLoop(
    userText: string,
    history: ChatMessage[],
    logs: ILogData[],
    getDetails: (id: string) => any,
    onToolCall: (name: string, status: 'running' | 'done') => void,
    onToken: (token: string, done: boolean) => void,
): Promise<void> {
    // Hydrate logs and compute stats once for this turn
    const hydratedLogs = logs
        .filter(l => l.detailsStatus === 'loaded')
        .map(log => {
            const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
            return details ? { ...log, details } : log;
        });
    const { stats: computedStats } = computeStatsSync({ logs: hydratedLogs });

    // Step 0: Route the question so the model knows how to approach it
    const routing = await routeQuestion(userText);
    const annotatedQuestion = routing
        ? `[Routing analysis: ${routing}]\n\n${userText}`
        : userText;

    // Internal message list — typed loosely to support tool_calls on assistant messages
    const messages: any[] = [
        ...history,
        { role: 'user', content: annotatedQuestion },
    ];

    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
        iterations++;

        let response: OllamaChatResponse;
        try {
            response = await window.electronAPI.chatOnce(messages, TOOL_SCHEMAS);
        } catch (err: any) {
            const msg = (err?.message ?? '').toLowerCase();
            if (msg.includes('tool') || msg.includes('function')) {
                throw new ToolUseNotSupportedError();
            }
            throw err;
        }

        const toolCalls = response.message.tool_calls;

        // Model answered directly — emit full content as a single token then return
        if (!toolCalls?.length) {
            const content = response.message.content ?? '';
            onToken(content, true);
            return;
        }

        // Append the assistant's tool-call message to history
        messages.push({
            role: 'assistant',
            content: response.message.content ?? '',
            tool_calls: toolCalls,
        });

        // Execute each tool and append results
        for (const tc of toolCalls) {
            const { name, arguments: args } = tc.function;
            onToolCall(name, 'running');

            let result: string;
            try {
                result = executeToolCall(name, args, logs, getDetails, computedStats);
            } catch (err: any) {
                result = `Tool execution failed: ${err?.message ?? 'unknown error'}`;
            }

            messages.push({ role: 'tool', content: result });
            onToolCall(name, 'done');
        }
    }

    // Cap reached — fall through to streaming with accumulated context
    console.warn('[agentLoop] Max iterations reached, falling through to streaming');

    await new Promise<void>((resolve, reject) => {
        const unsub = window.electronAPI.onOllamaChatToken(({ token, done }) => {
            onToken(token, done);
            if (done) {
                unsub();
                resolve();
            }
        });
        window.electronAPI.ollamaChat(messages).catch(err => {
            unsub();
            reject(err);
        });
    });
}
