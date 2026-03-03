import { useEffect, useRef, useState } from 'react';
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3 shrink-0 px-2">
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
                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 bg-amber-500/15 text-amber-200 border border-amber-500/30 hover:bg-amber-500/25"
                    >
                        <Sparkles className="w-4 h-4" />
                        {devMockUploadState.uploading ? 'Building...' : 'Dev Mock Upload'}
                    </button>
                )}
                <div className="relative group" title={uploadDisabledReason} ref={uploadMenuRef}>
                    <div className="flex items-stretch">
                        <button
                            onClick={onWebUpload}
                            disabled={uploadDisabled}
                            aria-disabled={uploadDisabled}
                            className={`stats-action-upload flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${alternateUploadTargets.length > 0 ? 'rounded-l-lg rounded-r-none' : 'rounded-lg'}`}
                        >
                            <UploadCloud className="w-4 h-4" />
                            {uploadingWeb ? 'Uploading...' : 'Upload to Web'}
                        </button>
                        {alternateUploadTargets.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setUploadMenuOpen((value) => !value)}
                                disabled={uploadDisabled}
                                aria-haspopup="menu"
                                aria-expanded={uploadMenuOpen}
                                className="stats-action-upload flex items-center justify-center px-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-r-lg border-l border-emerald-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Choose upload repository"
                            >
                                <ChevronDown className={`w-4 h-4 transition-transform ${uploadMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                        )}
                    </div>
                    {uploadMenuOpen && alternateUploadTargets.length > 0 && !uploadDisabled && (
                        <div className="absolute right-0 top-full mt-2 z-50 min-w-[240px] rounded-lg border border-white/10 bg-black/90 p-1 shadow-xl backdrop-blur-md">
                            {alternateUploadTargets.map((target) => (
                                <button
                                    key={target.fullName}
                                    type="button"
                                    onClick={() => {
                                        setUploadMenuOpen(false);
                                        onWebUploadToTarget?.(target.fullName);
                                    }}
                                    className="block w-full rounded-md px-3 py-2 text-left text-xs text-gray-100 transition-colors hover:bg-white/10"
                                >
                                    {target.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {!canUploadWeb && !actionsDisabled && (
                        <div className="stats-share-tooltip pointer-events-none absolute right-0 top-full mt-2 w-56 rounded-md border border-white/10 bg-black/90 px-2 py-1 text-[11px] text-gray-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                            Add at least one fight before uploading a web report.
                        </div>
                    )}
                </div>
                <div className="relative group" title={shareDisabledReason}>
                    <button
                        onClick={onShare}
                        disabled={shareDisabled}
                        aria-disabled={shareDisabled}
                        className="stats-action-discord flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Share2 className="w-4 h-4" />
                        {shareLabel}
                    </button>
                    {!canShareDiscord && (
                        <div className="stats-share-tooltip pointer-events-none absolute right-0 top-full mt-2 w-56 rounded-md border border-white/10 bg-black/90 px-2 py-1 text-[11px] text-gray-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                            Select a Discord webhook to enable sharing.
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
    );
};
