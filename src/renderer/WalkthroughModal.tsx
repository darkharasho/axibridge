import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, FileText, LineChart, Rocket, X, Zap } from 'lucide-react';

interface WalkthroughModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLearnMore?: () => void;
}

const STEPS = [
    {
        icon: FileText,
        title: 'Collect your logs',
        description: 'AxiBridge watches your arcdps logs folder and pulls in each fight so you can review and share it quickly.'
    },
    {
        icon: LineChart,
        title: 'Understand performance',
        description: 'Use dashboard and stats views to spot wins/losses, squad trends, top performers, and key fight-level details.'
    },
    {
        icon: Rocket,
        title: 'Share your results',
        description: 'Post polished summaries to Discord or publish a web report, depending on how you want your squad to consume data.'
    },
    {
        icon: Zap,
        title: 'Maximize accuracy',
        description: 'Logs are parsed locally on your own machine — no file size limits, works offline, nothing to install. The Axilog parser ships with the app and reads a full raid log in about a second.'
    }
] as const;

export function WalkthroughModal({ isOpen, onClose, onLearnMore }: WalkthroughModalProps) {
    if (!isOpen) return null;
    const appIconPath = `${import.meta.env.BASE_URL || './'}svg/axibridge-glyph.svg`;
    const axibridgeLogoStyle = { WebkitMaskImage: `url(${appIconPath})`, maskImage: `url(${appIconPath})` } as const;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="app-modal-overlay axi-scrim flex items-center justify-center"
                style={{ zIndex: 72 }}
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 18 }}
                    transition={{ duration: 0.2 }}
                    className="app-modal-card axi-modal mx-4 overflow-hidden"
                    style={{ '--axi-modal-width': '768px' } as React.CSSProperties}
                >
                    <div className="axi-modal__head justify-between">
                        <div className="flex items-center gap-3">
                            <div className="rounded-[4px] border axi-edge-meta bg-blue-500/20 p-1.5">
                                <span className="axibridge-logo h-7 w-7 rounded-lg" style={axibridgeLogoStyle} aria-label="AxiBridge logo" />
                            </div>
                            <div>
                                <div className="text-lg font-bold axi-ink-plain">Welcome to AxiBridge</div>
                                <div className="text-xs axi-ink-dim">A quick overview of what this app does</div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="axi-btn axi-btn--icon axi-ink-dim"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="axi-modal__body">
                        <div className="grid gap-3">
                            {STEPS.map((step, idx) => {
                                const Icon = step.icon;
                                return (
                                    <div
                                        key={step.title}
                                        className="axi-well axi-well--sm flex gap-4 items-start"
                                        style={{ background: 'var(--bg-card-inner)', border: 'var(--panel-border-w, 1px) solid var(--border-default)' }}
                                    >
                                        <div className="mt-0.5 rounded-[4px] border axi-edge-meta bg-blue-500/15 p-2">
                                            <Icon className="w-4 h-4 axi-ink-meta" />
                                        </div>
                                        <div>
                                            <div className="text-xs uppercase tracking-wider axi-ink-meta font-semibold">
                                                Step {idx + 1}
                                            </div>
                                            <div className="text-sm font-semibold axi-ink-plain mt-1">{step.title}</div>
                                            <div className="text-sm axi-ink-dim mt-1 leading-6">{step.description}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--border-default)' }}>
                        <button
                            onClick={() => onLearnMore?.()}
                            className="axi-btn axi-ink-plain"
                        >
                            <BookOpen className="w-3.5 h-3.5" />
                            How-To Guide
                        </button>
                        <button
                            onClick={onClose}
                            className="axi-btn axi-ink-meta axi-edge-meta"
                        >
                            Get Started
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
