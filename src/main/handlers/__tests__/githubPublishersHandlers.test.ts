import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn((ch: string, fn: any) => handlers.set(ch, fn)) } }));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { installHttpsMock, type MockResponse, type RecordedCall } from '../../__tests__/githubHttpsMock';
import { resetGithubApiCaches } from '../../githubApi';
import { registerPublishersHandlers } from '../githubPublishersHandlers';

const makeStore = (values: Record<string, unknown>) => {
    const data: Record<string, unknown> = { ...values };
    return { get: (k: string, d?: unknown) => (k in data ? data[k] : d), set: vi.fn((k: string, v: unknown) => { data[k] = v; }), data };
};
const invoke = (ch: string, payload?: unknown) => handlers.get(ch)!({}, payload);
const ADMIN = { status: 200, body: { owner: { type: 'Organization' }, permissions: { admin: true, push: true } } };

let store: ReturnType<typeof makeStore>;
const setup = (values: Record<string, unknown>, responder: (c: RecordedCall) => MockResponse) => {
    handlers.clear();
    store = makeStore({ githubToken: 'tok', ...values });
    registerPublishersHandlers({ store });
    return installHttpsMock(responder);
};

beforeEach(() => { vi.restoreAllMocks(); resetGithubApiCaches(); });

describe('get-repo-publishers', () => {
    it('reports canAdmin=false without listing for a non-admin', async () => {
        const calls = setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, () => ({ status: 200, body: { owner: { type: 'Organization' }, permissions: { push: true } } }));
        expect(await invoke('get-repo-publishers')).toEqual({ success: true, canAdmin: false, ownerType: 'Organization', collaborators: [], invites: [] });
        expect(calls).toHaveLength(1);
    });
    it('lists push collaborators and pending invites for an admin', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, (c) => {
            if (c.path === '/repos/guild/site') return ADMIN;
            if (c.path.startsWith('/repos/guild/site/collaborators')) return { status: 200, body: [
                { login: 'kyra', avatar_url: 'k.png', permissions: { push: true } },
                { login: 'reader', avatar_url: null, permissions: { push: false } }
            ] };
            if (c.path.startsWith('/repos/guild/site/invitations')) return { status: 200, body: [
                { id: 7, invitee: { login: 'newbie', avatar_url: 'n.png' }, created_at: '2026-10-01T00:00:00Z' }
            ] };
            return { status: 404 };
        });
        const res = await invoke('get-repo-publishers');
        expect(res.collaborators).toEqual([{ login: 'kyra', avatarUrl: 'k.png' }]);
        expect(res.invites).toEqual([{ id: 7, login: 'newbie', avatarUrl: 'n.png', createdAt: '2026-10-01T00:00:00Z' }]);
    });
});

describe('add-repo-publisher', () => {
    const base = (put: MockResponse) => (c: RecordedCall): MockResponse => {
        if (c.path === '/users/kyra') return { status: 200, body: { login: 'kyra' } };
        if (c.path === '/users/ghost') return { status: 404 };
        if (c.method === 'PUT') return put;
        return { status: 404 };
    };
    it('invites with push permission (201)', async () => {
        const calls = setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, base({ status: 201, body: { id: 1 } }));
        expect(await invoke('add-repo-publisher', { username: 'kyra' })).toEqual({ success: true, status: 'invited' });
        expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ path: '/repos/guild/site/collaborators/kyra', body: { permission: 'push' } });
    });
    it('reports already-has-access (204)', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, base({ status: 204 }));
        expect(await invoke('add-repo-publisher', { username: 'kyra' })).toEqual({ success: true, status: 'already-has-access' });
    });
    it('rejects an unknown user without sending an invite', async () => {
        const calls = setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, base({ status: 201 }));
        expect(await invoke('add-repo-publisher', { username: 'ghost' })).toEqual({ success: false, error: 'No GitHub user named ghost.' });
        expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    });
    it('surfaces GitHub\'s message on 403', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, base({ status: 403, body: { message: 'Organization policy forbids outside collaborators' } }));
        expect(await invoke('add-repo-publisher', { username: 'kyra' })).toEqual({ success: false, error: 'Organization policy forbids outside collaborators' });
    });
});

describe('add-repo-publisher 422', () => {
    it('surfaces the first validation error message', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, (c) => {
            if (c.path === '/users/kyra') return { status: 200, body: { login: 'kyra' } };
            if (c.method === 'PUT') return { status: 422, body: { message: 'Validation Failed', errors: [{ message: 'Repository owner cannot be a collaborator' }] } };
            return { status: 404 };
        });
        expect(await invoke('add-repo-publisher', { username: 'kyra' })).toEqual({ success: false, error: 'Repository owner cannot be a collaborator' });
    });
});

describe('remove-repo-publisher / cancel-repo-invite guards', () => {
    const responder = (c: RecordedCall): MockResponse => (c.path === '/user' ? { status: 200, body: { login: 'me' } } : { status: 204 });
    it('refuses to remove the repo owner (case-insensitive)', async () => {
        const calls = setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, responder);
        expect(await invoke('remove-repo-publisher', { username: 'Guild' })).toEqual({ success: false, error: "The repo owner can't be removed." });
        expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    });
    it('refuses to remove yourself', async () => {
        const calls = setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, responder);
        expect(await invoke('remove-repo-publisher', { username: 'ME' })).toEqual({ success: false, error: "You can't remove yourself here — do it on GitHub." });
        expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    });
    it('removes another collaborator', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, responder);
        expect(await invoke('remove-repo-publisher', { username: 'kyra' })).toEqual({ success: true });
    });
    it('rejects empty username and bad invitation ids', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, responder);
        expect((await invoke('remove-repo-publisher', { username: '' })).success).toBe(false);
        expect((await invoke('cancel-repo-invite', { invitationId: 0 })).success).toBe(false);
        expect((await invoke('cancel-repo-invite', { invitationId: 1.5 })).success).toBe(false);
        expect(await invoke('cancel-repo-invite', { invitationId: 7 })).toEqual({ success: true });
    });
});

describe('get-pending-site-invites', () => {
    const invitations = [
        { id: 1, created_at: '2026-10-02', inviter: { login: 'boss' }, repository: { name: 'site', owner: { login: 'guild' }, description: 'AxiBridge Reports', default_branch: 'main', private: true } },
        { id: 2, created_at: '2026-10-03', inviter: { login: 'boss' }, repository: { name: 'stats', owner: { login: 'guild' }, description: 'whatever', default_branch: 'main' } },
        { id: 3, created_at: '2026-10-01', inviter: { login: 'x' }, repository: { name: 'dotfiles', owner: { login: 'x' }, description: null, default_branch: 'main' } }
    ];
    const responder = (c: RecordedCall): MockResponse => {
        if (c.path.startsWith('/user/repository_invitations')) return { status: 200, body: invitations };
        if (c.path.startsWith('/repos/guild/stats/contents/reports/index.json')) return { status: 200, body: {} };
        return { status: 404 };
    };
    it('keeps a private repo by description alone, a repo with reports/index.json, and drops the rest', async () => {
        setup({}, responder);
        const res = await invoke('get-pending-site-invites');
        expect(res.invites.map((i: any) => i.fullName)).toEqual(['guild/stats', 'guild/site']);
    });
    it('flags dismissed invites and caches the list', async () => {
        const calls = setup({ dismissedSiteInvites: ['1'] }, responder);
        const res = await invoke('get-pending-site-invites');
        expect(res.invites.find((i: any) => i.id === 1).dismissed).toBe(true);
        const before = calls.length;
        await invoke('get-pending-site-invites');
        expect(calls.length).toBe(before);
        await invoke('get-pending-site-invites', { force: true });
        expect(calls.length).toBeGreaterThan(before);
    });
});

describe('accept-site-invite', () => {
    const invitations = [{ id: 1, created_at: '2026-10-02', inviter: { login: 'boss' }, repository: { name: 'site', owner: { login: 'guild' }, description: 'AxiBridge Reports', default_branch: 'gh-pages' } }];
    const responder = (patch: MockResponse) => (c: RecordedCall): MockResponse => {
        if (c.path.startsWith('/user/repository_invitations') && c.method === 'GET') return { status: 200, body: invitations };
        if (c.method === 'PATCH') return patch;
        if (c.path === '/repos/guild/site/pages') return { status: 200, body: { html_url: 'https://guild.github.io/site/', source: { path: '/docs' } } };
        return { status: 404 };
    };
    it('sets the default target when none is configured', async () => {
        setup({ githubFavoriteRepos: [] }, responder({ status: 204 }));
        const res = await invoke('accept-site-invite', { invitationId: 1 });
        expect(res.target).toEqual({
            owner: 'guild', repo: 'site', fullName: 'guild/site', branch: 'gh-pages',
            pagesUrl: 'https://guild.github.io/site/', pagesSourcePath: 'docs', madeDefault: true, favorites: ['guild/site']
        });
        expect(store.data.githubRepoOwner).toBe('guild');
        expect(store.data.githubBranch).toBe('gh-pages');
        expect(store.data.githubPagesSourcePath).toBe('docs');
    });
    it('only adds a favorite when a default exists, deduped', async () => {
        setup({ githubRepoOwner: 'me', githubRepoName: 'mine', githubFavoriteRepos: ['guild/site'] }, responder({ status: 204 }));
        const res = await invoke('accept-site-invite', { invitationId: 1 });
        expect(res.target.madeDefault).toBe(false);
        expect(store.data.githubFavoriteRepos).toEqual(['guild/site']);
        expect(store.data.githubRepoOwner).toBe('me');
    });
    it('prefers the Pages source branch over the default branch', async () => {
        const inv = [{ ...invitations[0], repository: { ...invitations[0].repository, default_branch: 'main' } }];
        setup({}, (c) => {
            if (c.path.startsWith('/user/repository_invitations') && c.method === 'GET') return { status: 200, body: inv };
            if (c.method === 'PATCH') return { status: 204 };
            if (c.path === '/repos/guild/site/pages') return { status: 200, body: { html_url: 'https://guild.github.io/site/', source: { branch: 'gh-pages', path: '/' } } };
            return { status: 404 };
        });
        const res = await invoke('accept-site-invite', { invitationId: 1 });
        expect(res.target.branch).toBe('gh-pages');
        expect(store.data.githubBranch).toBe('gh-pages');
    });
    it('reports an expired invite', async () => {
        setup({}, responder({ status: 404 }));
        expect(await invoke('accept-site-invite', { invitationId: 1 })).toEqual({ success: false, error: 'That invite is no longer valid.' });
    });
});

describe('dismiss-site-invite', () => {
    it('records the id once', async () => {
        setup({ dismissedSiteInvites: ['5'] }, () => ({ status: 404 }));
        await invoke('dismiss-site-invite', { invitationId: 5 });
        await invoke('dismiss-site-invite', { invitationId: 6 });
        expect(store.data.dismissedSiteInvites).toEqual(['5', '6']);
    });
});
