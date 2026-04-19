import type { ChatMessage, OllamaChatResponse } from '../global';
import { TOOL_SCHEMAS } from './tools/toolSchemas';
import { executeToolCall } from './tools/toolExecutors';
import { computeStatsSync } from '../stats/incrementalAggregation';
import { classifyQuestion } from './questionRouter';
import type { ChatProvider } from './providers/types';

export class ToolUseNotSupportedError extends Error {
    constructor() {
        super("This model doesn't support tool use. Switch to llama3.1, mistral, or qwen2.5.");
        this.name = 'ToolUseNotSupportedError';
    }
}

const MAX_ITERATIONS = 5;

export async function agentLoop(
    userText: string,
    history: ChatMessage[],
    logs: ILogData[],
    getDetails: (id: string) => any,
    onToolCall: (name: string, status: 'running' | 'done') => void,
    onToken: (token: string, done: boolean) => void,
    provider: ChatProvider,
): Promise<void> {
    // Hydrate logs and compute stats once for this turn
    const hydratedLogs = logs
        .filter(l => l.detailsStatus === 'loaded')
        .map(log => {
            const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
            return details ? { ...log, details } : log;
        });
    const { stats: computedStats } = computeStatsSync({ logs: hydratedLogs });

    const route = classifyQuestion(userText);

    // Branch: data not in arcdps logs
    if (route.kind === 'unavailable') {
        const msgs: ChatMessage[] = [
            ...history,
            { role: 'user', content: `[The user is asking about data that is not available in arcdps logs: ${route.reason} Tell the user this directly and briefly suggest what IS available.]\n\n${userText}` },
        ];
        const resp = await provider.chatOnce(msgs, []);
        onToken(resp.message.content ?? '', true);
        return;
    }

    // Branch: answer is visible in context — no tools
    if (route.kind === 'context') {
        const msgs: ChatMessage[] = [
            ...history,
            { role: 'user', content: `[${route.directive}]\n\n${userText}` },
        ];
        const resp = await provider.chatOnce(msgs, []);
        onToken(resp.message.content ?? '', true);
        return;
    }

    // Branch: tool identified with complete args — pre-execute, skip model tool selection
    if (route.kind === 'tool' && route.argsComplete) {
        onToolCall(route.tool, 'running');
        let toolResult: string;
        try {
            toolResult = executeToolCall(route.tool, route.args, logs, getDetails, computedStats);
        } catch (err: any) {
            toolResult = `Tool execution failed: ${err?.message ?? 'unknown error'}`;
        }
        onToolCall(route.tool, 'done');

        // Synthesis: use a minimal system prompt so the model doesn't confuse the tool-calling
        // instructions in the main system prompt as additional questions to answer.
        const historyWithoutSystem = history.filter(m => m.role !== 'system');
        const synthMsgs: ChatMessage[] = [
            { role: 'system', content: 'You are a GW2 WvW analyst. Answer the user\'s specific question directly and concisely based on the tool data provided. Only address what was asked. Preserve markdown tables and ```chart blocks verbatim in your response.' },
            ...historyWithoutSystem,
            { role: 'user', content: userText },
            { role: 'assistant', content: '', tool_calls: [{ function: { name: route.tool, arguments: route.args } }] },
            { role: 'tool', content: toolResult },
        ];
        const resp = await provider.chatOnce(synthMsgs, []);
        onToken(resp.message.content ?? '', true);
        return;
    }

    // Branch: tool identified but args need model (open-world entity, e.g. player name) OR unknown
    // Inject a strong directive into the user message so the model uses the right tool
    const directive = route.kind === 'tool' ? `[${route.directive}]\n\n` : '';
    const messages: any[] = [
        ...history,
        { role: 'user', content: `${directive}${userText}` },
    ];

    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
        iterations++;

        let response: OllamaChatResponse;
        try {
            response = await provider.chatOnce(messages, TOOL_SCHEMAS);
        } catch (err: any) {
            const msg = (err?.message ?? '').toLowerCase();
            if (msg.includes('tool') || msg.includes('function')) {
                throw new ToolUseNotSupportedError();
            }
            throw err;
        }

        const toolCalls = response.message.tool_calls;

        if (!toolCalls?.length) {
            onToken(response.message.content ?? '', true);
            return;
        }

        messages.push({
            role: 'assistant',
            content: response.message.content ?? '',
            tool_calls: toolCalls,
        });

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

    await provider.streamChat(messages, onToken);
}
