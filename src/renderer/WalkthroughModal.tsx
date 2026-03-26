import { AnimatePresence, motion } from 'framer-motion';
import { FileText, LineChart, Rocket, X } from 'lucide-react';

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
    }
] as const;

export function WalkthroughModal({ isOpen, onClose, onLearnMore }: WalkthroughModalProps) {
    if (!isOpen) return null;
    const appIconPath = `${import.meta.env.BASE_URL || './'}svg/AxiBridge.svg`;
    const axibridgeLogoStyle = { WebkitMaskImage: `url(${appIconPath})`, maskImage: `url(${appIconPath})` } as const;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="app-modal-overlay fixed inset-0 z-[72] flex items-center justify-center bg-black/70"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 18 }}
                    transition={{ duration: 0.2 }}
                    className="app-modal-card w-full max-w-3xl mx-4 overflow-hidden rounded-[4px]"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
                >
                    <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <div className="flex items-center gap-3">
                            <div className="rounded-[4px] border border-blue-500/30 bg-blue-500/20 p-1.5">
                                <span className="axibridge-logo h-7 w-7 rounded-lg" style={axibridgeLogoStyle} aria-label="AxiBridge logo" />
                            </div>
                            <div>
                                <div className="text-lg font-bold text-white">Welcome to AxiBridge</div>
                                <div className="text-xs text-gray-400">A quick overview of what this app does</div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-[4px] hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6">
                        <div className="grid gap-3">
                            {STEPS.map((step, idx) => {
                                const Icon = step.icon;
                                return (
                                    <div
                                        key={step.title}
                                        className="rounded-[4px] px-4 py-4 flex gap-4 items-start"
                                        style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-default)' }}
                                    >
                                        <div className="mt-0.5 rounded-[4px] border border-blue-500/30 bg-blue-500/15 p-2">
                                            <Icon className="w-4 h-4 text-blue-300" />
                                        </div>
                                        <div>
                                            <div className="text-xs uppercase tracking-wider text-blue-200/80 font-semibold">
                                                Step {idx + 1}
                                            </div>
                                            <div className="text-sm font-semibold text-white mt-1">{step.title}</div>
                                            <div className="text-sm text-gray-300 mt-1 leading-6">{step.description}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--border-default)' }}>
                        <button
                            onClick={() => onLearnMore?.()}
                            className="px-4 py-2 rounded-[4px] text-gray-200 hover:bg-white/10 transition-colors text-sm font-medium"
                            style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-default)' }}
                        >
                            Learn More
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-[4px] bg-blue-500/20 text-blue-200 border border-blue-500/30 hover:bg-blue-500/30 transition-colors text-sm font-medium"
                        >
                            Get Started
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
