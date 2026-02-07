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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg">
            <div className={`w-full bg-white/10 border border-white/15 rounded-2xl p-6 shadow-2xl backdrop-blur-2xl ${isDev && (webUploadState.stage === 'Upload failed' || webUploadState.buildStatus === 'errored') ? 'max-w-2xl' : 'max-w-md'}`}>
                <div className="text-sm uppercase tracking-widest text-cyan-300/70">Web Upload</div>
                <div className="text-2xl font-bold text-white mt-2">{webUploadState.stage || 'Uploading'}</div>
                <div className="text-sm text-gray-400 mt-2">
                    {(webUploadState.stage === 'Upload failed' || webUploadState.buildStatus === 'errored')
                        ? 'Upload failed (WEB_UPLOAD_ERROR)'
                        : (webUploadState.detail || webUploadState.message || 'Working...')}
                </div>
                {isDev && webUploadState.detail && (webUploadState.stage === 'Upload failed' || webUploadState.buildStatus === 'errored') && (
                    <pre className="mt-4 h-64 overflow-y-auto overflow-x-auto overscroll-contain rounded-xl border border-amber-500/20 bg-black/60 p-3 text-[11px] text-amber-100 whitespace-pre-wrap pointer-events-auto" onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}>
                        {webUploadState.detail}
                    </pre>
                )}
                <div className={`mt-4 h-2 rounded-full overflow-hidden ${isModernTheme ? 'bg-slate-800/70 border border-white/20' : 'bg-white/10'}`}>
                    <div className={`h-full transition-all ${isModernTheme ? 'bg-slate-200 shadow-[0_0_10px_rgba(226,232,240,0.6)]' : 'bg-gradient-to-r from-cyan-300 to-blue-400'}`} style={{ width: `${webUploadState.progress ?? (webUploadState.uploading ? 35 : 100)}%` }} />
                </div>
                <div className="text-xs text-gray-500 mt-2">{typeof webUploadState.progress === 'number' ? `${Math.round(webUploadState.progress)}%` : 'Preparing...'}</div>
                {isDev && (webUploadState.stage === 'Upload failed' || webUploadState.buildStatus === 'errored') && (
                    <div className="mt-4 flex justify-end">
                        <button
                            type="button"
                            onClick={() => {
                                setWebUploadState((prev) => ({ ...prev, uploading: false, stage: null, progress: null, detail: null, message: null, buildStatus: 'idle' }));
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
