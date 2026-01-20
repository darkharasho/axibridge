import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal as TerminalIcon, Trash2, ChevronDown } from 'lucide-react';

interface LogEntry {
    type: 'info' | 'error';
    message: string;
    timestamp: string;
}

interface TerminalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function Terminal({ isOpen, onClose }: TerminalProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [logs, isOpen]);

    useEffect(() => {
        // Subscribe to logs from main process
        const cleanup = window.electronAPI.onConsoleLog((log: LogEntry) => {
            setLogs(prev => [...prev, log]);
        });

        return () => cleanup();
    }, []);

    const clearLogs = () => {
        setLogs([]);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="fixed bottom-0 left-0 right-0 h-[50vh] bg-[#0f172a] border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-50 flex flex-col font-mono"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-2 text-gray-400">
                            <TerminalIcon className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">System Terminal</span>
                            <span className="text-xs text-gray-600">|</span>
                            <span className="text-xs text-gray-500">{logs.length} events</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={clearLogs}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                                title="Clear Terminal"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                            <div className="w-px h-4 bg-white/10 mx-1" />
                            <button
                                onClick={onClose}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                                title="Close Terminal"
                            >
                                <ChevronDown className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {logs.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50">
                                <TerminalIcon className="w-12 h-12 mb-2" />
                                <span className="text-sm">No logs recorded</span>
                            </div>
                        ) : (
                            logs.map((log, index) => (
                                <div key={index} className="flex gap-3 text-xs md:text-sm group hover:bg-white/5 p-1 -mx-1 rounded px-2">
                                    <span className="text-gray-600 shrink-0 select-none">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </span>
                                    <div className={`flex-1 break-all whitespace-pre-wrap ${log.type === 'error' ? 'text-red-400' : 'text-gray-300'
                                        }`}>
                                        {log.type === 'error' && <span className="text-red-500 font-bold mr-2">[ERROR]</span>}
                                        {log.message}
                                    </div>
                                </div>
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
