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
    activity: <Activity className="w-5 h-5 axi-ink-meta inline-block mb-1 mx-1" />,
    'bar-chart': <BarChart2 className="w-5 h-5 axi-ink-meta inline-block mb-1 mx-1" />,
    settings: <Settings className="w-5 h-5 axi-ink-dim inline-block mb-1 mx-1" />,
    github: <Github className="w-5 h-5 axi-ink-plain inline-block mb-1 mx-1" />,
    database: <Database className="w-5 h-5 axi-ink-ok inline-block mb-1 mx-1" />,
    upload: <Upload className="w-4 h-4 axi-ink-meta inline-block mx-1" />,
    layers: <Layers className="w-5 h-5 axi-ink-meta inline-block mb-1 mx-1" />,
    file: <FileText className="w-5 h-5 axi-ink-warn inline-block mb-1 mx-1" />,
    globe: <Globe className="w-4 h-4 axi-ink-meta inline-block mx-1" />,
    dashboard: <LayoutDashboard className="w-5 h-5 axi-ink-warn inline-block mb-1 mx-1" />,
    clock: <Clock className="w-4 h-4 axi-ink-warn inline-block mx-1" />,
    check: <Check className="w-4 h-4 axi-ink-ok inline-block mx-1" />,
    error: <AlertTriangle className="w-4 h-4 axi-ink-danger inline-block mx-1" />,
    'alert-triangle': <AlertTriangle className="w-4 h-4 axi-ink-danger inline-block mx-1" />,
    shield: <Shield className="w-4 h-4 axi-ink-meta inline-block mx-1" />,
    heart: <Heart className="w-4 h-4 axi-ink-danger inline-block mx-1" />,
    'arrow-up': <ArrowUp className="w-4 h-4 axi-ink-meta inline-block mx-1" />,
    droplet: <Droplet className="w-4 h-4 axi-ink-danger inline-block mx-1" />,
    sliders: <Sliders className="w-5 h-5 axi-ink-dim inline-block mb-1 mx-1" />,
    palette: <Palette className="w-5 h-5 axi-ink-meta inline-block mb-1 mx-1" />,
    plug: <Plug className="w-5 h-5 axi-ink-warn inline-block mb-1 mx-1" />,
    rocket: <Rocket className="w-5 h-5 axi-ink-meta inline-block mb-1 mx-1" />,
    link: <Link className="w-4 h-4 axi-ink-meta inline-block mx-1" />,
    folder: <Folder className="w-5 h-5 axi-ink-warn inline-block mb-1 mx-1" />,
    'help-circle': <HelpCircle className="w-4 h-4 axi-ink-meta inline-block mx-1" />,
    'mouse-pointer': <MousePointer className="w-4 h-4 axi-ink-dim inline-block mx-1" />,
    'list-tree': <ListTree className="w-4 h-4 axi-ink-meta inline-block mx-1" />,
    axibridge: (
        <span
            className="axibridge-logo w-5 h-5 inline-block mb-1 mx-1"
            style={{ WebkitMaskImage: `url(${import.meta.env.BASE_URL || './'}svg/AxiBridge.svg)`, maskImage: `url(${import.meta.env.BASE_URL || './'}svg/AxiBridge.svg)` }}
            aria-label="AxiBridge logo"
        />
    )
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
                aria-current={active ? 'location' : undefined}
                className="axi-rail__item flex-col items-start"
            >
                <div className="font-semibold">{node.title}</div>
                {node.summary && depth < 2 && (
                    <div className={`mt-0.5 text-[11px] ${active ? 'axi-ink-meta' : 'axi-ink-faint'}`}>
                        {node.summary}
                    </div>
                )}
            </button>
            {hasChildren && (
                <div className="ml-3 border-l axi-edge-rule pl-2 space-y-1">
                    {(node.children || []).map((child) => renderTree(child, selectedId, onSelect, depth + 1))}
                </div>
            )}
        </div>
    );
};

export function HowToModal({ isOpen, onClose, isBulkUploadActive }: HowToModalProps & { isBulkUploadActive?: boolean }) {
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
        <AnimatePresence initial={false}>
            <motion.div
                initial={isBulkUploadActive ? undefined : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={isBulkUploadActive ? undefined : { opacity: 0 }}
                className="app-modal-overlay axi-scrim flex items-center justify-center"
                style={{ zIndex: 74 }}
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={isBulkUploadActive ? undefined : { opacity: 0, scale: 0.96, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={isBulkUploadActive ? undefined : { opacity: 0, scale: 0.96, y: 18 }}
                    transition={{ duration: 0.2 }}
                    /* No __body: the content is a two-column grid with its own rule down
                       the middle, which is a layout rather than the modal's text block. */
                    className="app-modal-card axi-modal mx-4 h-[min(82vh,860px)] overflow-hidden flex flex-col"
                    style={{ '--axi-modal-width': '1152px' } as React.CSSProperties}
                >
                    <div className="axi-modal__head justify-between">
                        <div className="flex items-center gap-3">
                            <div className="axi-well axi-well--sm axi-edge-meta [--axi-well-pad:8px]">
                                <ListTree className="h-5 w-5 axi-ink-meta" />
                            </div>
                            <div>
                                <div className="text-lg font-bold axi-ink-plain">How To</div>
                                <div className="text-xs axi-ink-dim">Feature and workflow reference</div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="axi-btn axi-btn--icon axi-ink-dim"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] flex-1 min-h-0">
                        <aside className="min-h-0 p-3 overflow-y-auto overscroll-contain" style={{ borderRight: 'var(--axi-border-control) solid var(--axi-ink-line)', background: 'var(--axi-surface-paint)' }}>
                            <div className="mb-3 px-1 py-1">
                                <div className="text-[11px] uppercase tracking-[0.24em] axi-ink-faint">Guide Map</div>
                                <div className="mt-1 text-xs axi-ink-dim">Browse by feature area</div>
                            </div>
                            <div className="space-y-2">
                                {renderTree(ROOT, selectedNode.id, setSelectedId)}
                            </div>
                        </aside>
                        <section className="min-h-0 p-6 overflow-y-auto overscroll-contain">
                            <div className="flex flex-wrap items-center gap-1 text-xs axi-ink-dim mb-4">
                                {breadcrumb.map((node, idx) => (
                                    <div key={node.id} className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(node.id)}
                                            className={`axi-action ${idx === breadcrumb.length - 1 ? 'axi-ink-meta' : 'axi-ink-dim'
                                                }`}
                                        >
                                            {node.title}
                                        </button>
                                        {idx < breadcrumb.length - 1 && <ChevronRight className="h-3.5 w-3.5 axi-ink-faint" />}
                                    </div>
                                ))}
                            </div>

                            <h3 className="text-xl font-semibold axi-ink-plain flex items-center gap-2">
                                {selectedNode.id === 'axibridge' && (
                                    <span
                                        className="axibridge-logo h-6 w-6"
                                        style={{ WebkitMaskImage: `url(${import.meta.env.BASE_URL || './'}svg/AxiBridge.svg)`, maskImage: `url(${import.meta.env.BASE_URL || './'}svg/AxiBridge.svg)` }}
                                        aria-label="AxiBridge logo"
                                    />
                                )}
                                {selectedNode.title}
                            </h3>
                            {selectedNode.summary && (
                                <p className="text-sm axi-ink-dim mt-2">{selectedNode.summary}</p>
                            )}

                            {/* `.axi-prose` is the language's typography for rendered
                                markdown: h1-h4, p, strong, a, ul, ol, li, code, pre,
                                blockquote, table, th, td, hr and img. Everything this
                                component's `components` map used to spell out by hand.

                                What it replaced was worse than duplication: the container
                                asked for `prose prose-invert prose-p:my-3 prose-li:my-1`,
                                and @tailwindcss/typography is not a dependency of this
                                app — so those four classes emitted nothing, and the
                                hand-written map below them was the only typography there
                                had ever been.

                                Two overrides survive, and both are behaviour rather than
                                style. `img` implements this content's own `icon:` protocol
                                against ICON_MAP. `a` has to be a <button> calling
                                openExternal, because an <a href> inside Electron navigates
                                the renderer instead of opening a browser. The headings keep
                                `flex items-center` and nothing else: 83 of the 129 icon
                                refs in how-to-tree.json sit on a heading line, and without
                                it the icon does not sit on the text's baseline. */}
                            {selectedNode.content && (
                                <div className="axi-prose mt-4 max-w-none">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        urlTransform={(url) => url}
                                        components={{
                                            img: ({ src, alt }) => {
                                                if (src?.startsWith('icon:')) {
                                                    const iconKey = src.replace('icon:', '');
                                                    return <span title={alt}>{ICON_MAP[iconKey] || null}</span>;
                                                }
                                                return <img src={src} alt={alt} />;
                                            },
                                            h1: ({ children }) => <h1 className="flex items-center">{children}</h1>,
                                            h2: ({ children }) => <h2 className="flex items-center">{children}</h2>,
                                            h3: ({ children }) => <h3 className="flex items-center">{children}</h3>,
                                            a: ({ href, children }) => (
                                                <button
                                                    type="button"
                                                    className="axi-link"
                                                    onClick={() => href && window.electronAPI?.openExternal?.(href)}
                                                >
                                                    {children}
                                                </button>
                                            ),
                                        }}
                                    >
                                        {selectedNode.content}
                                    </ReactMarkdown>
                                </div>
                            )}

                            {(selectedNode.children || []).length > 0 && (
                                <div className="mt-6">
                                    <div className="text-xs uppercase tracking-wider axi-ink-dim mb-3">In this section</div>
                                    <div className="grid gap-2">
                                        {selectedNode.children?.map((child) => (
                                            <button
                                                key={child.id}
                                                type="button"
                                                onClick={() => setSelectedId(child.id)}
                                                className="axi-rail__item flex-col items-start"
                                            >
                                                <div className="text-sm font-medium axi-ink-plain">{child.title}</div>
                                                {child.summary && <div className="text-xs axi-ink-dim mt-1">{child.summary}</div>}
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
