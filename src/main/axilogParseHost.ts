/**
 * Main-thread side of the off-thread native parse.
 *
 * Owns one long-lived {@link Worker} running `axilogParseWorker`, and feeds it
 * one job at a time — the same serialisation the in-process parse had, so peak
 * memory is unchanged. The worker is spawned lazily on the first parse and
 * kept alive afterwards: spawning costs ~30ms and loading the binding 1-2ms,
 * neither of which is worth paying per log.
 *
 * ## Fallback
 *
 * If the worker cannot be spawned, cannot load the binding, or dies, this
 * reports unavailable *permanently* and the caller parses in-process exactly
 * as before. That keeps the worst case equal to the old behaviour (a frozen
 * window) rather than a failed parse — but it is silent to the user, so the
 * reason is logged loudly. The case worth watching is a packaged build, where
 * the worker file is read from inside `app.asar`.
 */

import { Worker } from 'worker_threads';
import path from 'path';
import type { AxilogParseOptions } from './axilogParser';
import type { AxilogParseRequest, AxilogParseResponse } from './axilogParseWorker';

export interface NativeParseResult {
    details: unknown;
    /** Set when `parseFile` (the native carry-set) failed; the EI half is still good. */
    nativeError: string | null;
}

interface Job {
    req: AxilogParseRequest;
    resolve: (result: NativeParseResult) => void;
    reject: (err: Error) => void;
}

/** Thrown when the worker is unusable; the caller must parse in-process. */
export class ParseWorkerUnavailable extends Error {}

const WORKER_PATH = path.join(__dirname, 'axilogParseWorker.js');

let worker: Worker | null = null;
let unavailable = false;
let active: Job | null = null;
const queue: Job[] = [];
let nextId = 1;

const disable = (reason: string) => {
    if (unavailable) return;
    unavailable = true;
    console.warn(
        `[axilog] parse worker unavailable (${reason}); falling back to in-process parsing. ` +
        'Logs will still parse, but the window will freeze while they do.'
    );
};

/** Fail whatever is in flight and everything queued behind it. */
const failAll = (err: Error) => {
    const pending = active ? [active, ...queue] : [...queue];
    active = null;
    queue.length = 0;
    pending.forEach((job) => job.reject(err));
};

const onMessage = (msg: AxilogParseResponse) => {
    const job = active;
    if (!job || job.req.id !== msg.id) return;
    active = null;
    if (msg.ok) {
        job.resolve({ details: msg.details, nativeError: msg.nativeError });
    } else {
        job.reject(new Error(msg.error));
    }
    pump();
};

const ensureWorker = (): Worker | null => {
    if (unavailable) return null;
    if (worker) return worker;
    try {
        const spawned = new Worker(WORKER_PATH);
        spawned.on('message', onMessage);
        spawned.on('error', (err) => {
            worker = null;
            disable(String(err));
            failAll(new ParseWorkerUnavailable(String(err)));
        });
        spawned.on('exit', (code) => {
            worker = null;
            if (code !== 0) {
                disable(`worker exited with code ${code}`);
                failAll(new ParseWorkerUnavailable(`worker exited with code ${code}`));
            }
        });
        // Never hold the app open on the worker's account.
        spawned.unref();
        worker = spawned;
        return worker;
    } catch (err) {
        disable(String(err));
        return null;
    }
};

const pump = () => {
    if (active || queue.length === 0) return;
    const host = ensureWorker();
    if (!host) {
        failAll(new ParseWorkerUnavailable('parse worker could not be started'));
        return;
    }
    active = queue.shift()!;
    host.postMessage(active.req);
};

/**
 * Parse `logPath` on the worker thread.
 *
 * Rejects with {@link ParseWorkerUnavailable} when the caller should parse
 * in-process instead; any other rejection is a genuine parse failure.
 */
export const parseOffThread = (logPath: string, options: AxilogParseOptions): Promise<NativeParseResult> => {
    if (unavailable) return Promise.reject(new ParseWorkerUnavailable('parse worker disabled'));
    return new Promise<NativeParseResult>((resolve, reject) => {
        queue.push({ req: { id: nextId++, logPath, options }, resolve, reject });
        pump();
    });
};

/** Shut the worker down. Called on app quit alongside the other teardown. */
export const shutdownParseWorker = async (): Promise<void> => {
    const host = worker;
    worker = null;
    if (host) await host.terminate();
};
