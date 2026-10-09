import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installHttpsMock, type RecordedCall } from './githubHttpsMock';
import {
    GithubConnectionError,
    githubApiRequest,
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

describe('githubApiRequest transport failures', () => {
    // What a Windows user saw while publishing: BoringSSL rejecting a corrupted record.
    const badRecordMac = () => Object.assign(
        new Error('33739264:error:100003fc:SSL routines:OPENSSL_internal:SSLV3_ALERT_BAD_RECORD_MAC:..\\..\\third_party\\boringssl\\src\\ssl\\tls_record.cc:491:SSL alert number 20'),
        { code: 'ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC' }
    );

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const settle = async <T>(promise: Promise<T>) => {
        const outcome = promise.then((value) => ({ value }), (error) => ({ error }));
        await vi.runAllTimersAsync();
        return outcome as Promise<{ value?: T; error?: any }>;
    };

    it('retries a blob upload once after a TLS failure', async () => {
        let failures = 1;
        calls = installHttpsMock(() => (failures-- > 0 ? { error: badRecordMac() } : { status: 201, body: { sha: 'abc' } }));
        const { value } = await settle(githubApiRequest('POST', '/repos/a/b/git/blobs', 't', { content: 'x' }));
        expect(value).toEqual({ status: 201, data: { sha: 'abc' } });
        expect(calls).toHaveLength(2);
    });

    it('explains a repeated TLS failure as a local network problem and keeps the original error', async () => {
        calls = installHttpsMock(() => ({ error: badRecordMac() }));
        const { error } = await settle(githubApiRequest('POST', '/repos/a/b/git/blobs', 't', { content: 'x' }));
        expect(calls).toHaveLength(2);
        expect(error).toBeInstanceOf(GithubConnectionError);
        expect(error.message).toMatch(/secure connection to GitHub was broken in transit, twice in a row/);
        expect(error.message).toMatch(/antivirus/);
        expect(error.cause.code).toBe('ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC');
        expect(error.stack).toContain('Request: POST /repos/a/b/git/blobs');
        expect(error.stack).toContain('SSLV3_ALERT_BAD_RECORD_MAC');
    });

    it('does not resend a ref update, but still explains the failure', async () => {
        calls = installHttpsMock(() => ({ error: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) }));
        const { error } = await settle(githubApiRequest('PATCH', '/repos/a/b/git/refs/heads/main', 't', { sha: 'abc' }));
        expect(calls).toHaveLength(1);
        expect(error).toBeInstanceOf(GithubConnectionError);
        expect(error.message).toMatch(/^The connection to GitHub dropped\. /);
    });

    it('leaves errors that are not transport failures alone', async () => {
        calls = installHttpsMock(() => ({ error: new Error('GitHub API request timed out after 60000ms of inactivity: GET /x') }));
        const { error } = await settle(githubApiRequest('GET', '/x', 't'));
        expect(calls).toHaveLength(1);
        expect(error).not.toBeInstanceOf(GithubConnectionError);
    });
});
