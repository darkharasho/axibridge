import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogWatcher } from '../watcher';

// Real filesystem and a real recursive fs.watch: the bug this guards against
// lived in how the watcher talks to the OS, which a mocked fs cannot show.
const STABILITY_MS = 100;

let root: string;
let watcher: LogWatcher;
let detected: string[];

const settle = (ms = STABILITY_MS * 6) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'axibridge-watcher-'));
    detected = [];
    watcher = new LogWatcher({ stabilityMs: STABILITY_MS, maxDepth: 2 });
    watcher.on('log-detected', (filePath: string) => detected.push(filePath));
});

afterEach(() => {
    watcher.stop();
    fs.rmSync(root, { recursive: true, force: true });
});

describe('LogWatcher', () => {
    it('reports a new log once, including in a subfolder', async () => {
        fs.mkdirSync(path.join(root, 'WvW (1)'));
        watcher.start(root);
        await settle(50);
        const log = path.join(root, 'WvW (1)', '20261008-200000.zevtc');
        fs.writeFileSync(log, 'evtc');
        await settle();
        expect(detected).toEqual([log]);
    });

    it('does not report logs that already existed, even when touched', async () => {
        const old = path.join(root, 'old.zevtc');
        fs.writeFileSync(old, 'evtc');
        watcher.start(root);
        await settle(50);
        fs.appendFileSync(old, 'more');
        await settle();
        expect(detected).toEqual([]);
    });

    it('waits for a log that is still being written to settle', async () => {
        watcher.start(root);
        await settle(50);
        const log = path.join(root, 'growing.evtc');
        fs.writeFileSync(log, 'a');
        for (let i = 0; i < 4; i++) {
            await settle(STABILITY_MS * 0.6);
            fs.appendFileSync(log, 'more');
            expect(detected).toEqual([]);
        }
        await settle();
        expect(detected).toEqual([log]);
    });

    it('ignores non-log files and folders deeper than maxDepth', async () => {
        const deep = path.join(root, 'a', 'b', 'c');
        fs.mkdirSync(deep, { recursive: true });
        watcher.start(root);
        await settle(50);
        fs.writeFileSync(path.join(root, 'notes.txt'), 'x');
        fs.writeFileSync(path.join(deep, 'too-deep.zevtc'), 'x');
        await settle();
        expect(detected).toEqual([]);
    });

    it('reports a log written into a folder created after start', async () => {
        watcher.start(root);
        await settle(50);
        const folder = path.join(root, 'WvW (2)');
        fs.mkdirSync(folder);
        const log = path.join(folder, '20261010-184142.zevtc');
        fs.writeFileSync(log, 'evtc');
        await settle();
        expect(detected).toEqual([log]);
    });

    // On Linux, Node's recursive fs.watch re-read the whole folder on every
    // write to any file in it: one new log written in bursts next to ~4700
    // old ones blocked the main thread for ~35s.
    it('does not block the event loop while a log is written beside thousands of others', async () => {
        for (let i = 0; i < 3000; i++) fs.writeFileSync(path.join(root, `old-${i}.zevtc`), '');
        watcher.start(root);
        await settle(50);
        const log = path.join(root, 'new.zevtc');
        const fd = fs.openSync(log, 'a');
        await settle(50);

        let peakLateMs = 0;
        let expectedAt = Date.now() + 10;
        const probe = setInterval(() => {
            const now = Date.now();
            peakLateMs = Math.max(peakLateMs, now - expectedAt);
            expectedAt = now + 10;
        }, 10);
        const chunk = Buffer.alloc(4096, 1);
        for (let i = 0; i < 2000; i++) fs.writeSync(fd, chunk);
        fs.closeSync(fd);
        await settle();
        clearInterval(probe);

        expect(peakLateMs).toBeLessThan(1000);
        expect(detected).toEqual([log]);
    }, 20_000);

    it('stops reporting after stop()', async () => {
        watcher.start(root);
        await settle(50);
        fs.writeFileSync(path.join(root, 'late.zevtc'), 'x');
        watcher.stop();
        await settle();
        expect(detected).toEqual([]);
    });
});
