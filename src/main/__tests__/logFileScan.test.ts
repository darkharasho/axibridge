import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanLogFiles } from '../logFileScan';

let root: string;

function write(relative: string, mtimeMs?: number): string {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'x');
    if (mtimeMs !== undefined) fs.utimesSync(full, mtimeMs / 1000, mtimeMs / 1000);
    return full;
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'logscan-'));
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe('scanLogFiles', () => {
    it('finds logs nested in arcdps encounter subfolders', async () => {
        write('World vs World/20260918-203000.zevtc');
        write('Eternal Battlegrounds/20260918-204500.evtc');
        write('top-level.zevtc');

        const files = await scanLogFiles(root);

        expect(files.map((f) => f.relativePath).sort()).toEqual([
            'Eternal Battlegrounds/20260918-204500.evtc',
            'World vs World/20260918-203000.zevtc',
            'top-level.zevtc'
        ]);
    });

    it('keeps name as the basename so encounter parsing still works', async () => {
        write('World vs World/20260918-203000.zevtc');

        const [file] = await scanLogFiles(root);

        expect(file.name).toBe('20260918-203000.zevtc');
        expect(file.relativePath).toBe('World vs World/20260918-203000.zevtc');
    });

    it('sorts newest first across folders', async () => {
        write('a/old.zevtc', 1_000_000);
        write('b/new.zevtc', 9_000_000);
        write('middle.zevtc', 5_000_000);

        const files = await scanLogFiles(root);

        expect(files.map((f) => f.name)).toEqual(['new.zevtc', 'middle.zevtc', 'old.zevtc']);
    });

    it('excludes json unless allowJson is set', async () => {
        write('nested/report.json');

        expect(await scanLogFiles(root)).toEqual([]);
        expect((await scanLogFiles(root, { allowJson: true })).map((f) => f.relativePath))
            .toEqual(['nested/report.json']);
    });

    it('stops descending past maxDepth', async () => {
        write('one/two/three/deep.zevtc');

        expect(await scanLogFiles(root, { maxDepth: 2 })).toEqual([]);
        expect((await scanLogFiles(root, { maxDepth: 3 })).map((f) => f.name)).toEqual(['deep.zevtc']);
    });

    it('does not follow symlinked directories, so a cycle cannot hang the scan', async () => {
        write('real/inner.zevtc');
        fs.symlinkSync(root, path.join(root, 'loop'), 'dir');

        const files = await scanLogFiles(root);

        expect(files.map((f) => f.relativePath)).toEqual(['real/inner.zevtc']);
    });

    it('skips an unreadable subfolder instead of losing every log', async () => {
        write('readable/good.zevtc');
        const locked = path.join(root, 'locked');
        fs.mkdirSync(locked);
        fs.writeFileSync(path.join(locked, 'hidden.zevtc'), 'x');
        fs.chmodSync(locked, 0o000);

        try {
            const files = await scanLogFiles(root);
            expect(files.map((f) => f.relativePath)).toEqual(['readable/good.zevtc']);
        } finally {
            fs.chmodSync(locked, 0o700);
        }
    });
});
