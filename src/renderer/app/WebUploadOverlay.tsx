import type { Dispatch, SetStateAction } from 'react';
import type { IWebUploadState } from '../global.d';

export function WebUploadOverlay({
    webUploadState,
    isDev,
    isModernTheme,
    setWebUploadState
}: {
    webUploadState: IWebUploadState;
    isDev: boolean;
    isModernTheme: boolean;
    setWebUploadState: Dispatch<SetStateAction<IWebUploadState>>;
}) {
    if (!(webUploadState.uploading || webUploadState.stage)) return null;

    const hasFailure = webUploadState.stage === 'Upload failed' || webUploadState.buildStatus === 'errored';
    const clearOverlay = () => {
        setWebUploadState((prev) => ({
            ...prev,
            uploading: false,
            stage: null,
            progress: null,
            detail: null,
            message: null,
            buildStatus: 'idle'
        }));
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg"
            onClick={hasFailure ? clearOverlay : undefined}
        >
            <div
                className={`w-full bg-white/10 border border-white/15 rounded-2xl p-6 shadow-2xl backdrop-blur-2xl ${hasFailure && (isDev || webUploadState.detail) ? 'max-w-2xl' : 'max-w-md'}`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="text-sm uppercase tracking-widest text-cyan-300/70">Web Upload</div>
                <div className="text-2xl font-bold text-white mt-2">{webUploadState.stage || 'Uploading'}</div>
                <div className="text-sm text-gray-400 mt-2">
                    {hasFailure
                        ? (webUploadState.message || webUploadState.detail || 'Upload failed.')
                        : (webUploadState.detail || webUploadState.message || 'Working...')}
                </div>
                {webUploadState.detail && hasFailure && (
                    <pre className="mt-4 h-64 overflow-y-auto overflow-x-auto overscroll-contain rounded-xl border border-amber-500/20 bg-black/60 p-3 text-[11px] text-amber-100 whitespace-pre-wrap pointer-events-auto" onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}>
                        {webUploadState.detail}
                    </pre>
                )}
                <div className={`mt-4 h-2 rounded-full overflow-hidden ${isModernTheme ? 'bg-slate-800/70 border border-white/20' : 'bg-white/10'}`}>
                    <div className={`h-full transition-all ${isModernTheme ? 'bg-slate-200 shadow-[0_0_10px_rgba(226,232,240,0.6)]' : 'bg-gradient-to-r from-cyan-300 to-blue-400'}`} style={{ width: `${webUploadState.progress ?? (webUploadState.uploading ? 35 : 100)}%` }} />
                </div>
                <div className="text-xs text-gray-500 mt-2">{typeof webUploadState.progress === 'number' ? `${Math.round(webUploadState.progress)}%` : 'Preparing...'}</div>
                {hasFailure && (
                    <div className="mt-4 flex justify-end">
                        <button
                            type="button"
                            onClick={clearOverlay}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
