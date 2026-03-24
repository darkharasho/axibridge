import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Share2, Sparkles, Trophy, UploadCloud } from 'lucide-react';

type StatsHeaderProps = {
    embedded: boolean;
    dashboardTitle?: string;
    totalLogs: number;
    devMockAvailable: boolean;
    devMockUploadState: { uploading: boolean };
    onDevMockUpload: () => void;
    uploadingWeb: boolean;
    onWebUpload: () => void;
    uploadTargets?: Array<{ fullName: string; label: string; isDefault: boolean }>;
    onWebUploadToTarget?: (repoFullName: string) => void;
    canUploadWeb?: boolean;
    sharing: boolean;
    shareStage?: 'idle' | 'settling' | 'capturing' | 'sending';
    canShareDiscord: boolean;
    onShare: () => void;
    actionsDisabled?: boolean;
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
    canUploadWeb = true,
    sharing,
    shareStage = 'idle',
    canShareDiscord,
    onShare,
    actionsDisabled = false
}: StatsHeaderProps) => {
    const uploadDisabled = uploadingWeb || actionsDisabled || !canUploadWeb;
    const uploadDisabledReason = actionsDisabled
        ? 'Stats are still loading. Actions will enable when the dashboard is ready.'
        : (!canUploadWeb ? 'Add at least one fight before uploading a web report.' : '');
    const shareDisabled = sharing || actionsDisabled || !canShareDiscord;
    const shareDisabledReason = actionsDisabled
        ? 'Stats are still loading. Actions will enable when the dashboard is ready.'
        : (!canShareDiscord ? 'Select a Discord webhook to enable sharing.' : '');
    const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
    const uploadMenuRef = useRef<HTMLDivElement | null>(null);
    const alternateUploadTargets = uploadTargets.filter((target) => !target.isDefault);
    const shareLabel = shareStage === 'settling'
        ? 'Settling...'
        : shareStage === 'capturing'
            ? 'Capturing...'
            : shareStage === 'sending'
                ? 'Sending...'
                : (sharing ? 'Sharing...' : 'Share to Discord');

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
        if (uploadDisabled && uploadMenuOpen) {
            setUploadMenuOpen(false);
        }
    }, [uploadDisabled, uploadMenuOpen]);

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
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
                            onClick={onWebUpload}
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
                        <div className="absolute right-0 top-full mt-2 z-50 min-w-[240px] rounded-md p-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hover)', boxShadow: 'var(--shadow-dropdown)' }}>
                            {alternateUploadTargets.map((target) => (
                                <button
                                    key={target.fullName}
                                    type="button"
                                    onClick={() => {
                                        setUploadMenuOpen(false);
                                        onWebUploadToTarget?.(target.fullName);
                                    }}
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
                    {!canUploadWeb && !actionsDisabled && (
                        <div className="stats-share-tooltip pointer-events-none absolute right-0 top-full mt-2 w-56 rounded-md px-2 py-1 text-[11px] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hover)', color: 'var(--text-secondary)' }}>
                            Add at least one fight before uploading a web report.
                        </div>
                    )}
                </div>
                <div className="relative group" title={shareDisabledReason}>
                    <button
                        onClick={onShare}
                        disabled={shareDisabled}
                        aria-disabled={shareDisabled}
                        className="stats-action-discord flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: 'var(--accent-bg-strong)', color: 'var(--text-primary)', border: '1px solid var(--accent-border)' }}
                    >
                        <Share2 className="w-4 h-4" style={{ color: 'var(--brand-primary)' }} />
                        {shareLabel}
                    </button>
                    {!canShareDiscord && (
                        <div className="stats-share-tooltip pointer-events-none absolute right-0 top-full mt-2 w-56 rounded-md px-2 py-1 text-[11px] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hover)', color: 'var(--text-secondary)' }}>
                            Select a Discord webhook to enable sharing.
                        </div>
                    )}
                </div>
            </div>
        )}
    </motion.div>
    );
};
