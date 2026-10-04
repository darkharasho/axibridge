import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installHttpsMock, type RecordedCall } from './githubHttpsMock';
import {
    getRepoPermissions,
    getViewerLogin,
    invalidateRepoPermissions,
    resetGithubApiCaches
} from '../githubApi';

let calls: RecordedCall[];

describe('githubApi', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        resetGithubApiCaches();
    });

    it('caches the viewer login per token', async () => {
        calls = installHttpsMock(() => ({ status: 200, body: { login: 'kyra' } }));
        expect(await getViewerLogin('t1')).toBe('kyra');
        expect(await getViewerLogin('t1')).toBe('kyra');
        expect(calls.filter((c) => c.path === '/user')).toHaveLength(1);
    });

    it('does not cache a failed viewer lookup', async () => {
        let status = 500;
        calls = installHttpsMock(() => ({ status, body: { login: 'kyra' } }));
        expect(await getViewerLogin('t1')).toBeNull();
        status = 200;
        expect(await getViewerLogin('t1')).toBe('kyra');
    });

    it('reads admin/push/ownerType from GET /repos', async () => {
        calls = installHttpsMock(() => ({
            status: 200,
            body: { owner: { type: 'Organization' }, permissions: { admin: true, push: true } }
        }));
        expect(await getRepoPermissions('guild', 'reports', 't1')).toEqual({
            admin: true, push: true, ownerType: 'Organization'
        });
        expect(calls[0].path).toBe('/repos/guild/reports');
    });

    it('treats a failed lookup as no permissions and does not cache it', async () => {
        let status = 404;
        calls = installHttpsMock(() => ({ status, body: { owner: { type: 'User' }, permissions: { admin: true, push: true } } }));
        expect(await getRepoPermissions('a', 'b', 't1')).toEqual({ admin: false, push: false, ownerType: null });
        status = 200;
        expect((await getRepoPermissions('a', 'b', 't1')).admin).toBe(true);
    });

    it('caches permissions until invalidated', async () => {
        calls = installHttpsMock(() => ({ status: 200, body: { owner: { type: 'User' }, permissions: { push: true } } }));
        await getRepoPermissions('a', 'b', 't1');
        await getRepoPermissions('A', 'B', 't1');
        expect(calls).toHaveLength(1);
        invalidateRepoPermissions('a', 'b');
        await getRepoPermissions('a', 'b', 't1');
        expect(calls).toHaveLength(2);
    });
});
