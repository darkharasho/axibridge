/**
 * Measure how badly the main process's event loop is being blocked.
 *
 * "The app says Not Responding" is unactionable on its own: the window stops
 * presenting frames whenever the browser process's main thread is busy, and
 * nothing in the log says for how long or when. A timer that knows when it was
 * supposed to fire answers both — if a 1s interval fires 8s late, the thread
 * was blocked for ~7s, and the diagnostics line that reports it is timestamped.
 *
 * Deliberately a peak-since-last-read rather than a running average: one 8s
 * block inside a five-minute window is the entire problem, and an average over
 * that window reads as a few tens of milliseconds.
 */

export interface EventLoopLatenessMonitor {
    /** Worst lateness seen since the last {@link takePeakMs}, in ms. */
    peakMs: () => number;
    /** Read and reset the peak. */
    takePeakMs: () => number;
    stop: () => void;
}

export interface StartLatenessOptions {
    intervalMs?: number;
    setInterval?: (fn: () => void, ms: number) => any;
    clearInterval?: (handle: any) => void;
    now?: () => number;
}

export const startEventLoopLatenessMonitor = ({
    intervalMs = 1000,
    setInterval: setIntervalFn = setInterval,
    clearInterval: clearIntervalFn = clearInterval,
    now = Date.now,
}: StartLatenessOptions = {}): EventLoopLatenessMonitor => {
    let peak = 0;
    let expectedAt = now() + intervalMs;
    const handle = setIntervalFn(() => {
        const at = now();
        const late = at - expectedAt;
        if (late > peak) peak = late;
        // Re-anchor from the current time, not from `expectedAt + intervalMs`:
        // after a long block the latter is far in the past, and every
        // subsequent tick would report the same backlog as fresh lateness.
        expectedAt = at + intervalMs;
    }, intervalMs);
    if (handle && typeof handle.unref === 'function') handle.unref();
    return {
        peakMs: () => Math.max(0, Math.round(peak)),
        takePeakMs: () => {
            const value = Math.max(0, Math.round(peak));
            peak = 0;
            return value;
        },
        stop: () => clearIntervalFn(handle),
    };
};

/**
 * The diagnostics fragment for a peak. Silent below `thresholdMs` so the line
 * does not grow a field that reads 2ms forever — the signal is the outlier.
 */
export const describeLateness = (peakMs: number, thresholdMs = 250): string =>
    (peakMs >= thresholdMs ? `, peakEventLoopBlock: ${(peakMs / 1000).toFixed(1)}s` : '');
