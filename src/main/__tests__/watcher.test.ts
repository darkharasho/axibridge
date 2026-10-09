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

    it('stops reporting after stop()', async () => {
        watcher.start(root);
        await settle(50);
        fs.writeFileSync(path.join(root, 'late.zevtc'), 'x');
        watcher.stop();
        await settle();
        expect(detected).toEqual([]);
    });
});
