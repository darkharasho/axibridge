import type { ChatMessage, OllamaChatResponse } from '../global';
import { TOOL_SCHEMAS } from './tools/toolSchemas';
import { executeToolCall } from './tools/toolExecutors';

export class ToolUseNotSupportedError extends Error {
    constructor() {
        super("This model doesn't support tool use. Switch to llama3.1, mistral, or qwen2.5.");
        this.name = 'ToolUseNotSupportedError';
    }
}

const MAX_ITERATIONS = 3;

export async function agentLoop(
    userText: string,
    history: ChatMessage[],
    logs: ILogData[],
    getDetails: (id: string) => any,
    onToolCall: (name: string, status: 'running' | 'done') => void,
    onToken: (token: string, done: boolean) => void,
): Promise<void> {
    // Internal message list — typed loosely to support tool_calls on assistant messages
    const messages: any[] = [
        ...history,
        { role: 'user', content: userText },
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

            let result: Record<string, any>;
            try {
                result = executeToolCall(name, args, logs, getDetails);
            } catch (err: any) {
                result = { error: err?.message ?? 'Tool execution failed' };
            }

            messages.push({ role: 'tool', content: JSON.stringify(result) });
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
