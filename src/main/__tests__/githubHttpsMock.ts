import { EventEmitter } from 'node:events';
import https from 'node:https';
import { vi } from 'vitest';

export type MockResponse = { status: number; body?: unknown };
export interface RecordedCall { method: string; path: string; body: unknown }

/** Stub https.request; returns the live array of recorded calls. */
export function installHttpsMock(responder: (call: RecordedCall) => MockResponse): RecordedCall[] {
    const calls: RecordedCall[] = [];
    vi.spyOn(https, 'request').mockImplementation((options: any, cb: any) => {
        const req = new EventEmitter() as any;
        let payload = '';
        req.write = (chunk: string) => { payload += chunk; };
        req.setTimeout = () => req;
        req.destroy = () => undefined;
        req.end = () => {
            const call: RecordedCall = {
                method: options.method,
                path: options.path,
                body: payload ? JSON.parse(payload) : null
            };
            calls.push(call);
            queueMicrotask(() => {
                const { status, body } = responder(call);
                const res = new EventEmitter() as any;
                res.statusCode = status;
                res.setEncoding = () => {};
                cb(res);
                if (body !== undefined) res.emit('data', JSON.stringify(body));
                res.emit('end');
            });
        };
        return req;
    });
    return calls;
}
