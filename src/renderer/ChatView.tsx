import { useState, useRef, useEffect, useCallback } from 'react';
import { Maximize2, X, Send, Bot } from 'lucide-react';
import { useChat } from './chat/useChat';

const SUGGESTION_PILLS = [
    'Summarize tonight\'s fights',
    'Who topped damage?',
    'Who had the best stability uptime?',
    'Were there any fights we wiped on?',
    'Which fight had the best boon coverage?',
];

interface ChatViewProps {
    logs: ILogData[];
    compact: boolean;
    ollamaEnabled: boolean;
    onNavigateToChat: () => void;
    onClose?: () => void;
    ollamaConnected?: boolean;
}

export function ChatView({ logs, compact, ollamaEnabled, onNavigateToChat, onClose, ollamaConnected: connectedProp }: ChatViewProps) {
    const { messages, streaming, ollamaConnected: hookConnected, sendMessage } = useChat(logs, ollamaEnabled);
    const connected = connectedProp ?? hookConnected;
    const [input, setInput] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    const hasMessages = messages.length > 0;

    useEffect(() => {
        bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = useCallback((text: string) => {
        if (!text.trim() || streaming || !connected) return;
        sendMessage(text);
        setInput('');
    }, [streaming, connected, sendMessage]);

    if (!connected) {
        return (
            <div className="flex flex-col flex-1 items-center justify-center gap-3 p-6 text-center">
                {compact && (
                    <div className="flex items-center justify-between w-full mb-2" data-compact-header>
                        <span className="text-xs font-semibold text-gray-300">AI Assistant</span>
                        <div className="flex gap-1">
                            <button title="Expand" onClick={onNavigateToChat} className="p-1 text-gray-400 hover:text-gray-200">
                                <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                            {onClose && <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200"><X className="w-3.5 h-3.5" /></button>}
                        </div>
                    </div>
                )}
                <Bot className="w-8 h-8 text-gray-600" />
                <p className="text-sm text-gray-400">Ollama isn't connected</p>
                <p className="text-xs text-gray-600">Start Ollama or check your settings</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {compact ? (
                <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--border-subtle)' }} data-compact-header>
                    <div className="flex items-center gap-2">
                        <Bot className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-xs font-semibold text-gray-300">AI Assistant</span>
                        <span className="text-xs text-gray-600">{logs.filter(l => l.detailsStatus === 'loaded').length} fights</span>
                    </div>
                    <div className="flex gap-1">
                        <button title="Expand" onClick={onNavigateToChat} className="p-1 text-gray-400 hover:text-gray-200 transition-colors">
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                        {onClose && (
                            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200 transition-colors">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-center gap-2 px-4 py-2 border-b shrink-0 text-xs text-gray-500" style={{ borderColor: 'var(--border-subtle)' }}>
                    <Bot className="w-3.5 h-3.5 text-blue-400" />
                    <span>AI Assistant</span>
                    <span>·</span>
                    <span>{logs.filter(l => l.detailsStatus === 'loaded').length} fights loaded</span>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
                {!hasMessages && (
                    <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center">
                        <Bot className="w-8 h-8 text-gray-600" />
                        <p className="text-sm text-gray-400">Ask anything about your loaded fights</p>
                    </div>
                )}
                {messages.map(msg => (
                    <div
                        key={msg.id}
                        className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                            msg.role === 'user'
                                ? 'self-end bg-blue-600/30 border border-blue-500/40 text-gray-100'
                                : 'self-start bg-gray-800 border border-gray-700 text-gray-200'
                        }`}
                    >
                        {msg.content}
                        {msg.streaming && <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-blue-400 animate-pulse rounded-sm" />}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Pills + Input */}
            <div className="shrink-0 px-3 pb-3 flex flex-col gap-2">
                {!hasMessages && (
                    <div className="flex flex-wrap gap-1.5">
                        {SUGGESTION_PILLS.map(pill => (
                            <button
                                key={pill}
                                onClick={() => handleSubmit(pill)}
                                className="text-xs px-3 py-1.5 rounded-full border border-gray-700 bg-gray-800 text-gray-300 hover:border-blue-500/50 hover:text-gray-100 transition-colors"
                            >
                                {pill}
                            </button>
                        ))}
                    </div>
                )}
                <form
                    onSubmit={e => { e.preventDefault(); handleSubmit(input); }}
                    className="flex gap-2 items-center"
                >
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Ask about your fights..."
                        disabled={streaming}
                        className="flex-1 text-sm px-3 py-2 rounded-md border bg-gray-900 text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                        style={{ borderColor: 'var(--border-default)' }}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || streaming}
                        className="p-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Send className="w-4 h-4 text-white" />
                    </button>
                </form>
            </div>
        </div>
    );
}
