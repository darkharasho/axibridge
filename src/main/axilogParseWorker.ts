/**
 * Worker-thread host for axilog's native parse.
 *
 * `@axiapps/axilog` exposes no async API: `parseFileEi` and `parseFile` are
 * synchronous N-API calls that occupy the calling thread for the whole parse
 * (measured 0.6-1.3s per WvW log). Called from the Electron **browser**
 * process's main thread — as they were until this file existed — they stop
 * that process servicing the compositor, so the window presents no frames at
 * all for the duration. The symptom is the whole app freezing mid-animation
 * while nothing in the renderer is actually busy.
 *
 * Running them here costs one structured clone of the result (negligible next
 * to the parse) and buys an unblocked browser process.
 *
 * Deliberately NOT done here: `applyEiCompatShims`. It learns into the
 * persistent skill-name cache (see `skillNameCache.ts`), which is process-
 * global state owned by the main thread, and it costs 1-3ms — so it stays
 * where the cache lives.
 */

import { parentPort } from 'worker_threads';
import { buildNativeCarrySet } from './nativeCarrySet';
import type { AxilogParseOptions } from './axilogParser';

export interface AxilogParseRequest {
    id: number;
    logPath: string;
    options: AxilogParseOptions;
}

export type AxilogParseResponse =
    | { id: number; ok: true; details: unknown; nativeError: string | null }
    | { id: number; ok: false; error: string };

if (!parentPort) throw new Error('axilogParseWorker must be run as a worker thread');
const port = parentPort;

// Resolved once, on this thread. A failure here surfaces as a job error, which
// the host turns into a permanent fallback to the in-process parse.
const binding = require('@axiapps/axilog');

port.on('message', (req: AxilogParseRequest) => {
    try {
        const details = binding.parseFileEi(req.logPath, req.options) as any;
        // A native failure must never fail the parse — it degrades the migrated
        // readers only. Reported back so the main thread can log it.
        let nativeError: string | null = null;
        if (typeof binding.parseFile === 'function') {
            try {
                const carry = buildNativeCarrySet(binding.parseFile(req.logPath, req.options));
                if (carry) details.native = carry;
            } catch (err) {
                nativeError = String(err);
            }
        }
        const response: AxilogParseResponse = { id: req.id, ok: true, details, nativeError };
        port.postMessage(response);
    } catch (err) {
        const response: AxilogParseResponse = { id: req.id, ok: false, error: String(err) };
        port.postMessage(response);
    }
});
