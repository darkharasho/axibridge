import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
    app: { isPackaged: false, getPath: () => '/tmp', getAppPath: () => '/tmp', getVersion: () => '3.20.0' },
    BrowserWindow: class {},
    shell: { openExternal: vi.fn() }
}));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { installHttpsMock, type MockResponse, type RecordedCall } from '../../__tests__/githubHttpsMock';
import { makeGitCommitter, readGitBase, readSiteIndexRaw } from '../githubHandlers';

describe('shared-site git helpers', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('readGitBase resolves head, tree and a blob-only path map', async () => {
        installHttpsMock((c: RecordedCall): MockResponse => {
            if (c.path.endsWith('/git/ref/heads/main')) return { status: 200, body: { object: { sha: 'h1' } } };
            if (c.path.endsWith('/git/commits/h1')) return { status: 200, body: { tree: { sha: 't1' } } };
            if (c.path.includes('/git/trees/t1')) return { status: 200, body: { tree: [
                { path: 'reports', type: 'tree', sha: 'd' },
                { path: 'reports/index.json', type: 'blob', sha: 'b1' }
            ] } };
            return { status: 404 };
        });
        const base = await readGitBase('o', 'r', 'main', 'tok');
        expect(base.headSha).toBe('h1');
        expect(base.treeSha).toBe('t1');
        expect([...base.treeMap.entries()]).toEqual([['reports/index.json', 'b1']]);
    });

    it('readSiteIndexRaw returns null when the index is absent', async () => {
        installHttpsMock(() => ({ status: 404 }));
        expect(await readSiteIndexRaw('o', 'r', 'tok', new Map(), '')).toBeNull();
    });

    it('readSiteIndexRaw throws on a corrupt index instead of treating it as empty', async () => {
        installHttpsMock(() => ({ status: 200, body: { content: Buffer.from('{not json').toString('base64'), encoding: 'base64' } }));
        await expect(readSiteIndexRaw('o', 'r', 'tok', new Map([['reports/index.json', 'b1']]), ''))
            .rejects.toThrow(/reports\/index\.json/);
    });

    it('makeGitCommitter parents on the base head and fast-forwards the ref', async () => {
        const calls = installHttpsMock((c) => {
            if (c.path.endsWith('/git/trees')) return { status: 201, body: { sha: 'nt' } };
            if (c.path.endsWith('/git/commits')) return { status: 201, body: { sha: 'nc' } };
            return { status: 200, body: {} };
        });
        const sha = await makeGitCommitter('o', 'r', 'main', 'tok', 'msg')(
            { headSha: 'h1', treeSha: 't1', treeEntries: [], treeMap: new Map() },
            [{ path: 'a', sha: 'x' }]
        );
        expect(sha).toBe('nc');
        expect(calls.find((c) => c.path.endsWith('/git/commits'))!.body).toMatchObject({ parents: ['h1'], tree: 'nt' });
        expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ sha: 'nc', force: false });
    });
});
