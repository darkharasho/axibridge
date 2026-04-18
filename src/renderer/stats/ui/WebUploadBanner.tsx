import type { CSSProperties } from 'react';
import { Loader2 } from 'lucide-react';
import type { WebUploadBuildStatus } from '../../global.d';

type WebUploadBannerProps = {
    embedded: boolean;
    webUploadMessage?: string | null;
    webUploadUrl?: string | null;
    webUploadBuildStatus: WebUploadBuildStatus;
    webCopyStatus: 'idle' | 'copied';
    setWebCopyStatus: (value: 'idle' | 'copied') => void;
};

export const WebUploadBanner = ({
    embedded,
    webUploadMessage,
    webUploadUrl,
    webUploadBuildStatus,
    webCopyStatus,
    setWebCopyStatus,
}: WebUploadBannerProps) => {
    if (embedded || !webUploadMessage) return null;

    const displayUrl = webUploadUrl || webUploadMessage.replace(/^Uploaded:\s*/i, '').trim();

    // Short URL: only when the repo slug matches the github.io hostname exactly
    const shortUrl = (() => {
        if (!displayUrl) return null;
        try {
            const url = new URL(displayUrl);
            const reportId = url.searchParams.get('report');
            if (!reportId) return null;
            if (!url.hostname.endsWith('github.io')) return null;
            const repoMatch = url.pathname.match(/^\/([^/]+\.github\.io)(\/|$)/i);
            const repoName = repoMatch?.[1] || '';
            if (!repoName) return null;
            if (repoName.toLowerCase() !== url.hostname.toLowerCase()) return null;
            return `${url.origin}/?report=${reportId}`;
        } catch {
            return null;
        }
    })();

    const copyUrl = shortUrl || displayUrl;

    // Leading icon
    const iconContent = webUploadBuildStatus === 'built' ? '✓'
        : webUploadBuildStatus === 'errored' ? '✕'
        : '🌐';
    const iconStyle: CSSProperties = webUploadBuildStatus === 'built'
        ? { background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)' }
        : { background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)' };

    // Build status pill
    const isBuilding  = webUploadBuildStatus === 'checking' || webUploadBuildStatus === 'building';
    const showPill    = webUploadBuildStatus !== 'idle' && webUploadBuildStatus !== 'unknown';
    const pillText    = webUploadBuildStatus === 'built' ? '✓ Live'
        : webUploadBuildStatus === 'errored' ? 'Build failed'
        : 'Building…';
    const pillStyle: CSSProperties = webUploadBuildStatus === 'built'
        ? { background: 'rgba(63,185,80,0.1)',  border: '1px solid rgba(63,185,80,0.25)',  color: '#3fb950' }
        : webUploadBuildStatus === 'errored'
        ? { background: 'rgba(248,81,73,0.1)',  border: '1px solid rgba(248,81,73,0.25)',  color: '#f85149' }
        : { background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)', color: '#22d3ee' };

    const openUrl = () => {
        if (displayUrl && window.electronAPI?.openExternal) {
            window.electronAPI.openExternal(displayUrl);
        }
    };

    return (
        <div className="mb-3 bg-white/[0.04] border border-white/[0.09] rounded-xl px-3 py-2.5 flex items-center gap-3">
            {/* Icon */}
            <div
                className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-sm"
                style={iconStyle}
                aria-hidden="true"
            >
                {iconContent}
            </div>

            {/* Body */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] font-bold tracking-[.1em] uppercase" style={{ color: 'rgba(34,211,238,0.6)' }}>
                        Published
                    </span>
                    {showPill && (
                        <span
                            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                            style={pillStyle}
                        >
                            {isBuilding && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                            {pillText}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={openUrl}
                    className="text-[11px] text-cyan-200 hover:text-cyan-100 underline underline-offset-2 truncate block max-w-full text-left"
                >
                    {displayUrl}
                </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    type="button"
                    onClick={() => {
                        if (copyUrl) {
                            navigator.clipboard.writeText(copyUrl);
                            setWebCopyStatus('copied');
                            setTimeout(() => setWebCopyStatus('idle'), 1200);
                        }
                    }}
                    className="px-3 py-1 rounded-full text-[10px] font-medium border bg-white/[0.05] text-gray-300 border-white/10 hover:text-white transition-colors"
                >
                    {webCopyStatus === 'copied' ? 'Copied' : 'Copy'}
                </button>
                <button
                    type="button"
                    onClick={openUrl}
                    className="px-3 py-1 rounded-full text-[10px] font-medium border bg-cyan-500/[0.08] text-cyan-300 border-cyan-500/25 hover:bg-cyan-500/15 transition-colors"
                >
                    Open ↗
                </button>
            </div>
        </div>
    );
};
