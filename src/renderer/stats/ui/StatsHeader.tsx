import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Search, Sparkles, Trophy, UploadCloud } from 'lucide-react';
import { PublishWebhookPopover } from './PublishWebhookPopover';
import type { PublishWebhookOption } from '../hooks/useStatsUploads';

type StatsHeaderProps = {
    embedded: boolean;
    dashboardTitle?: string;
    totalLogs: number;
    devMockAvailable: boolean;
    devMockUploadState: { uploading: boolean };
    onDevMockUpload: () => void;
    uploadingWeb: boolean;
    onWebUpload: (reportWebhookIds?: string[]) => void;
    uploadTargets?: Array<{ fullName: string; label: string; isDefault: boolean }>;
    onWebUploadToTarget?: (repoFullName: string, reportWebhookIds?: string[]) => void;
    reportWebhooks?: PublishWebhookOption[];
    initialWebhookSelection?: string[];
    canUploadWeb?: boolean;
    actionsDisabled?: boolean;
    /** Opens the universal search palette. Desktop-only chrome, like the rest of this row. */
    onSearchClick?: () => void;
};

export const StatsHeader = ({
    embedded,
    dashboardTitle,
    totalLogs,
    devMockAvailable,
    devMockUploadState,
    onDevMockUpload,
    uploadingWeb,
    onWebUpload,
    uploadTargets = [],
    onWebUploadToTarget,
    reportWebhooks = [],
    initialWebhookSelection = [],
    canUploadWeb = true,
    actionsDisabled = false,
    onSearchClick
}: StatsHeaderProps) => {
    const uploadDisabled = uploadingWeb || actionsDisabled || !canUploadWeb;
    const uploadDisabledReason = actionsDisabled
        ? 'Stats are still loading. Actions will enable when the dashboard is ready.'
        : (!canUploadWeb ? 'Add at least one fight before uploading a web report.' : '');
    const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    const [publishTarget, setPublishTarget] = useState<string | null>(null);
    const uploadMenuRef = useRef<HTMLDivElement | null>(null);
    const alternateUploadTargets = uploadTargets.filter((target) => !target.isDefault);

    // Clicking upload opens the webhook picker; with no webhooks configured it
    // publishes immediately (unchanged behavior). `target` is a repo full name for
    // an alternate destination, or null for the default repo.
    const startPublish = (target: string | null) => {
        setUploadMenuOpen(false);
        if (reportWebhooks.length === 0) {
            if (target) onWebUploadToTarget?.(target); else onWebUpload();
            return;
        }
        setPublishTarget(target);
        setPublishOpen(true);
    };
    const confirmPublish = (ids: string[]) => {
        setPublishOpen(false);
        if (publishTarget) onWebUploadToTarget?.(publishTarget, ids); else onWebUpload(ids);
    };

    useEffect(() => {
        if (!uploadMenuOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!uploadMenuRef.current || !target || uploadMenuRef.current.contains(target)) return;
            setUploadMenuOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setUploadMenuOpen(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [uploadMenuOpen]);

    useEffect(() => {
        if (uploadDisabled) {
            if (uploadMenuOpen) setUploadMenuOpen(false);
            if (publishOpen) setPublishOpen(false);
        }
    }, [uploadDisabled, uploadMenuOpen, publishOpen]);

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3 shrink-0 px-2">
        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
            <div className="space-y-0">
                <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                    <Trophy className="w-6 h-6 text-yellow-500" />
                    {dashboardTitle || 'Statistics Dashboard'}
                </h1>
                <p className="text-gray-400 text-[11px] sm:text-xs">
                    Performance across {totalLogs} uploaded logs
                </p>
            </div>
        </div>
        {!embedded && (
            <div className="flex items-center gap-3">
                {onSearchClick && (
                    <button
                        type="button"
                        onClick={onSearchClick}
                        title="Search (Ctrl+K)"
                        aria-label="Search"
                        className="p-2 rounded-[4px] transition-colors hover:bg-[var(--bg-hover)]"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
                    >
                        <Search className="w-4 h-4" />
                    </button>
                )}
                {devMockAvailable && (
                    <button
                        onClick={onDevMockUpload}
                        disabled={devMockUploadState.uploading || actionsDisabled}
                        className="flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50 bg-amber-500/15 text-amber-200 border border-amber-500/30 enabled:hover:bg-amber-500/25"
                    >
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        {devMockUploadState.uploading ? 'Building...' : 'Dev Mock Upload'}
                    </button>
                )}
                <div className="relative group" title={uploadDisabledReason} ref={uploadMenuRef}>
                    <div className="flex items-stretch">
                        <button
                            onClick={() => startPublish(null)}
                            disabled={uploadDisabled}
                            aria-disabled={uploadDisabled}
                            className={`stats-action-upload flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${alternateUploadTargets.length > 0 ? 'rounded-l-md rounded-r-none' : 'rounded-md'}`}
                            style={{ background: 'var(--accent-bg-strong)', color: 'var(--text-primary)', border: '1px solid var(--accent-border)' }}
                        >
                            <UploadCloud className="w-4 h-4" style={{ color: 'var(--brand-primary)' }} />
                            {uploadingWeb ? 'Uploading...' : 'Upload to Web'}
                        </button>
                        {alternateUploadTargets.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setUploadMenuOpen((value) => !value)}
                                disabled={uploadDisabled}
                                aria-haspopup="menu"
                                aria-expanded={uploadMenuOpen}
                                className="stats-action-upload flex items-center justify-center px-2 rounded-r-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: 'var(--accent-bg)', color: 'var(--text-primary)', border: '1px solid var(--accent-border)', borderLeft: 'none' }}
                                title="Choose upload repository"
                            >
                                <ChevronDown className={`w-4 h-4 transition-transform ${uploadMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                        )}
                    </div>
                    {uploadMenuOpen && alternateUploadTargets.length > 0 && !uploadDisabled && (
                        <div className="app-dropdown absolute right-0 top-full mt-2 z-50 min-w-[240px] rounded-md p-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hover)', boxShadow: 'var(--shadow-dropdown)' }}>
                            {alternateUploadTargets.map((target) => (
                                <button
                                    key={target.fullName}
                                    type="button"
                                    onClick={() => startPublish(target.fullName)}
                                    className="block w-full rounded-sm px-3 py-2 text-left text-xs transition-colors"
                                    style={{ color: 'var(--text-primary)' }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {target.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {publishOpen && !uploadDisabled && (
                        <PublishWebhookPopover
                            webhooks={reportWebhooks}
                            initialSelection={initialWebhookSelection}
                            onConfirm={confirmPublish}
                            onCancel={() => setPublishOpen(false)}
                        />
                    )}
                    {!canUploadWeb && !actionsDisabled && (
                        <div className="pointer-events-none absolute right-0 top-full mt-2 w-56 rounded-md px-2 py-1 text-[11px] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hover)', color: 'var(--text-secondary)' }}>
                            Add at least one fight before uploading a web report.
                        </div>
                    )}
                </div>
            </div>
        )}
    </motion.div>
    );
};
