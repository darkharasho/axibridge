import { useState, useCallback, useEffect, useRef, useContext, useMemo } from 'react';
import type { ChatMessage, IAiSettings } from '../global';
import { buildSystemPrompt } from './buildChatContext';
import { agentLoop, ToolUseNotSupportedError } from './agentLoop';
import { DetailsCacheContext } from '../cache/DetailsCacheContext';
import { createAnthropicProvider } from './providers/anthropicClient';
import { createOpenAIProvider } from './providers/openaiClient';
import { createOllamaProvider } from './providers/ollamaProvider';
import type { ChatProvider } from './providers/types';

export interface ChatMsg {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    streaming?: boolean;
}

export interface ToolCallStatus {
    id: string;
    name: string;
    status: 'running' | 'done';
}

export function useChat(logs: ILogData[], ollamaEnabled: boolean) {
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [streaming, setStreaming] = useState(false);
    const [thinking, setThinking] = useState(false);
    const [toolCalls, setToolCalls] = useState<ToolCallStatus[]>([]);
    const [ollamaConnected, setOllamaConnected] = useState(false);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [aiSettings, setAiSettings] = useState<IAiSettings>({
        provider: 'ollama',
        anthropicApiKey: '',
        anthropicModel: 'claude-sonnet-4-6',
        openaiApiKey: '',
        openaiModel: 'gpt-4o',
    });
    const messagesRef = useRef<ChatMsg[]>([]);
    const detailsCache = useContext(DetailsCacheContext);

    useEffect(() => { messagesRef.current = messages; }, [messages]);

    useEffect(() => {
        window.electronAPI.getAiSettings().then(setAiSettings).catch(() => {});
    }, []);

    useEffect(() => {
        if (!ollamaEnabled) return;
        let cancelled = false;
        window.electronAPI.getOllamaStatus().then(status => {
            if (!cancelled) {
                setOllamaConnected(status.connected);
                setAvailableModels(status.models);
            }
        });
        const unsub = window.electronAPI.onOllamaStatusChanged(status => {
            setOllamaConnected(status.connected);
            setAvailableModels(status.models);
        });
        return () => { cancelled = true; unsub(); };
    }, [ollamaEnabled]);

    const connected = aiSettings.provider === 'anthropic'
        ? !!aiSettings.anthropicApiKey
        : aiSettings.provider === 'openai'
            ? !!aiSettings.openaiApiKey
            : ollamaConnected;

    const provider = useMemo<ChatProvider>(() => {
        if (aiSettings.provider === 'anthropic' && aiSettings.anthropicApiKey) {
            return createAnthropicProvider(aiSettings.anthropicApiKey, aiSettings.anthropicModel);
        }
        if (aiSettings.provider === 'openai' && aiSettings.openaiApiKey) {
            return createOpenAIProvider(aiSettings.openaiApiKey, aiSettings.openaiModel);
        }
        return createOllamaProvider();
    }, [aiSettings]);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || streaming) return;

        const userMsg: ChatMsg = { id: crypto.randomUUID(), role: 'user', content: text };
        const assistantId = crypto.randomUUID();

        setMessages(prev => [
            ...prev,
            userMsg,
            { id: assistantId, role: 'assistant', content: '', streaming: true },
        ]);
        setStreaming(true);
        setThinking(true);
        setToolCalls([]);

        const systemPrompt = buildSystemPrompt(logs);
        const history: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...messagesRef.current.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ];

        const handleToolCall = (name: string, status: 'running' | 'done') => {
            setThinking(false);
            setToolCalls(prev => {
                if (status === 'running') {
                    return [...prev, { id: crypto.randomUUID(), name, status }];
                }
                return prev.map(t => t.name === name && t.status === 'running' ? { ...t, status: 'done' } : t);
            });
        };

        let buffer = '';
        const handleToken = (token: string, done: boolean) => {
            setThinking(false);
            buffer += token;
            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: buffer, streaming: !done }
                    : m
            ));
            if (done) setStreaming(false);
        };

        try {
            await agentLoop(text, history, logs, (id) => detailsCache?.peek(id), handleToolCall, handleToken, provider);
        } catch (err: any) {
            const apiErr = err?.message ?? '';
            const isNetworkErr = apiErr.toLowerCase().includes('failed to fetch') || apiErr.toLowerCase().includes('network');
            const content = err instanceof ToolUseNotSupportedError
                ? err.message
                : isNetworkErr && aiSettings.provider !== 'ollama'
                    ? 'Request failed — the context may be too large. Try asking a more specific question (e.g. "what can we improve?" instead of an open-ended one).'
                    : aiSettings.provider === 'anthropic'
                        ? `Error calling Anthropic API: ${apiErr}`
                        : aiSettings.provider === 'openai'
                            ? `Error calling OpenAI API: ${apiErr}`
                            : 'Error: could not reach Ollama. Is it still running?';
            setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content, streaming: false } : m
            ));
            setStreaming(false);
            setThinking(false);
        }
    }, [logs, streaming, detailsCache, provider, aiSettings]);

    const clearMessages = useCallback(() => {
        setMessages([]);
        setToolCalls([]);
    }, []);

    return { messages, streaming, thinking, toolCalls, ollamaConnected, connected, aiSettings, availableModels, sendMessage, clearMessages };
}
