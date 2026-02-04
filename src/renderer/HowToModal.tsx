import { AnimatePresence, motion } from 'framer-motion';
import {
    Activity,
    AlertTriangle,
    ArrowUp,
    BarChart2,
    Check,
    ChevronRight,
    Clock,
    Database,
    Droplet,
    FileText,
    Folder,
    Github,
    Globe,
    Heart,
    HelpCircle,
    Layers,
    LayoutDashboard,
    Link,
    ListTree,
    MousePointer,
    Palette,
    Plug,
    Rocket,
    Settings,
    Shield,
    Sliders,
    Upload,
    X
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import howToTree from '../../docs/support/how-to-tree.json';

interface HowToModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface HelpNode {
    id: string;
    title: string;
    summary?: string;
    content?: string;
    children?: HelpNode[];
}

const ROOT = howToTree as HelpNode;

const ICON_MAP: Record<string, ReactNode> = {
    activity: <Activity className="w-5 h-5 text-blue-400 inline-block mb-1 mx-1" />,
    'bar-chart': <BarChart2 className="w-5 h-5 text-purple-400 inline-block mb-1 mx-1" />,
    settings: <Settings className="w-5 h-5 text-slate-400 inline-block mb-1 mx-1" />,
    github: <Github className="w-5 h-5 text-white inline-block mb-1 mx-1" />,
    database: <Database className="w-5 h-5 text-emerald-400 inline-block mb-1 mx-1" />,
    upload: <Upload className="w-4 h-4 text-sky-400 inline-block mx-1" />,
    layers: <Layers className="w-5 h-5 text-indigo-400 inline-block mb-1 mx-1" />,
    file: <FileText className="w-5 h-5 text-amber-400 inline-block mb-1 mx-1" />,
    globe: <Globe className="w-4 h-4 text-blue-300 inline-block mx-1" />,
    dashboard: <LayoutDashboard className="w-5 h-5 text-orange-400 inline-block mb-1 mx-1" />,
    clock: <Clock className="w-4 h-4 text-yellow-400 inline-block mx-1" />,
    check: <Check className="w-4 h-4 text-green-400 inline-block mx-1" />,
    error: <AlertTriangle className="w-4 h-4 text-red-400 inline-block mx-1" />,
    shield: <Shield className="w-4 h-4 text-indigo-400 inline-block mx-1" />,
    heart: <Heart className="w-4 h-4 text-rose-400 inline-block mx-1" />,
    'arrow-up': <ArrowUp className="w-4 h-4 text-cyan-400 inline-block mx-1" />,
    droplet: <Droplet className="w-4 h-4 text-red-500 inline-block mx-1" />,
    sliders: <Sliders className="w-5 h-5 text-gray-400 inline-block mb-1 mx-1" />,
    palette: <Palette className="w-5 h-5 text-pink-400 inline-block mb-1 mx-1" />,
    plug: <Plug className="w-5 h-5 text-yellow-200 inline-block mb-1 mx-1" />,
    rocket: <Rocket className="w-5 h-5 text-fuchsia-400 inline-block mb-1 mx-1" />,
    link: <Link className="w-4 h-4 text-blue-300 inline-block mx-1" />,
    folder: <Folder className="w-5 h-5 text-yellow-500 inline-block mb-1 mx-1" />,
    'help-circle': <HelpCircle className="w-4 h-4 text-indigo-300 inline-block mx-1" />,
    'mouse-pointer': <MousePointer className="w-4 h-4 text-slate-300 inline-block mx-1" />,
    'list-tree': <ListTree className="w-4 h-4 text-blue-300 inline-block mx-1" />,
    arcbridge: <img src="/img/ArcBridge.svg" className="w-5 h-5 inline-block mb-1 mx-1" alt="" />
};

const buildNodeIndex = (root: HelpNode) => {
    const byId = new Map<string, HelpNode>();
    const parentById = new Map<string, string | null>();
    const walk = (node: HelpNode, parentId: string | null) => {
        byId.set(node.id, node);
        parentById.set(node.id, parentId);
        (node.children || []).forEach((child) => walk(child, node.id));
    };
    walk(root, null);
    return { byId, parentById };
};

const { byId, parentById } = buildNodeIndex(ROOT);

const getBreadcrumb = (nodeId: string): HelpNode[] => {
    const chain: HelpNode[] = [];
    let currentId: string | null = nodeId;
    while (currentId) {
        const node = byId.get(currentId);
        if (!node) break;
        chain.unshift(node);
        currentId = parentById.get(currentId) ?? null;
    }
    return chain;
};

const renderTree = (node: HelpNode, selectedId: string, onSelect: (id: string) => void, depth = 0): ReactNode => {
    const active = node.id === selectedId;
    const hasChildren = (node.children || []).length > 0;
    return (
        <div key={node.id} className="space-y-1">
            <button
                type="button"
                onClick={() => onSelect(node.id)}
                className={`w-full rounded-lg border px-2 py-2 text-left text-xs transition-colors ${active
                    ? 'border-blue-500/40 bg-blue-500/15 text-blue-100'
                    : 'border-white/10 bg-white/[0.03] text-gray-300 hover:border-white/30 hover:text-white'
                    }`}
            >
                <div className="font-semibold">{node.title}</div>
                {node.summary && depth < 2 && (
                    <div className={`mt-0.5 text-[11px] ${active ? 'text-blue-200/80' : 'text-gray-500'}`}>
                        {node.summary}
                    </div>
                )}
            </button>
            {hasChildren && (
                <div className="ml-3 border-l border-white/10 pl-2 space-y-1">
                    {(node.children || []).map((child) => renderTree(child, selectedId, onSelect, depth + 1))}
                </div>
            )}
        </div>
    );
};

export function HowToModal({ isOpen, onClose }: HowToModalProps) {
    const [selectedId, setSelectedId] = useState(ROOT.id);

    useEffect(() => {
        if (isOpen) {
            setSelectedId(ROOT.id);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const selectedNode = byId.get(selectedId) || ROOT;
    const breadcrumb = getBreadcrumb(selectedNode.id);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[74] flex items-center justify-center bg-black/70 backdrop-blur-md"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 18 }}
                    transition={{ duration: 0.2 }}
                    className="w-full max-w-6xl mx-4 h-[min(82vh,860px)] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900/95 to-blue-950/40 shadow-[0_20px_80px_rgba(0,0,0,0.6)] flex flex-col"
                >
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
                        <div className="flex items-center gap-3">
                            <div className="rounded-xl border border-blue-500/30 bg-blue-500/20 p-2">
                                <ListTree className="h-5 w-5 text-blue-200" />
                            </div>
                            <div>
                                <div className="text-lg font-bold text-white">How To</div>
                                <div className="text-xs text-gray-400">Feature and workflow reference</div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] flex-1 min-h-0">
                        <aside className="border-r border-white/10 bg-black/20 p-3 overflow-y-auto">
                            <div className="mb-3 px-1 py-1">
                                <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Guide Map</div>
                                <div className="mt-1 text-xs text-gray-400">Browse by feature area</div>
                            </div>
                            <div className="space-y-2">
                                {renderTree(ROOT, selectedNode.id, setSelectedId)}
                            </div>
                        </aside>
                        <section className="p-6 overflow-y-auto">
                            <div className="flex flex-wrap items-center gap-1 text-xs text-gray-400 mb-4">
                                {breadcrumb.map((node, idx) => (
                                    <div key={node.id} className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(node.id)}
                                            className={`transition-colors ${idx === breadcrumb.length - 1 ? 'text-blue-200' : 'text-gray-400 hover:text-white'
                                                }`}
                                        >
                                            {node.title}
                                        </button>
                                        {idx < breadcrumb.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-gray-500" />}
                                    </div>
                                ))}
                            </div>

                            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                                {selectedNode.id === 'arcbridge' && (
                                    <img src="/img/ArcBridge.svg" className="h-6 w-6" alt="ArcBridge" />
                                )}
                                {selectedNode.title}
                            </h3>
                            {selectedNode.summary && (
                                <p className="text-sm text-gray-300 mt-2">{selectedNode.summary}</p>
                            )}

                            {selectedNode.content && (
                                <div className="mt-4 text-sm text-gray-200 leading-6 prose prose-invert max-w-none prose-p:my-3 prose-li:my-1">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        urlTransform={(url) => url}
                                        components={{
                                            img: ({ src, alt }) => {
                                                if (src?.startsWith('icon:')) {
                                                    const iconKey = src.replace('icon:', '');
                                                    return <span title={alt}>{ICON_MAP[iconKey] || null}</span>;
                                                }
                                                return <img src={src} alt={alt} className="rounded-lg" />;
                                            },
                                            h1: ({ children }) => <h1 className="text-2xl font-bold text-white flex items-center">{children}</h1>,
                                            h2: ({ children }) => <h2 className="text-xl font-semibold text-white mt-5 flex items-center">{children}</h2>,
                                            h3: ({ children }) => <h3 className="text-lg font-semibold text-white mt-4 flex items-center">{children}</h3>,
                                            p: ({ children }) => <p className="my-3 leading-6 text-gray-200">{children}</p>,
                                            ul: ({ children }) => <ul className="my-3 list-disc pl-5 space-y-1 text-gray-200">{children}</ul>,
                                            ol: ({ children }) => <ol className="my-3 list-decimal pl-5 space-y-1 text-gray-200">{children}</ol>,
                                            li: ({ children }) => <li className="leading-6">{children}</li>,
                                            strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                                            a: ({ href, children }) => (
                                                <button
                                                    type="button"
                                                    className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                                                    onClick={() => href && window.electronAPI?.openExternal?.(href)}
                                                >
                                                    {children}
                                                </button>
                                            ),
                                            code: ({ children }) => (
                                                <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-blue-200">{children}</code>
                                            ),
                                            blockquote: ({ children }) => (
                                                <blockquote className="my-3 border-l-2 border-blue-400/40 pl-3 italic text-gray-300">
                                                    {children}
                                                </blockquote>
                                            )
                                        }}
                                    >
                                        {selectedNode.content}
                                    </ReactMarkdown>
                                </div>
                            )}

                            {(selectedNode.children || []).length > 0 && (
                                <div className="mt-6">
                                    <div className="text-xs uppercase tracking-wider text-gray-400 mb-3">Children</div>
                                    <div className="grid gap-2">
                                        {selectedNode.children?.map((child) => (
                                            <button
                                                key={child.id}
                                                type="button"
                                                onClick={() => setSelectedId(child.id)}
                                                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left hover:bg-white/[0.08] transition-colors"
                                            >
                                                <div className="text-sm font-medium text-white">{child.title}</div>
                                                {child.summary && <div className="text-xs text-gray-400 mt-1">{child.summary}</div>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
