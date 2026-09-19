/**
 * Electron 44 opens every `defaultPath`-less dialog in Downloads and no
 * longer lets the OS remember the last directory. These helpers stand in
 * for that memory, so what they pin is the shape of it: per-dialog keys,
 * a seed that only applies until the user picks something, and the
 * file-vs-directory distinction that decides whether the chosen path is
 * the directory or merely sits in one.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { recallDialogPath, rememberDialogPath, resetDialogPaths } from '../dialogDefaults';

describe('dialog defaults', () => {
    beforeEach(() => resetDialogPaths());

    it('falls back to the seed until a choice has been made', () => {
        expect(recallDialogPath('logs', '/home/a/arcdps')).toBe('/home/a/arcdps');
        rememberDialogPath('logs', '/mnt/logs', 'directory');
        expect(recallDialogPath('logs', '/home/a/arcdps')).toBe('/mnt/logs');
    });

    it('returns undefined with neither a seed nor a memory, leaving Electron its own default', () => {
        expect(recallDialogPath('logs')).toBeUndefined();
        expect(recallDialogPath('logs', null)).toBeUndefined();
        expect(recallDialogPath('logs', '')).toBeUndefined();
    });

    it('stores a file’s parent directory but a directory as itself', () => {
        rememberDialogPath('settings', '/home/a/Documents/axibridge-settings.json');
        expect(recallDialogPath('settings')).toBe('/home/a/Documents');
        rememberDialogPath('logs', '/home/a/Documents', 'directory');
        expect(recallDialogPath('logs')).toBe('/home/a/Documents');
    });

    it('keeps dialogs apart, so picking a settings file does not move the log picker', () => {
        rememberDialogPath('logs', '/mnt/logs', 'directory');
        rememberDialogPath('settings', '/home/a/settings.json');
        expect(recallDialogPath('logs')).toBe('/mnt/logs');
        expect(recallDialogPath('settings')).toBe('/home/a');
    });

    it('ignores a cancelled dialog rather than forgetting where it was', () => {
        rememberDialogPath('logs', '/mnt/logs', 'directory');
        rememberDialogPath('logs', undefined, 'directory');
        rememberDialogPath('logs', null, 'directory');
        expect(recallDialogPath('logs')).toBe('/mnt/logs');
    });
});
