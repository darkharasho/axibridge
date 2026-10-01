import type { CSSProperties } from 'react';
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
            className={`app-modal-overlay axi-scrim flex items-center justify-center transition-opacity duration-700 ${closing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            onClick={hasFailure || webUploadState.postStatus === 'pending' ? clearOverlay : undefined}
        >
            <div
                /* A failure recolours the edge, which is what .axi-edge-danger is for -
                   the inline border literal here was the only reason --panel-border-w had
                   to exist. The width is the knob rather than a max-w utility because
                   .axi-modal owns max-width and would outrank one. */
                className={`app-modal-card axi-modal ${hasFailure ? 'axi-edge-danger' : ''}`}
                style={{ '--axi-modal-width': hasErrorDetail && hasFailure ? '672px' : '448px' } as React.CSSProperties}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Topbar ── */}
                <div className="axi-modal__head justify-between items-start">
                    <div>
                        <div className="text-[9px] font-bold tracking-[.15em] uppercase" style={{ color: 'var(--axi-accent)' }}>
                            Web Upload
                        </div>
                        <div className={`text-base font-bold mt-0.5 ${hasFailure ? 'axi-ink-danger' : 'axi-ink-plain'}`}>
                            {webUploadState.stage || 'Uploading'}
                        </div>
                    </div>
                    {!hasFailure && stepIndex >= 0 && (
                        <div className="text-right">
                            <div className="text-[11px] font-bold" style={{ color: 'var(--axi-accent)' }}>{stepIndex + 1} / {UPLOAD_STEPS.length}</div>
                            <div className="text-[9px] mt-0.5" style={{ color: 'var(--axi-text-faint)' }}>steps</div>
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
                                            ? 'var(--axi-danger)'
                                            : isDone
                                            ? 'var(--axi-accent)'
                                            : isActive
                                            ? 'var(--axi-text)'
                                            : 'var(--axi-text-faint)',
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
                    <div className="web-upload-track axi-meter">
                        <div
                            className="axi-meter__fill transition-all duration-500"
                            style={{
                                '--axi-meter-v': `${webUploadState.progress ?? (webUploadState.uploading ? 35 : 100)}%`,
                                ...(hasFailure ? { '--axi-series': 'var(--axi-danger)' } : {}),
                            } as CSSProperties}
                        />
                    </div>
                    <div className="text-[11px] font-medium mt-2 leading-snug" style={{ color: hasFailure ? 'var(--axi-danger)' : 'var(--axi-text-dim)' }}>
                        {webUploadState.detail || webUploadState.message || 'Working...'}
                    </div>
                </div>

                {/* ── Trailing Discord step (runs detached from the upload) ── */}
                {webUploadState.postStatus !== 'idle' && (
                    <div className="flex items-center gap-2 px-5 pb-2">
                        <div
                            className="w-4 h-4 flex items-center justify-center text-[8px] font-bold shrink-0 border"
                            style={
                                webUploadState.postStatus === 'done'
                                    ? { background: 'var(--axi-surface-paint)', borderColor: 'var(--axi-ink-line)', color: 'var(--axi-accent)' }
                                    : webUploadState.postStatus === 'warn'
                                    ? { background: 'var(--axi-surface-raised-paint)', borderColor: 'var(--axi-warn)', color: 'var(--axi-warn)' }
                                    : { background: 'var(--axi-surface-raised-paint)', borderColor: 'var(--axi-accent)', color: 'var(--axi-accent)' }
                            }
                        >
                            {webUploadState.postStatus === 'done' ? '✓' : webUploadState.postStatus === 'warn' ? '!' : '·'}
                        </div>
                        <span className="text-[10px] font-semibold" style={{ color: 'var(--axi-text-dim)' }}>
                            Discord
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--axi-text-faint)' }}>
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
                        style={{ borderColor: 'var(--axi-rule)', background: 'var(--axi-ground)', maxHeight: '96px' }}
                        onWheel={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                    >
                        {logEntries.map((entry, i) => (
                            <div key={i} className="flex gap-2 items-baseline py-[1.5px]">
                                <span className="text-[8.5px] font-mono shrink-0" style={{ color: 'var(--axi-text-faint)' }}>
                                    {entry.elapsed}
                                </span>
                                <span
                                    className="text-[10px] leading-snug"
                                    style={{
                                        color: entry.isError
                                            ? 'var(--axi-danger)'
                                            : entry.isWarn
                                            ? 'var(--axi-warn)'
                                            : i === logEntries.length - 1
                                            ? 'var(--axi-text)'
                                            : 'var(--axi-text-dim)',
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
                        className="mx-4 mb-3 mt-1 h-64 overflow-y-auto overflow-x-auto overscroll-contain axi-well axi-edge-warn text-[11px] axi-ink-warn whitespace-pre-wrap pointer-events-auto"
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
                        style={{ color: hasFailure ? 'var(--axi-danger)' : 'var(--axi-text-faint)' }}
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
                            className={`axi-btn axi-btn--sm ${hasFailure ? 'axi-edge-warn axi-ink-warn' : 'axi-ink-dim'}`}
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
        bg = 'var(--axi-surface-raised-paint)';   borderColor = 'var(--axi-danger)'; color = 'var(--axi-danger)'; boxShadow = undefined;
    } else if (isDone) {
        bg = 'var(--axi-surface-paint)';         borderColor = 'var(--axi-ink-line)';       color = 'var(--axi-accent)';      boxShadow = undefined;
    } else if (isActive) {
        bg = 'var(--axi-surface-raised-paint)';  borderColor = 'var(--axi-accent)';       color = 'var(--axi-accent)';      boxShadow = undefined;
    } else {
        bg = 'var(--axi-ground)';          borderColor = 'var(--axi-ink-line)';      color = 'var(--axi-text-faint)';         boxShadow = undefined;
    }

    return (
        <>
            <div
                className="w-5 h-5 flex items-center justify-center text-[8px] font-bold shrink-0 border"
                style={{ background: bg, borderColor, color, boxShadow }}
            >
                {isFailed ? '✕' : isDone ? '✓' : String(index + 1)}
            </div>
            {!last && (
                <div
                    className="flex-1 h-px mx-1"
                    style={{ background: isDone ? 'var(--axi-ink-line)' : 'var(--axi-ink-line)' }}
                />
            )}
        </>
    );
}
