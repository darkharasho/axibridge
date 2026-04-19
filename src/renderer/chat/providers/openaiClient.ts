import type { ChatMessage, OllamaChatResponse } from '../../global';
import type { ChatProvider } from './types';

const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

// OpenAI uses the same tool schema format as Ollama — no conversion needed.
// Message format is also mostly compatible, except 'tool' role needs tool_call_id.

function toOpenAIMessages(messages: ChatMessage[]): any[] {
    const out: any[] = [];
    const pendingToolCallIds: string[] = [];

    for (const msg of messages) {
        if (msg.role === 'assistant' && msg.tool_calls?.length) {
            const openaiToolCalls = msg.tool_calls.map((tc, i) => ({
                id: (tc as any).id ?? `call_${i}_${Math.random().toString(36).slice(2, 8)}`,
                type: 'function',
                function: {
                    name: tc.function.name,
                    arguments: typeof tc.function.arguments === 'string'
                        ? tc.function.arguments
                        : JSON.stringify(tc.function.arguments ?? {}),
                },
            }));
            pendingToolCallIds.length = 0;
            pendingToolCallIds.push(...openaiToolCalls.map(tc => tc.id));
            out.push({ role: 'assistant', content: msg.content || null, tool_calls: openaiToolCalls });
            continue;
        }

        if (msg.role === 'tool') {
            const callId = pendingToolCallIds.shift() ?? `call_${Math.random().toString(36).slice(2, 8)}`;
            out.push({ role: 'tool', tool_call_id: callId, content: msg.content });
            continue;
        }

        out.push({ role: msg.role, content: msg.content });
    }

    return out;
}

function fromOpenAIResponse(body: any): OllamaChatResponse {
    const choice = body.choices?.[0];
    const msg = choice?.message;
    const toolCalls = msg?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        function: {
            name: tc.function.name,
            arguments: (() => {
                try { return JSON.parse(tc.function.arguments); }
                catch { return tc.function.arguments; }
            })(),
        },
    }));
    return {
        message: {
            role: 'assistant',
            content: msg?.content ?? '',
            ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
        },
    };
}

export function createOpenAIProvider(apiKey: string, model: string): ChatProvider {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
    };

    return {
        async chatOnce(messages, tools) {
            const body: any = {
                model,
                messages: toOpenAIMessages(messages),
            };
            if (tools.length > 0) body.tools = tools;

            const res = await fetch(OPENAI_API, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`OpenAI API error ${res.status}: ${err}`);
            }
            return fromOpenAIResponse(await res.json());
        },

        async streamChat(messages, onToken) {
            const res = await fetch(OPENAI_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model,
                    messages: toOpenAIMessages(messages),
                    stream: true,
                }),
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`OpenAI API error ${res.status}: ${err}`);
            }

            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buf = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop() ?? '';
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') { onToken('', true); return; }
                    try {
                        const evt = JSON.parse(data);
                        const delta = evt.choices?.[0]?.delta?.content;
                        if (delta) onToken(delta, false);
                        if (evt.choices?.[0]?.finish_reason === 'stop') onToken('', true);
                    } catch { /* ignore */ }
                }
            }
            onToken('', true);
        },
    };
}
