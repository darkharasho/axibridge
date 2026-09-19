import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { restoreMissingAppImage, discardAppImagePlaceholder } from '../appImageInstall';

let dir: string;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appimage-install-'));
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('restoreMissingAppImage', () => {
    it('reports not-appimage when $APPIMAGE is unset', () => {
        expect(restoreMissingAppImage(undefined)).toBe('not-appimage');
        expect(restoreMissingAppImage('')).toBe('not-appimage');
    });

    it('leaves an existing AppImage untouched', () => {
        const p = path.join(dir, 'AxiBridge-3.13.0.AppImage');
        fs.writeFileSync(p, 'real appimage bytes');

        expect(restoreMissingAppImage(p)).toBe('present');
        expect(fs.readFileSync(p, 'utf8')).toBe('real appimage bytes');
    });

    it('recreates the path when the running AppImage has been deleted', () => {
        // The reported failure: 3.11.0 is still running, its file is gone, and
        // the updater unlinks $APPIMAGE before doing anything else.
        const p = path.join(dir, 'AxiBridge-3.11.0.AppImage');

        expect(restoreMissingAppImage(p)).toBe('restored');
        expect(fs.existsSync(p)).toBe(true);
        expect(fs.statSync(p).size).toBe(0);
    });

    it('reports failed when the path cannot be created', () => {
        const p = path.join(dir, 'gone', 'AxiBridge-3.11.0.AppImage');

        expect(restoreMissingAppImage(p)).toBe('failed');
        expect(fs.existsSync(p)).toBe(false);
    });
});

describe('discardAppImagePlaceholder', () => {
    it('removes a placeholder left behind by a failed install', () => {
        const p = path.join(dir, 'AxiBridge-3.11.0.AppImage');
        fs.writeFileSync(p, '');

        expect(discardAppImagePlaceholder(p)).toBe(true);
        expect(fs.existsSync(p)).toBe(false);
    });

    it('never removes a real AppImage installed in place', () => {
        const p = path.join(dir, 'AxiBridge.AppImage');
        fs.writeFileSync(p, 'new appimage bytes');

        expect(discardAppImagePlaceholder(p)).toBe(false);
        expect(fs.existsSync(p)).toBe(true);
    });

    it('is a no-op when the path is already gone or unset', () => {
        expect(discardAppImagePlaceholder(path.join(dir, 'nope.AppImage'))).toBe(false);
        expect(discardAppImagePlaceholder(undefined)).toBe(false);
    });
});
