import { describe, expect, it } from 'vitest';
import {
    SHARE_LEDGER_KEY,
    readLedger,
    recordShare,
    toRetentionEntries,
    totalBytes,
    updateShare,
    writeLedger,
    type ShareLedgerEntry
} from '../shareLedger';

const fakeStore = (initial: any = undefined) => {
    const data: Record<string, any> = { [SHARE_LEDGER_KEY]: initial };
    return {
        get: (k: string) => data[k],
        set: (k: string, v: any) => { data[k] = v; },
        raw: () => data
    };
};

const entry = (over: Partial<ShareLedgerEntry> = {}): ShareLedgerEntry => ({
    code: 'AAAAAAAA',
    key: 'shares/a-0123456789ab.json.gz',
    loc: 'https://u.github.io/f/shares/a-0123456789ab.json.gz',
    bytes: 1000,
    stage: 'full',
    created: 1,
    ...over
});

describe('readLedger', () => {
    it('returns an empty ledger for a store that has never held one', () => {
        expect(readLedger(fakeStore())).toEqual([]);
        expect(readLedger(undefined)).toEqual([]);
    });

    it('survives a throwing store', () => {
        const store = { get: () => { throw new Error('corrupt'); } };
        expect(readLedger(store)).toEqual([]);
    });

    it('drops malformed rows rather than repairing them', () => {
        const store = fakeStore([
            entry({ code: 'GOOD0000' }),
            { code: 'nokey', bytes: 1, stage: 'full', created: 1 },
        { ...entry(), loc: '' },
            { ...entry(), stage: 'archived' },
            { ...entry(), bytes: 'big' },
            null
        ]);
        expect(readLedger(store).map((e) => e.code)).toEqual(['GOOD0000']);
    });

    it('ignores a non-array value', () => {
        expect(readLedger(fakeStore({ nope: true }))).toEqual([]);
    });
});

describe('recordShare', () => {
    it('appends a new share', () => {
        const store = fakeStore();
        recordShare(store, entry({ code: 'AAAAAAAA' }));
        const after = recordShare(store, entry({ code: 'BBBBBBBB' }));
        expect(after.map((e) => e.code)).toEqual(['AAAAAAAA', 'BBBBBBBB']);
    });

    it('replaces an existing row for the same code', () => {
        const store = fakeStore();
        recordShare(store, entry({ bytes: 1000 }));
        const after = recordShare(store, entry({ bytes: 2000 }));
        expect(after).toHaveLength(1);
        expect(after[0].bytes).toBe(2000);
    });

    it('refuses to record a malformed entry', () => {
        const store = fakeStore();
        expect(recordShare(store, { code: '', key: '', loc: '', bytes: 0, stage: 'full', created: 0 })).toEqual([]);
    });

    it('never throws when the store cannot persist', () => {
        const store = { get: () => [], set: () => { throw new Error('read-only'); } };
        expect(() => recordShare(store, entry())).not.toThrow();
    });
});

describe('updateShare', () => {
    it('applies a stage and byte change to one code only', () => {
        const store = fakeStore([entry({ code: 'AAAAAAAA' }), entry({ code: 'BBBBBBBB' })]);
        const after = updateShare(store, 'AAAAAAAA', { stage: 'demoted', bytes: 340 });
        expect(after[0]).toMatchObject({ stage: 'demoted', bytes: 340 });
        expect(after[1]).toMatchObject({ stage: 'full', bytes: 1000 });
    });

    it('clamps a negative byte count instead of persisting it', () => {
        const store = fakeStore([entry()]);
        expect(updateShare(store, 'AAAAAAAA', { bytes: -5 })[0].bytes).toBe(0);
    });

    it('is a no-op for an unknown code', () => {
        const store = fakeStore([entry()]);
        expect(updateShare(store, 'ZZZZZZZZ', { stage: 'tombstone' })[0].stage).toBe('full');
    });
});

describe('totalBytes', () => {
    it('sums distinct entries', () => {
        expect(totalBytes([entry({ code: 'A', key: 'k1', bytes: 10 }), entry({ code: 'B', key: 'k2', bytes: 5 })]))
            .toBe(15);
    });

    // Re-sharing one log mints a new code against the SAME object key. Billing
    // it twice would over-report the footprint and evict early.
    it('counts one object once even when two codes address it', () => {
        const shared = [entry({ code: 'A', key: 'same', bytes: 10 }), entry({ code: 'B', key: 'same', bytes: 10 })];
        expect(totalBytes(shared)).toBe(10);
    });

    it('is zero for an empty ledger', () => {
        expect(totalBytes([])).toBe(0);
    });
});

describe('toRetentionEntries', () => {
    it('joins ledger rows to the Worker’s last-seen timestamps', () => {
        const rows = toRetentionEntries([entry({ code: 'A' })], { A: 1700 });
        expect(rows[0]).toEqual({ id: 'A', bytes: 1000, stage: 'full', seen: 1700, pinned: false });
    });

    // Null ranks first in planRetention, i.e. most evictable — the safe
    // direction under demote-never-delete.
    it('maps a missing or non-numeric timestamp to null', () => {
        expect(toRetentionEntries([entry({ code: 'A' })], {})[0].seen).toBeNull();
        expect(toRetentionEntries([entry({ code: 'A' })], { A: null })[0].seen).toBeNull();
    });

    it('carries the pinned flag through', () => {
        expect(toRetentionEntries([entry({ pinned: true })], {})[0].pinned).toBe(true);
    });
});

describe('writeLedger', () => {
    it('filters malformed rows on the way out', () => {
        const store = fakeStore();
        writeLedger(store, [entry(), { bogus: true } as any]);
        expect(store.raw()[SHARE_LEDGER_KEY]).toHaveLength(1);
    });
});
