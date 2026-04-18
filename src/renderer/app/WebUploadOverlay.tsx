import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';
import type { IWebUploadState } from '../global.d';

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

type LogEntry = { elapsed: string; text: string; isError: boolean; isWarn: boolean };

export function WebUploadOverlay({
    webUploadState,
    isDev,
    setWebUploadState,
}: {
    webUploadState: IWebUploadState;
    isDev: boolean;
    setWebUploadState: Dispatch<SetStateAction<IWebUploadState>>;
}) {
    const startTimeRef    = useRef<number | null>(null);
    const prevMessageRef  = useRef<string | null>(null);
    const logEndRef       = useRef<HTMLDivElement | null>(null);
    const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
    const [closing, setClosing]       = useState(false);

    // Start timer and reset log when upload begins; clear timer when done
    useEffect(() => {
        if (webUploadState.uploading && startTimeRef.current === null) {
            startTimeRef.current  = Date.now();
            prevMessageRef.current = null;
            setLogEntries([]);
            setClosing(false);
        }
        if (!webUploadState.uploading && !webUploadState.stage) {
            startTimeRef.current = null;
        }
    }, [webUploadState.uploading, webUploadState.stage]);

    // Accumulate a new log entry whenever message or detail changes
    useEffect(() => {
        const text = webUploadState.message || webUploadState.detail;
        if (!text || text === prevMessageRef.current) return;
        prevMessageRef.current = text;
        const elapsed = startTimeRef.current
            ? `${((Date.now() - startTimeRef.current) / 1000).toFixed(1)}s`
            : '0.0s';
        const stage    = webUploadState.stage ?? '';
        const isError  = stage.toLowerCase().includes('fail');
        const isWarn   = stage.toLowerCase() === 'warning';
        setLogEntries((prev) => [...prev, { elapsed, text, isError, isWarn }]);
    }, [webUploadState.message, webUploadState.detail, webUploadState.stage]);

    // Keep the log scrolled to the latest entry
    useEffect(() => {
        if (logEndRef.current && typeof logEndRef.current.scrollIntoView === 'function') {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logEntries]);

    // Fade out on success
    useEffect(() => {
        const stage = webUploadState.stage ?? '';
        if (stage === 'Complete' || stage === 'Upload complete') {
            setClosing(true);
        }
    }, [webUploadState.stage]);

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
            buildStatus: 'idle',
        }));
    };

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg transition-opacity duration-700 ${closing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            onClick={hasFailure ? clearOverlay : undefined}
        >
            <div
                className={`w-full rounded-2xl shadow-2xl backdrop-blur-2xl ${hasErrorDetail && hasFailure ? 'max-w-2xl' : 'max-w-md'}`}
                style={{
                    background: 'rgba(13,17,23,0.96)',
                    border: `1px solid ${hasFailure ? 'rgba(248,81,73,0.35)' : 'rgba(255,255,255,0.10)'}`,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Topbar ── */}
                <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-white/[0.07]">
                    <div>
                        <div className="text-[9px] font-bold tracking-[.15em] uppercase" style={{ color: 'rgba(34,211,238,0.6)' }}>
                            Web Upload
                        </div>
                        <div className={`text-base font-bold mt-0.5 ${hasFailure ? 'text-red-300' : 'text-white'}`}>
                            {webUploadState.stage || 'Uploading'}
                        </div>
                    </div>
                    {!hasFailure && stepIndex >= 0 && (
                        <div className="text-right">
                            <div className="text-[11px] font-bold text-cyan-400">{stepIndex + 1} / {UPLOAD_STEPS.length}</div>
                            <div className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>steps</div>
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
                                            ? 'rgba(252,165,165,0.8)'
                                            : isDone
                                            ? 'rgba(34,211,238,0.5)'
                                            : isActive
                                            ? '#e6edf3'
                                            : 'rgba(255,255,255,0.2)',
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
                    <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${webUploadState.progress ?? (webUploadState.uploading ? 35 : 100)}%`,
                                background: hasFailure
                                    ? 'linear-gradient(90deg, #f85149, #fb923c)'
                                    : 'linear-gradient(90deg, #22d3ee, #60a5fa)',
                            }}
                        />
                    </div>
                    <div className={`text-[11px] font-medium mt-2 leading-snug ${hasFailure ? 'text-red-300' : 'text-white/80'}`}>
                        {webUploadState.message || webUploadState.detail || 'Working...'}
                    </div>
                </div>

                {/* ── Log feed ── */}
                {logEntries.length > 0 && (
                    <div
                        className="border-t border-white/[0.06] overflow-y-auto overscroll-contain px-4 py-2"
                        style={{ background: 'rgba(0,0,0,0.28)', maxHeight: '96px' }}
                        onWheel={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                    >
                        {logEntries.map((entry, i) => (
                            <div key={i} className="flex gap-2 items-baseline py-[1.5px]">
                                <span className="text-[8.5px] font-mono shrink-0" style={{ color: 'rgba(255,255,255,0.18)' }}>
                                    {entry.elapsed}
                                </span>
                                <span
                                    className="text-[10px] leading-snug"
                                    style={{
                                        color: entry.isError
                                            ? 'rgba(252,165,165,0.8)'
                                            : entry.isWarn
                                            ? 'rgba(251,191,36,0.8)'
                                            : i === logEntries.length - 1
                                            ? 'rgba(255,255,255,0.85)'
                                            : 'rgba(255,255,255,0.45)',
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
                        style={{ color: hasFailure ? 'rgba(248,81,73,0.6)' : 'rgba(255,255,255,0.2)' }}
                    >
                        {hasFailure
                            ? failedIndex >= 0
                                ? `failed at step ${failedIndex + 1}`
                                : 'upload failed'
                            : typeof webUploadState.progress === 'number'
                            ? `${Math.round(webUploadState.progress)}%`
                            : 'Preparing...'}
                    </span>
                    {hasFailure && (
                        <button
                            type="button"
                            onClick={clearOverlay}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
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
        bg = 'rgba(248,81,73,0.15)'; borderColor = 'rgba(248,81,73,0.5)';  color = '#fca5a5'; boxShadow = undefined;
    } else if (isDone) {
        bg = 'rgba(34,211,238,0.1)';  borderColor = 'rgba(34,211,238,0.4)'; color = '#22d3ee'; boxShadow = undefined;
    } else if (isActive) {
        bg = 'rgba(34,211,238,0.15)'; borderColor = '#22d3ee';              color = '#22d3ee'; boxShadow = '0 0 8px rgba(34,211,238,0.3)';
    } else {
        bg = 'rgba(255,255,255,0.04)';borderColor = 'rgba(255,255,255,0.10)';color = 'rgba(255,255,255,0.2)'; boxShadow = undefined;
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
                    style={{ background: isDone ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.07)' }}
                />
            )}
        </>
    );
}
