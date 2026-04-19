import type { ChatMessage, OllamaChatResponse } from '../../global';
import type { ChatProvider } from './types';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Convert Ollama-format tool schemas to Anthropic format
function toAnthropicTools(tools: any[]): any[] {
    return tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
    }));
}

// Convert messages from Ollama format to Anthropic format.
// Returns { system, messages } — system is extracted from the messages array.
function toAnthropicMessages(messages: ChatMessage[]): { system: string | undefined; messages: any[] } {
    let system: string | undefined;
    const out: any[] = [];

    for (const msg of messages) {
        if (msg.role === 'system') {
            system = msg.content;
            continue;
        }

        if (msg.role === 'assistant' && msg.tool_calls?.length) {
            const content: any[] = [];
            if (msg.content) content.push({ type: 'text', text: msg.content });
            for (const tc of msg.tool_calls) {
                const input = typeof tc.function.arguments === 'string'
                    ? JSON.parse(tc.function.arguments)
                    : (tc.function.arguments ?? {});
                content.push({
                    type: 'tool_use',
                    id: (tc as any).id ?? `toolu_${Math.random().toString(36).slice(2, 10)}`,
                    name: tc.function.name,
                    input,
                });
            }
            out.push({ role: 'assistant', content });
            continue;
        }

        if (msg.role === 'tool') {
            // Find the tool_use id from the preceding assistant message
            const prev = out[out.length - 1];
            const toolUseBlock = Array.isArray(prev?.content)
                ? prev.content.find((c: any) => c.type === 'tool_use')
                : null;
            const toolUseId = toolUseBlock?.id ?? `toolu_${Math.random().toString(36).slice(2, 10)}`;

            // If the last converted message is already a tool_result user block, append to it
            const last = out[out.length - 1];
            if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
                last.content.push({ type: 'tool_result', tool_use_id: toolUseId, content: msg.content });
            } else {
                out.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: msg.content }] });
            }
            continue;
        }

        out.push({ role: msg.role, content: msg.content });
    }

    return { system, messages: out };
}

// Convert Anthropic response to OllamaChatResponse format
function fromAnthropicResponse(body: any): OllamaChatResponse {
    const textBlocks = (body.content ?? []).filter((c: any) => c.type === 'text');
    const toolBlocks = (body.content ?? []).filter((c: any) => c.type === 'tool_use');

    const toolCalls = toolBlocks.map((tb: any) => ({
        id: tb.id,
        function: { name: tb.name, arguments: tb.input ?? {} },
    }));

    return {
        message: {
            role: 'assistant',
            content: textBlocks.map((b: any) => b.text).join(''),
            ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
    };
}

function buildRequestBody(messages: ChatMessage[], tools: any[], model: string, stream: boolean): any {
    const { system, messages: converted } = toAnthropicMessages(messages);
    const body: any = {
        model,
        max_tokens: 4096,
        messages: converted,
        stream,
    };
    if (system) body.system = system;
    if (tools.length > 0) body.tools = toAnthropicTools(tools);
    return body;
}

export function createAnthropicProvider(apiKey: string, model: string): ChatProvider {
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
    };

    return {
        async chatOnce(messages, tools) {
            const res = await fetch(ANTHROPIC_API, {
                method: 'POST',
                headers,
                body: JSON.stringify(buildRequestBody(messages, tools, model, false)),
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Anthropic API error ${res.status}: ${err}`);
            }
            const body = await res.json();
            return fromAnthropicResponse(body);
        },

        async streamChat(messages, onToken) {
            const res = await fetch(ANTHROPIC_API, {
                method: 'POST',
                headers,
                body: JSON.stringify(buildRequestBody(messages, [], model, true)),
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Anthropic API error ${res.status}: ${err}`);
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
                    if (!data) continue;
                    try {
                        const evt = JSON.parse(data);
                        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                            onToken(evt.delta.text, false);
                        } else if (evt.type === 'message_stop') {
                            onToken('', true);
                        }
                    } catch { /* ignore parse errors */ }
                }
            }
            onToken('', true);
        },
    };
}
