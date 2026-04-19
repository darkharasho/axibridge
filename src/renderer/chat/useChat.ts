import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatMessage } from '../global';
import { buildChatContext } from './buildChatContext';

export interface ChatMsg {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    streaming?: boolean;
}

export function useChat(logs: ILogData[], ollamaEnabled: boolean) {
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [streaming, setStreaming] = useState(false);
    const [ollamaConnected, setOllamaConnected] = useState(false);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const messagesRef = useRef<ChatMsg[]>([]);
    const cleanupRef = useRef<(() => void) | null>(null);

    // Keep messagesRef in sync
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Check Ollama status when enabled
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
        return () => {
            cancelled = true;
            unsub();
        };
    }, [ollamaEnabled]);

    // Cleanup token listener on unmount
    useEffect(() => {
        return () => { cleanupRef.current?.(); };
    }, []);

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

        const systemPrompt = buildChatContext(logs);
        const history: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...messagesRef.current.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: text },
        ];

        let buffer = '';
        const unsub = window.electronAPI.onOllamaChatToken(({ token, done }) => {
            buffer += token;
            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: buffer, streaming: !done }
                    : m
            ));
            if (done) {
                setStreaming(false);
                unsub();
            }
        });
        cleanupRef.current = unsub;

        try {
            await window.electronAPI.ollamaChat(history);
        } catch {
            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: 'Error: could not reach Ollama. Is it still running?', streaming: false }
                    : m
            ));
            setStreaming(false);
            unsub();
        }
    }, [logs, streaming]);

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, []);

    return { messages, streaming, ollamaConnected, availableModels, sendMessage, clearMessages };
}
