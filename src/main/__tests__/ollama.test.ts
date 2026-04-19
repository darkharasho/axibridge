// Note: this file tests main-process code, so the "node" vitest environment would be
// semantically correct. However, the global setup file (src/renderer/test/setup.ts)
// references `window`, which is undefined in the node environment. Switching environments
// breaks the suite. Tests pass correctly under the default jsdom environment.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaManager } from '../ollama';

const BASE = 'http://localhost:11434';

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('OllamaManager.getStatus', () => {
    it('returns connected=true with model list when Ollama responds', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ models: [{ name: 'llama3.1:8b' }, { name: 'mistral:7b' }] }),
        }));
        const mgr = new OllamaManager();
        const status = await mgr.getStatus();
        expect(status.connected).toBe(true);
        expect(status.models).toEqual(['llama3.1:8b', 'mistral:7b']);
        expect(fetch).toHaveBeenCalledWith(`${BASE}/api/tags`);
    });

    it('returns connected=false when fetch throws', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
        const mgr = new OllamaManager();
        const status = await mgr.getStatus();
        expect(status.connected).toBe(false);
        expect(status.models).toEqual([]);
    });

    it('returns connected=false when response is not ok', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
        const mgr = new OllamaManager();
        const status = await mgr.getStatus();
        expect(status.connected).toBe(false);
    });
});

describe('OllamaManager.pullModel', () => {
    it('calls onProgress with parsed percent and status, resolves when done', async () => {
        const lines = [
            JSON.stringify({ status: 'downloading', completed: 50, total: 100 }),
            JSON.stringify({ status: 'done', completed: 100, total: 100 }),
        ].join('\n');

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            body: {
                getReader: () => {
                    let called = false;
                    return {
                        read: async () => {
                            if (!called) {
                                called = true;
                                return { value: new TextEncoder().encode(lines), done: false };
                            }
                            return { done: true };
                        },
                    };
                },
            },
        }));

        const onProgress = vi.fn();
        const mgr = new OllamaManager();
        await mgr.pullModel('llama3.1:8b', onProgress);

        expect(onProgress).toHaveBeenCalledWith({ percent: 50, status: 'downloading' });
        expect(fetch).toHaveBeenCalledWith(`${BASE}/api/pull`, expect.objectContaining({ method: 'POST' }));
    });
});

describe('OllamaManager.chat', () => {
    it('streams tokens via onToken callback and resolves when done=true', async () => {
        const lines = [
            JSON.stringify({ message: { content: 'Hello' }, done: false }),
            JSON.stringify({ message: { content: ' world' }, done: false }),
            JSON.stringify({ message: { content: '' }, done: true }),
        ].join('\n');

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            body: {
                getReader: () => {
                    let called = false;
                    return {
                        read: async () => {
                            if (!called) {
                                called = true;
                                return { value: new TextEncoder().encode(lines), done: false };
                            }
                            return { done: true };
                        },
                    };
                },
            },
        }));

        const onToken = vi.fn();
        const mgr = new OllamaManager();
        await mgr.chat([{ role: 'user', content: 'hi' }], 'llama3.1:8b', onToken);

        expect(onToken).toHaveBeenCalledWith('Hello', false);
        expect(onToken).toHaveBeenCalledWith(' world', false);
        expect(onToken).toHaveBeenCalledWith('', true);
        expect(fetch).toHaveBeenCalledWith(
            `${BASE}/api/chat`,
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('throws if response is not ok', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
        const mgr = new OllamaManager();
        await expect(mgr.chat([], 'llama3.1:8b', vi.fn())).rejects.toThrow();
    });
});
