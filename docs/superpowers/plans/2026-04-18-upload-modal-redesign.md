# Upload Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal WebUploadOverlay with a step-by-step progress modal plus a streaming activity log, and refresh the WebUploadBanner with an icon, build-status pill, and consolidated copy button.

**Architecture:** Two component rewrites, no hook or state changes. `WebUploadOverlay` gains component-local log state accumulated from incoming `webUploadState.message` changes. `WebUploadBanner` gets a new layout with a leading icon, inline build-status pill, and a single Copy button that prefers the short URL when available.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React icons, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-04-17-upload-modal-redesign.md`

---

## File Map

| File | Action |
|------|--------|
| `src/renderer/app/WebUploadOverlay.tsx` | Full rewrite |
| `src/renderer/stats/ui/WebUploadBanner.tsx` | Rewrite |
| `src/renderer/__tests__/WebUploadOverlay.test.tsx` | Create |
| `src/renderer/__tests__/WebUploadBanner.test.tsx` | Replace |

No other files change.

---

## Task 1: Rewrite WebUploadOverlay

**Files:**
- Modify: `src/renderer/app/WebUploadOverlay.tsx`
- Create: `src/renderer/__tests__/WebUploadOverlay.test.tsx`

### Background

The current overlay is ~67 lines with a single stage label and a progress bar. The rewrite adds:
- `getUploadStepIndex(stage)` — pure function mapping a stage string to a 0-based step index (0 = Preparing … 4 = Finalizing, -1 for unrecognised strings)
- `getFailedStepIndex(stage)` — extracts which step failed from strings like "Build failed" or "Upload failed"
- Component-local `logEntries` state, accumulated by watching `webUploadState.message` for changes
- Horizontal stepper (5 dots + connectors + labels)
- Scrollable log feed with relative timestamps
- Auto-close (fade-out) when stage reaches 'Complete' or 'Upload complete'
- Failure state: red border, ✕ dot on the failed step, Dismiss button

The component continues to receive the same three props as today: `webUploadState`, `isDev`, `setWebUploadState`.

---

- [ ] **Step 1.1: Write the test file**

Create `src/renderer/__tests__/WebUploadOverlay.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WebUploadOverlay, getUploadStepIndex, getFailedStepIndex } from '../app/WebUploadOverlay';
import type { IWebUploadState } from '../global.d';

const base: IWebUploadState = {
    uploading: false,
    message: null,
    stage: null,
    progress: null,
    detail: null,
    url: null,
    buildStatus: 'idle',
    buildStatusRepo: null,
};

describe('getUploadStepIndex', () => {
    it('returns 0 for Preparing', () => expect(getUploadStepIndex('Preparing')).toBe(0));
    it('returns 1 for Building', () => expect(getUploadStepIndex('Building')).toBe(1));
    it('returns 2 for Packaging', () => expect(getUploadStepIndex('Packaging')).toBe(2));
    it('returns 3 for Uploading', () => expect(getUploadStepIndex('Uploading')).toBe(3));
    it('returns 4 for Finalizing', () => expect(getUploadStepIndex('Finalizing')).toBe(4));
    it('returns -1 for null', () => expect(getUploadStepIndex(null)).toBe(-1));
    it('returns -1 for Complete', () => expect(getUploadStepIndex('Complete')).toBe(-1));
    it('returns -1 for Warning', () => expect(getUploadStepIndex('Warning')).toBe(-1));
    it('returns -1 for Upload failed', () => expect(getUploadStepIndex('Upload failed')).toBe(-1));
    it('is case-insensitive', () => expect(getUploadStepIndex('preparing')).toBe(0));
});

describe('getFailedStepIndex', () => {
    it('returns 1 for Build failed', () => expect(getFailedStepIndex('Build failed')).toBe(1));
    it('returns 3 for Upload failed', () => expect(getFailedStepIndex('Upload failed')).toBe(3));
    it('returns -1 for null', () => expect(getFailedStepIndex(null)).toBe(-1));
    it('returns -1 for unrecognised failure', () => expect(getFailedStepIndex('Something failed')).toBe(-1));
});

describe('WebUploadOverlay', () => {
    it('renders nothing when not uploading and no stage', () => {
        const { container } = render(
            <WebUploadOverlay webUploadState={base} isDev={false} setWebUploadState={vi.fn()} />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders when uploading is true', () => {
        render(
            <WebUploadOverlay
                webUploadState={{ ...base, uploading: true, stage: 'Preparing', message: 'Validating settings...' }}
                isDev={false}
                setWebUploadState={vi.fn()}
            />
        );
        expect(screen.getByText('Preparing')).toBeInTheDocument();
    });

    it('shows step counter when a step is recognised', () => {
        render(
            <WebUploadOverlay
                webUploadState={{ ...base, uploading: true, stage: 'Packaging', message: 'Preparing bundle...' }}
                isDev={false}
                setWebUploadState={vi.fn()}
            />
        );
        expect(screen.getByText('3 / 5')).toBeInTheDocument();
    });

    it('shows five step labels', () => {
        render(
            <WebUploadOverlay
                webUploadState={{ ...base, uploading: true, stage: 'Uploading', message: 'Uploading...' }}
                isDev={false}
                setWebUploadState={vi.fn()}
            />
        );
        for (const label of ['Prepare', 'Build', 'Package', 'Upload', 'Finalize']) {
            expect(screen.getByText(label)).toBeInTheDocument();
        }
    });

    it('shows Dismiss button on failure', () => {
        render(
            <WebUploadOverlay
                webUploadState={{ ...base, stage: 'Upload failed', message: 'Auth failed.' }}
                isDev={false}
                setWebUploadState={vi.fn()}
            />
        );
        expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });

    it('calls setWebUploadState when Dismiss is clicked', () => {
        const setFn = vi.fn();
        render(
            <WebUploadOverlay
                webUploadState={{ ...base, stage: 'Upload failed', message: 'Auth failed.' }}
                isDev={false}
                setWebUploadState={setFn}
            />
        );
        screen.getByRole('button', { name: /dismiss/i }).click();
        expect(setFn).toHaveBeenCalled();
    });
});
```

- [ ] **Step 1.2: Run tests — verify they fail**

```bash
npx vitest run src/renderer/__tests__/WebUploadOverlay.test.tsx
```

Expected: all tests FAIL with "getUploadStepIndex is not exported" or similar. If they pass, the old file already exports those names — investigate before continuing.

- [ ] **Step 1.3: Rewrite WebUploadOverlay.tsx**

Replace the entire contents of `src/renderer/app/WebUploadOverlay.tsx` with:

```tsx
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
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
```

- [ ] **Step 1.4: Run tests — verify they pass**

```bash
npx vitest run src/renderer/__tests__/WebUploadOverlay.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/renderer/app/WebUploadOverlay.tsx src/renderer/__tests__/WebUploadOverlay.test.tsx
git commit -m "feat: redesign WebUploadOverlay with stepper and activity log"
```

---

## Task 2: Rewrite WebUploadBanner

**Files:**
- Modify: `src/renderer/stats/ui/WebUploadBanner.tsx`
- Modify: `src/renderer/__tests__/WebUploadBanner.test.tsx`

### Background

The existing banner has two copy buttons ("Copy URL" and "Copy Short") and no leading icon. The redesign:
- Adds a leading 32px rounded-square icon (globe → checkmark → ✕ based on build status)
- Moves the build-status badge inline with the "PUBLISHED" eyebrow label
- Collapses "Copy URL" + "Copy Short" → a single **Copy** button that copies the short URL when available, full URL otherwise
- Adds an **Open ↗** button that calls `openExternal` (the existing URL click on the text is kept as-is)
- The `shortUrl` derivation logic is unchanged

The two existing tests will break because they reference "Copy Short" text. Replace the whole test file.

---

- [ ] **Step 2.1: Replace the test file**

Overwrite `src/renderer/__tests__/WebUploadBanner.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebUploadBanner } from '../stats/ui/WebUploadBanner';

const setupClipboard = () => {
    Object.assign(navigator, {
        clipboard: { writeText: vi.fn() }
    });
};

describe('WebUploadBanner', () => {
    beforeEach(() => {
        setupClipboard();
    });

    it('renders nothing when embedded', () => {
        const { container } = render(
            <WebUploadBanner
                embedded
                webUploadMessage="Uploaded: https://foo.github.io/?report=abc"
                webUploadUrl="https://foo.github.io/?report=abc"
                webUploadBuildStatus="built"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when no message', () => {
        const { container } = render(
            <WebUploadBanner
                embedded={false}
                webUploadBuildStatus="idle"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('Copy button copies short URL when available (no Copy Short button)', () => {
        render(
            <WebUploadBanner
                embedded={false}
                webUploadMessage="Uploaded: https://gw2dui.github.io/gw2dui.github.io/?report=abc123"
                webUploadUrl="https://gw2dui.github.io/gw2dui.github.io/?report=abc123"
                webUploadBuildStatus="built"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        // The old "Copy Short" button must be gone
        expect(screen.queryByText(/Copy Short/i)).toBeNull();
        // The single Copy button writes the short form
        screen.getByRole('button', { name: /^copy$/i }).click();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://gw2dui.github.io/?report=abc123');
    });

    it('Copy button copies full URL when short URL is not available', () => {
        render(
            <WebUploadBanner
                embedded={false}
                webUploadMessage="Uploaded: https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadUrl="https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadBuildStatus="built"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        screen.getByRole('button', { name: /^copy$/i }).click();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            'https://darkharasho.github.io/fight-reports/?report=abc123'
        );
    });

    it('shows Building… pill when build status is checking', () => {
        render(
            <WebUploadBanner
                embedded={false}
                webUploadMessage="Uploaded: https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadUrl="https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadBuildStatus="checking"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        expect(screen.getByText(/Building/i)).toBeInTheDocument();
    });

    it('shows Live pill when build status is built', () => {
        render(
            <WebUploadBanner
                embedded={false}
                webUploadMessage="Uploaded: https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadUrl="https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadBuildStatus="built"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        expect(screen.getByText(/Live/i)).toBeInTheDocument();
    });

    it('shows Build failed pill when errored', () => {
        render(
            <WebUploadBanner
                embedded={false}
                webUploadMessage="Uploaded: https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadUrl="https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadBuildStatus="errored"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        expect(screen.getByText(/Build failed/i)).toBeInTheDocument();
    });

    it('Open button calls openExternal with the display URL', () => {
        const openExternal = vi.fn();
        Object.defineProperty(window, 'electronAPI', { value: { openExternal }, writable: true });
        render(
            <WebUploadBanner
                embedded={false}
                webUploadMessage="Uploaded: https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadUrl="https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadBuildStatus="built"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        screen.getByRole('button', { name: /open/i }).click();
        expect(openExternal).toHaveBeenCalledWith(
            'https://darkharasho.github.io/fight-reports/?report=abc123'
        );
    });
});
```

- [ ] **Step 2.2: Run tests — verify they fail**

```bash
npx vitest run src/renderer/__tests__/WebUploadBanner.test.tsx
```

Expected: several tests FAIL because the current banner still has "Copy Short" and no "Open" button. If all pass, the old component already matches — investigate before continuing.

- [ ] **Step 2.3: Rewrite WebUploadBanner.tsx**

Replace the entire contents of `src/renderer/stats/ui/WebUploadBanner.tsx` with:

```tsx
import type { CSSProperties } from 'react';
import { Loader2 } from 'lucide-react';
import type { WebUploadBuildStatus } from '../global.d';

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
```

- [ ] **Step 2.4: Run tests — verify they pass**

```bash
npx vitest run src/renderer/__tests__/WebUploadBanner.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 2.5: Run full test suite and type-check**

```bash
npm run validate
```

Expected: no TypeScript errors, no lint errors, all tests pass. Fix any issues before committing.

- [ ] **Step 2.6: Commit**

```bash
git add src/renderer/stats/ui/WebUploadBanner.tsx src/renderer/__tests__/WebUploadBanner.test.tsx
git commit -m "feat: redesign WebUploadBanner with icon, build pill, and consolidated copy"
```

---

## Manual Verification Checklist

After both tasks are committed, run `npm run dev` and verify:

- [ ] Trigger a web upload — stepper advances through Prepare → Build → Package → Upload → Finalize, log lines appear with timestamps
- [ ] Modal auto-fades when upload completes; banner appears with globe icon and "Building…" pill
- [ ] Build poll completes → banner switches to "✓ Live"  
- [ ] Copy button writes short URL when available, full URL otherwise; no "Copy Short" button present
- [ ] Open ↗ opens the URL in the browser
- [ ] Trigger a failure (e.g. revoke the GitHub token in Settings) — modal shows red border, ✕ on the failed step, "failed at step N" in footer, Dismiss button
- [ ] Clicking backdrop or Dismiss closes the failure modal
