import { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Maximize2, X, Send, Bot, Play, Loader2, CheckCircle2, PenSquare } from 'lucide-react';
import { useChat, type ChatMsg, type ToolCallStatus } from './chat/useChat';

const TOOL_DISPLAY: Record<string, string> = {
    player_deep_dive: 'Analyzing player',
    rank_players: 'Ranking players',
    boon_analysis: 'Analyzing boons',
    group_breakdown: 'Breaking down groups',
    compare_fights: 'Comparing fights',
    incoming_skill_damage: 'Analyzing incoming skills',
    squad_skill_damage: 'Analyzing squad skills',
    healing_stats: 'Analyzing healing',
    conditions_applied: 'Analyzing conditions',
    damage_mitigation: 'Analyzing mitigation',
    spike_damage: 'Analyzing spike damage',
};

function ToolCallBadge({ name, status }: { name: string; status: 'running' | 'done' }) {
    const label = TOOL_DISPLAY[name] ?? name;
    return (
        <div className={`flex items-center gap-1.5 text-xs py-1 ${status === 'done' ? 'text-green-400' : 'text-gray-500'}`}>
            {status === 'running'
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <CheckCircle2 className="w-3 h-3" />}
            <span>{label}</span>
        </div>
    );
}

const MD_COMPONENTS = {
    p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
    ol: ({ children }: any) => <ol className="list-decimal ml-4 mb-2 space-y-0.5">{children}</ol>,
    ul: ({ children }: any) => <ul className="list-disc ml-4 mb-2 space-y-0.5">{children}</ul>,
    li: ({ children }: any) => <li>{children}</li>,
    h1: ({ children }: any) => <h1 className="font-bold text-base mb-1 mt-2">{children}</h1>,
    h2: ({ children }: any) => <h2 className="font-semibold text-sm mb-1 mt-2">{children}</h2>,
    h3: ({ children }: any) => <h3 className="font-semibold text-sm mb-1 mt-2">{children}</h3>,
    strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
    code: ({ children, className }: any) =>
        className
            ? <pre className="bg-gray-900 rounded p-2 my-1 text-xs overflow-x-auto"><code>{children}</code></pre>
            : <code className="bg-gray-900 rounded px-1 text-xs font-mono">{children}</code>,
    blockquote: ({ children }: any) => <blockquote className="border-l-2 border-gray-600 pl-2 italic text-gray-400 my-1">{children}</blockquote>,
};

const SUGGESTION_PILLS = [
    'Summarize tonight\'s fights',
    'Who topped damage?',
    'Who had the best stability uptime?',
    'Were there any fights we wiped on?',
    'Which fight had the best boon coverage?',
];

export interface ChatState {
    messages: ChatMsg[];
    streaming: boolean;
    thinking: boolean;
    toolCalls: ToolCallStatus[];
    ollamaConnected: boolean;
    availableModels: string[];
    sendMessage: (text: string) => void;
    clearMessages: () => void;
}

interface ChatViewProps {
    logs: ILogData[];
    compact: boolean;
    ollamaEnabled: boolean;
    onNavigateToChat: () => void;
    onClose?: () => void;
    ollamaConnected?: boolean;
    chatState?: ChatState;
}

export function ChatView({ logs, compact, ollamaEnabled, onNavigateToChat, onClose, ollamaConnected: connectedProp, chatState: externalState }: ChatViewProps) {
    const internalChat = useChat(logs, ollamaEnabled);
    const { messages, streaming, thinking, toolCalls, ollamaConnected: hookConnected, sendMessage, clearMessages } = externalState ?? internalChat;
    const connected = connectedProp ?? hookConnected;
    const [input, setInput] = useState('');
    const [starting, setStarting] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const hasMessages = messages.length > 0;

    useEffect(() => {
        bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = useCallback((text: string) => {
        if (!text.trim() || streaming || !connected) return;
        sendMessage(text);
        setInput('');
        requestAnimationFrame(() => inputRef.current?.focus());
    }, [streaming, connected, sendMessage]);

    const handleStartOllama = useCallback(async () => {
        setStarting(true);
        await window.electronAPI.startOllama();
        setStarting(false);
    }, []);

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
                <button
                    onClick={handleStartOllama}
                    disabled={starting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                >
                    <Play className="w-3 h-3" />
                    {starting ? 'Starting…' : 'Start Ollama'}
                </button>
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
                        {hasMessages && (
                            <button title="New chat" onClick={clearMessages} disabled={streaming} className="p-1 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40">
                                <PenSquare className="w-3.5 h-3.5" />
                            </button>
                        )}
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
                <div className="flex items-center justify-between px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Bot className="w-3.5 h-3.5 text-blue-400" />
                        <span>AI Assistant</span>
                        <span>·</span>
                        <span>{logs.filter(l => l.detailsStatus === 'loaded').length} fights loaded</span>
                    </div>
                    {hasMessages && (
                        <button title="New chat" onClick={clearMessages} disabled={streaming} className="p-1 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40">
                            <PenSquare className="w-3.5 h-3.5" />
                        </button>
                    )}
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
                {messages.map((msg, idx) => {
                    const isLastAssistant = msg.role === 'assistant' && !messages.slice(idx + 1).some(m => m.role === 'assistant');
                    return (
                        <Fragment key={msg.id}>
                            {isLastAssistant && toolCalls.length > 0 && (
                                <div className="self-start flex flex-col gap-0.5 px-1">
                                    {toolCalls.map(tc => (
                                        <ToolCallBadge key={tc.id} name={tc.name} status={tc.status} />
                                    ))}
                                </div>
                            )}
                            <div
                                className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                                    msg.role === 'user'
                                        ? 'self-end bg-blue-600/30 border border-blue-500/40 text-gray-100'
                                        : 'self-start bg-gray-800 border border-gray-700 text-gray-200'
                                }`}
                            >
                                {msg.streaming && !msg.content ? (
                                    <span className="flex gap-1 items-center h-4">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </span>
                                ) : msg.role === 'assistant' ? (
                                    <>
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                                            {msg.content}
                                        </ReactMarkdown>
                                        {msg.streaming && <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-blue-400 animate-pulse rounded-sm" />}
                                    </>
                                ) : (
                                    msg.content
                                )}
                            </div>
                        </Fragment>
                    );
                })}
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
                {thinking ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Thinking...</span>
                    </div>
                ) : (
                    <form
                        onSubmit={e => { e.preventDefault(); handleSubmit(input); }}
                        className="flex gap-2 items-center"
                    >
                        <input
                            ref={inputRef}
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
                )}
            </div>
        </div>
    );
}
