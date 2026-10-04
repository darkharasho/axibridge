import { describe, expect, it, vi } from 'vitest';
import {
    SITE_BUSY_MESSAGE,
    SiteBusyError,
    commitWithRebase,
    isRefConflict,
    toPushAccessError,
    type CommitBase
} from '../githubCommitLoop';

const conflict = () => Object.assign(new Error('GitHub API error (422) updating ref'), { status: 422 });
const base = (head: string): CommitBase => ({ headSha: head, treeSha: `t-${head}`, treeEntries: [], treeMap: new Map() });
const noSleep = async () => {};

describe('isRefConflict', () => {
    it('matches status or message', () => {
        expect(isRefConflict({ status: 422 })).toBe(true);
        expect(isRefConflict(new Error('GitHub API error (422) updating ref'))).toBe(true);
        expect(isRefConflict({ status: 500 })).toBe(false);
    });
});

describe('commitWithRebase', () => {
    it('commits once when there is no conflict', async () => {
        const build = vi.fn(async () => ({ entries: [{ path: 'a', sha: '1' }], result: 'r' }));
        const out = await commitWithRebase({
            readBase: async () => base('h0'), build, commit: async () => 'c1', sleep: noSleep
        });
        expect(out).toEqual({ commitSha: 'c1', result: 'r', attempts: 1 });
        expect(build).toHaveBeenCalledTimes(1);
    });

    it('returns a null sha without committing when nothing changed', async () => {
        const commit = vi.fn();
        const out = await commitWithRebase({
            readBase: async () => base('h0'),
            build: async () => ({ entries: [], result: null }),
            commit, sleep: noSleep
        });
        expect(out.commitSha).toBeNull();
        expect(commit).not.toHaveBeenCalled();
    });

    it('rebuilds against the new base after a 422', async () => {
        const heads = ['h0', 'h1'];
        const seen: string[] = [];
        let n = 0;
        const out = await commitWithRebase({
            readBase: async () => base(heads[n]),
            build: async (b, attempt) => { seen.push(`${attempt}:${b.headSha}`); return { entries: [{ path: 'x', sha: b.headSha }], result: null }; },
            commit: async () => { if (n++ === 0) throw conflict(); return 'c2'; },
            sleep: noSleep
        });
        expect(seen).toEqual(['1:h0', '2:h1']);
        expect(out).toMatchObject({ commitSha: 'c2', attempts: 2 });
    });

    it('gives up with SiteBusyError after 3 conflicts', async () => {
        const onRetry = vi.fn();
        await expect(commitWithRebase({
            readBase: async () => base('h'),
            build: async () => ({ entries: [{ path: 'x', sha: '1' }], result: null }),
            commit: async () => { throw conflict(); },
            sleep: noSleep, onRetry
        })).rejects.toThrow(SITE_BUSY_MESSAGE);
        expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('does not retry non-conflict errors', async () => {
        const commit = vi.fn(async () => { throw Object.assign(new Error('boom'), { status: 500 }); });
        await expect(commitWithRebase({
            readBase: async () => base('h'),
            build: async () => ({ entries: [{ path: 'x', sha: '1' }], result: null }),
            commit, sleep: noSleep
        })).rejects.toThrow('boom');
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it('sleeps 250–1000ms between attempts', async () => {
        const sleep = vi.fn(async () => {});
        let n = 0;
        await commitWithRebase({
            readBase: async () => base('h'),
            build: async () => ({ entries: [{ path: 'x', sha: '1' }], result: null }),
            commit: async () => { if (n++ < 2) throw conflict(); return 'c'; },
            sleep, random: () => 0.5
        });
        expect(sleep).toHaveBeenCalledTimes(2);
        for (const [ms] of sleep.mock.calls as unknown as Array<[number]>) {
            expect(ms).toBeGreaterThanOrEqual(250);
            expect(ms).toBeLessThanOrEqual(1000);
        }
    });

    it('two racing publishers both survive in the shared index', async () => {
        // In-memory remote: a head counter and the index entries at that head.
        const remote = { head: 0, entries: [] as string[] };
        const publisher = (id: string, holdFirstBuild?: Promise<unknown>) => commitWithRebase({
            readBase: async () => ({
                headSha: String(remote.head), treeSha: 't', treeEntries: [],
                treeMap: new Map([['reports/index.json', JSON.stringify(remote.entries)]])
            }),
            build: async (b, attempt) => {
                const existing: string[] = JSON.parse(b.treeMap.get('reports/index.json')!);
                if (attempt === 1 && holdFirstBuild) await holdFirstBuild;
                return { entries: [{ path: 'reports/index.json', sha: JSON.stringify([id, ...existing.filter((e) => e !== id)]) }], result: null };
            },
            commit: async (b, entries) => {
                if (b.headSha !== String(remote.head)) throw conflict();
                remote.head += 1;
                remote.entries = JSON.parse(entries[0].sha!);
                return String(remote.head);
            },
            sleep: noSleep
        });
        let releaseA!: () => void;
        const aStarted = new Promise<void>((r) => { releaseA = r; });
        // B reads head 0, then waits while A publishes; B's commit then conflicts.
        const bDone = publisher('B', aStarted.then(() => aDone));
        const aDone = (async () => { await Promise.resolve(); return publisher('A'); })();
        releaseA();
        await Promise.all([aDone, bDone]);
        expect(remote.entries.sort()).toEqual(['A', 'B']);
    });
});

describe('toPushAccessError', () => {
    it('rewrites a 403 into the no-push message', () => {
        const err = toPushAccessError(Object.assign(new Error('GitHub API error (403) creating blob'), { status: 403 }), 'guild', 'reports') as Error;
        expect(err.message).toBe("You don't have push access to guild/reports. Ask the site admin to add you.");
    });
    it('passes other errors through untouched', () => {
        const original = new Error('boom');
        expect(toPushAccessError(original, 'a', 'b')).toBe(original);
        expect(new SiteBusyError()).toBeInstanceOf(Error);
    });
});
