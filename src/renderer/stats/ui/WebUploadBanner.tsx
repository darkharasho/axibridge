import { useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

type WebUploadBannerProps = {
    embedded: boolean;
    webUploadMessage?: string | null;
    webUploadUrl?: string | null;
    webUploadBuildStatus: 'idle' | 'checking' | 'building' | 'built' | 'errored' | 'unknown';
    webCopyStatus: 'idle' | 'copied';
    setWebCopyStatus: (value: 'idle' | 'copied') => void;
};

export const WebUploadBanner = ({
    embedded,
    webUploadMessage,
    webUploadUrl,
    webUploadBuildStatus,
    webCopyStatus,
    setWebCopyStatus
}: WebUploadBannerProps) => {
    if (embedded || !webUploadMessage) return null;
    const displayUrl = webUploadUrl || webUploadMessage.replace(/^Uploaded:\s*/i, '').trim();
    const [shortCopyStatus, setShortCopyStatus] = useState<'idle' | 'copied'>('idle');
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
    return (
        <div className="mb-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-300 flex items-center gap-2">
                <span className="uppercase tracking-widest text-[10px] text-cyan-300/70">Uploaded</span>
                <button
                    onClick={() => {
                        if (displayUrl && window.electronAPI?.openExternal) {
                            window.electronAPI.openExternal(displayUrl);
                        }
                    }}
                    className="text-cyan-200 hover:text-cyan-100 underline underline-offset-2"
                >
                    {displayUrl}
                </button>
                {webUploadBuildStatus !== 'idle' && (
                    <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${webUploadBuildStatus === 'built'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : webUploadBuildStatus === 'errored'
                            ? 'bg-red-500/20 text-red-300 border-red-500/40'
                            : webUploadBuildStatus === 'unknown'
                                ? 'bg-white/5 text-gray-400 border-white/10'
                                : 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                        }`}>
                        {(webUploadBuildStatus === 'checking' || webUploadBuildStatus === 'building') && (
                            <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        {webUploadBuildStatus === 'built' && <CheckCircle2 className="w-3 h-3" />}
                        {webUploadBuildStatus === 'errored' && <XCircle className="w-3 h-3" />}
                        {webUploadBuildStatus === 'built'
                            ? 'Build ready'
                            : webUploadBuildStatus === 'errored'
                                ? 'Build failed'
                                : webUploadBuildStatus === 'unknown'
                                    ? 'Build status unknown'
                                    : 'Building…'}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => {
                        if (displayUrl) {
                            navigator.clipboard.writeText(displayUrl);
                            setWebCopyStatus('copied');
                            setTimeout(() => setWebCopyStatus('idle'), 1200);
                        }
                    }}
                    className="px-3 py-1 rounded-full text-[10px] border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                >
                    {webCopyStatus === 'copied' ? 'Copied' : 'Copy URL'}
                </button>
                {shortUrl && (
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(shortUrl);
                            setShortCopyStatus('copied');
                            setTimeout(() => setShortCopyStatus('idle'), 1200);
                        }}
                        className="px-3 py-1 rounded-full text-[10px] border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                    >
                        {shortCopyStatus === 'copied' ? 'Copied' : 'Copy Short'}
                    </button>
                )}
            </div>
        </div>
    );
};
