/**
 * Startup timeline for "it takes ages to show up" reports.
 *
 * Every mark is logged as time since the process started (Node's
 * `performance.timeOrigin`), plus the gap since the previous mark, so a
 * user's main.log says which step the wait went into rather than just that
 * there was one. Renderer marks arrive over IPC carrying their own epoch
 * timestamp, so a busy main thread delays the log line but not the number.
 *
 * Alongside the marks, a short-lived watchdog reports every event-loop block
 * over {@link BLOCK_REPORT_MS} during the first minute — a step that is fast
 * by its own mark can still be followed by a synchronous stall nothing marks.
 */
import { performance } from 'node:perf_hooks';

export const BLOCK_REPORT_MS = 300;
const WATCHDOG_INTERVAL_MS = 100;
const WATCHDOG_LIFETIME_MS = 60_000;

type Logger = (message: string) => void;

export interface BootTimeline {
    mark: (label: string) => void;
    /** A mark recorded elsewhere (the renderer) at epoch time `atEpochMs`. */
    markAt: (label: string, atEpochMs: number) => void;
    stop: () => void;
}

export interface BootTimelineOptions {
    log: Logger;
    /** Epoch ms the process started. */
    originEpochMs?: number;
    now?: () => number;
    setInterval?: (fn: () => void, ms: number) => any;
    clearInterval?: (handle: any) => void;
}

export const formatBootMark = (label: string, sinceStartMs: number, sincePrevMs: number): string =>
    `[Boot] +${Math.round(sinceStartMs)}ms (Δ${Math.round(sincePrevMs)}ms) ${label}`;

export const createBootTimeline = ({
    log,
    originEpochMs = performance.timeOrigin,
    now = Date.now,
    setInterval: setIntervalFn = setInterval,
    clearInterval: clearIntervalFn = clearInterval,
}: BootTimelineOptions): BootTimeline => {
    let prevEpochMs = originEpochMs;

    const markAt = (label: string, atEpochMs: number) => {
        log(formatBootMark(label, atEpochMs - originEpochMs, atEpochMs - prevEpochMs));
        if (atEpochMs > prevEpochMs) prevEpochMs = atEpochMs;
    };

    const watchdogStartedAt = now();
    let expectedAt = watchdogStartedAt + WATCHDOG_INTERVAL_MS;
    const handle = setIntervalFn(() => {
        const at = now();
        const late = at - expectedAt;
        if (late >= BLOCK_REPORT_MS) {
            log(`[Boot] main thread blocked ~${Math.round(late)}ms, ending at +${Math.round(at - originEpochMs)}ms`);
        }
        expectedAt = at + WATCHDOG_INTERVAL_MS;
        if (at - watchdogStartedAt >= WATCHDOG_LIFETIME_MS) clearIntervalFn(handle);
    }, WATCHDOG_INTERVAL_MS);
    if (handle && typeof handle.unref === 'function') handle.unref();

    return {
        mark: (label) => markAt(label, now()),
        markAt,
        stop: () => clearIntervalFn(handle),
    };
};
