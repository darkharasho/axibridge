import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';
import type { IWebUploadState } from '../global.d';
import type { LogEntry } from './hooks/useWebUpload';

const UPLOAD_STEPS = [
    { key: 'preparing', label: 'Prepare' },
    { key: 'building',  label: 'Build'   },
    { key: 'packaging', label: 'Package' },
    { key: 'uploading', label: 'Upload'  },
    { key: 'finalizing',label: 'Finalize'},
] as const;

/**
 * Returns the 0-based step index for the given stage string, or -1 if unrecognised.
 * Matches by prefix: 'Preparing anything' → 0, 'Building…' → 1, etc.
 */
export function getUploadStepIndex(stage: string | null): number {
    if (!stage) return -1;
    const lower = stage.toLowerCase();
    return UPLOAD_STEPS.findIndex(({ key }) => lower.startsWith(key));
}

/**
 * For failure stage strings like "Build failed" or "Upload failed",
 * returns the 0-based index of the step that failed, or -1 if unrecognised.
 */
export function getFailedStepIndex(stage: string | null): number {
    if (!stage) return -1;
    const match = stage.match(/^(\w+)\s+failed/i);
    if (!match) return -1;
    const word = match[1].toLowerCase();
    return UPLOAD_STEPS.findIndex(({ label }) => label.toLowerCase() === word);
}

export function WebUploadOverlay({
    webUploadState,
    isDev,
    setWebUploadState,
    logEntries,
}: {
    webUploadState: IWebUploadState;
    isDev: boolean;
    setWebUploadState: Dispatch<SetStateAction<IWebUploadState>>;
    logEntries: LogEntry[];
}) {
    const logEndRef = useRef<HTMLDivElement | null>(null);
    const [closing, setClosing] = useState(false);

    // Reset closing flag on new upload
    useEffect(() => {
        if (webUploadState.uploading) {
            setClosing(false);
        }
    }, [webUploadState.uploading]);

    // Keep the log scrolled to the latest entry
    useEffect(() => {
        if (logEndRef.current && typeof logEndRef.current.scrollIntoView === 'function') {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logEntries]);

    // Fade out on success. The CSS transition is duration-700; useWebUpload's
    // scheduleWebUploadClear fires after 2500ms and resets stage to null, which
    // unmounts this component. Keep scheduleWebUploadClear delay >= 700ms or
    // the overlay will be destroyed mid-fade.
    useEffect(() => {
        const stage = webUploadState.stage ?? '';
        // A pending Discord post keeps the overlay up: the upload is done, but the
        // trailing step below is still running and we want it visible.
        if (webUploadState.postStatus === 'pending') return;
        if (stage === 'Complete' || stage === 'Upload complete') {
            setClosing(true);
        }
    }, [webUploadState.stage, webUploadState.postStatus]);

    if (!(webUploadState.uploading || webUploadState.stage)) return null;

    const hasFailure =
        (webUploadState.stage?.toLowerCase().includes('fail') ?? false) ||
        webUploadState.buildStatus === 'errored';
    const hasErrorDetail = isDev || !!webUploadState.detail;

    const stepIndex   = getUploadStepIndex(webUploadState.stage);
    const failedIndex = hasFailure ? getFailedStepIndex(webUploadState.stage) : -1;
    const activeIndex = hasFailure ? failedIndex : stepIndex;

    const clearOverlay = () => {
        setWebUploadState((prev) => ({
            ...prev,
            uploading: false,
            stage: null,
            progress: null,
            detail: null,
            message: null,
            postStatus: 'idle',
            buildStatus: 'idle',
        }));
    };

    return (
        <div
            className={`app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg transition-opacity duration-700 ${closing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            onClick={hasFailure || webUploadState.postStatus === 'pending' ? clearOverlay : undefined}
        >
            <div
                className={`app-modal-card w-full rounded-2xl shadow-2xl backdrop-blur-2xl ${hasErrorDetail && hasFailure ? 'max-w-2xl' : 'max-w-md'}`}
                style={{
                    background: 'var(--bg-card)',
                    border: `var(--panel-border-w, 1px) solid ${hasFailure ? 'var(--status-error-border)' : 'var(--border-default)'}`,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Topbar ── */}
                <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div>
                        <div className="text-[9px] font-bold tracking-[.15em] uppercase" style={{ color: 'var(--brand-primary)' }}>
                            Web Upload
                        </div>
                        <div className={`text-base font-bold mt-0.5 ${hasFailure ? 'text-red-300' : 'text-white'}`}>
                            {webUploadState.stage || 'Uploading'}
                        </div>
                    </div>
                    {!hasFailure && stepIndex >= 0 && (
                        <div className="text-right">
                            <div className="text-[11px] font-bold" style={{ color: 'var(--brand-primary)' }}>{stepIndex + 1} / {UPLOAD_STEPS.length}</div>
                            <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>steps</div>
                        </div>
                    )}
                </div>

                {/* ── Stepper ── */}
                <div className="px-5 pt-3 pb-1">
                    <div className="flex items-center">
                        {UPLOAD_STEPS.map((step, i) => (
                            <StepFragment
                                key={step.key}
                                index={i}
                                last={i === UPLOAD_STEPS.length - 1}
                                activeIndex={activeIndex}
                                hasFailure={hasFailure}
                            />
                        ))}
                    </div>
                    <div className="flex justify-between mt-1">
                        {UPLOAD_STEPS.map((step, i) => {
                            const isDone   = i < activeIndex;
                            const isActive = i === activeIndex;
                            return (
                                <span
                                    key={step.key}
                                    className="text-[9px] font-semibold"
                                    style={{
                                        color: isActive && hasFailure
                                            ? 'var(--status-error-muted)'
                                            : isDone
                                            ? 'var(--brand-primary)'
                                            : isActive
                                            ? 'var(--text-primary)'
                                            : 'var(--text-muted)',
                                    }}
                                >
                                    {step.label}
                                </span>
                            );
                        })}
                    </div>
                </div>

                {/* ── Progress bar + current message ── */}
                <div className="px-5 pb-2">
                    <div className="web-upload-track h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${webUploadState.progress ?? (webUploadState.uploading ? 35 : 100)}%`,
                                background: hasFailure
                                    ? 'linear-gradient(90deg, var(--status-error), var(--status-warning))'
                                    : 'linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))',
                            }}
                        />
                    </div>
                    <div className="text-[11px] font-medium mt-2 leading-snug" style={{ color: hasFailure ? 'var(--status-error-muted)' : 'var(--text-secondary)' }}>
                        {webUploadState.detail || webUploadState.message || 'Working...'}
                    </div>
                </div>

                {/* ── Trailing Discord step (runs detached from the upload) ── */}
                {webUploadState.postStatus !== 'idle' && (
                    <div className="flex items-center gap-2 px-5 pb-2">
                        <div
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 border"
                            style={
                                webUploadState.postStatus === 'done'
                                    ? { background: 'var(--accent-bg)', borderColor: 'var(--accent-border)', color: 'var(--brand-primary)' }
                                    : webUploadState.postStatus === 'warn'
                                    ? { background: 'var(--status-warning-bg)', borderColor: 'var(--status-warning)', color: 'var(--status-warning)' }
                                    : { background: 'var(--accent-bg-strong)', borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }
                            }
                        >
                            {webUploadState.postStatus === 'done' ? '✓' : webUploadState.postStatus === 'warn' ? '!' : '·'}
                        </div>
                        <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                            Discord
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {webUploadState.postStatus === 'done'
                                ? 'posted'
                                : webUploadState.postStatus === 'warn'
                                ? 'posted with warnings'
                                : 'posting in the background...'}
                        </span>
                    </div>
                )}

                {/* ── Log feed ── */}
                {logEntries.length > 0 && (
                    <div
                        className="border-t overflow-y-auto overscroll-contain px-4 py-2"
                        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-base)', maxHeight: '96px' }}
                        onWheel={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                    >
                        {logEntries.map((entry, i) => (
                            <div key={i} className="flex gap-2 items-baseline py-[1.5px]">
                                <span className="text-[8.5px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
                                    {entry.elapsed}
                                </span>
                                <span
                                    className="text-[10px] leading-snug"
                                    style={{
                                        color: entry.isError
                                            ? 'var(--status-error-muted)'
                                            : entry.isWarn
                                            ? 'var(--status-warning)'
                                            : i === logEntries.length - 1
                                            ? 'var(--text-primary)'
                                            : 'var(--text-secondary)',
                                    }}
                                >
                                    {entry.text}
                                </span>
                            </div>
                        ))}
                        <div ref={logEndRef} />
                    </div>
                )}

                {/* ── Error detail pre-block (dev or when detail is present) ── */}
                {hasFailure && hasErrorDetail && webUploadState.detail && (
                    <pre
                        className="mx-4 mb-3 mt-1 h-64 overflow-y-auto overflow-x-auto overscroll-contain rounded-xl border border-amber-500/20 bg-black/60 p-3 text-[11px] text-amber-100 whitespace-pre-wrap pointer-events-auto"
                        onWheel={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                    >
                        {webUploadState.detail}
                    </pre>
                )}

                {/* ── Footer ── */}
                <div className="flex items-center justify-between px-5 py-3">
                    <span
                        className="text-[9px]"
                        style={{ color: hasFailure ? 'var(--status-error)' : 'var(--text-muted)' }}
                    >
                        {hasFailure
                            ? failedIndex >= 0
                                ? `failed at step ${failedIndex + 1}`
                                : 'upload failed'
                            : typeof webUploadState.progress === 'number'
                            ? `${Math.round(webUploadState.progress)}%`
                            : 'Preparing...'}
                    </span>
                    {(hasFailure || webUploadState.postStatus === 'pending') && (
                        <button
                            type="button"
                            onClick={clearOverlay}
                            className={hasFailure
                                ? 'px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                                : 'px-3 py-1.5 rounded-lg text-xs font-semibold border'}
                            style={hasFailure ? undefined : { borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
                        >
                            Dismiss
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Internal sub-component: one step dot + its trailing connector ──

function StepFragment({
    index,
    last,
    activeIndex,
    hasFailure,
}: {
    index: number;
    last: boolean;
    activeIndex: number;
    hasFailure: boolean;
}) {
    const isDone   = index < activeIndex;
    const isActive = index === activeIndex;
    const isFailed = isActive && hasFailure;

    let bg: string, borderColor: string, color: string, boxShadow: string | undefined;
    if (isFailed) {
        bg = 'var(--status-error-bg)';   borderColor = 'var(--status-error-border)'; color = 'var(--status-error-muted)'; boxShadow = undefined;
    } else if (isDone) {
        bg = 'var(--accent-bg)';         borderColor = 'var(--accent-border)';       color = 'var(--brand-primary)';      boxShadow = undefined;
    } else if (isActive) {
        bg = 'var(--accent-bg-strong)';  borderColor = 'var(--brand-primary)';       color = 'var(--brand-primary)';      boxShadow = '0 0 8px var(--glow-primary)';
    } else {
        bg = 'var(--bg-input)';          borderColor = 'var(--border-default)';      color = 'var(--text-muted)';         boxShadow = undefined;
    }

    return (
        <>
            <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 border"
                style={{ background: bg, borderColor, color, boxShadow }}
            >
                {isFailed ? '✕' : isDone ? '✓' : String(index + 1)}
            </div>
            {!last && (
                <div
                    className="flex-1 h-px mx-1"
                    style={{ background: isDone ? 'var(--accent-border)' : 'var(--border-default)' }}
                />
            )}
        </>
    );
}
