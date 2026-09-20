import type { RetentionEntry, RetentionStage } from './shareRetention';

/**
 * The local record of every share link this install has minted.
 *
 * Retention is budget-driven, so it needs to total a user's footprint — and
 * until this existed there was nowhere that total could come from. The Worker
 * knows each pointer individually but has no "list my pointers" route (and
 * deliberately so: it would need an owner index, and the Worker is meant to
 * stay a ~300 B-per-link pointer store). The fights repo knows the bytes but
 * not which share code owns which object. Only the client sees both at the
 * moment it mints a link, so this is where the two are joined.
 *
 * Stored in the settings store rather than in the fights repo. That makes the
 * ledger install-local: a user who reinstalls, or shares from a second machine,
 * starts with an empty one and their older reports become invisible to
 * retention. They are not lost — every link still resolves, because nothing is
 * ever deleted — they simply stop being eviction candidates, which fails in the
 * safe direction. Putting the ledger in the repo instead would make every share
 * a read-modify-write against a file that grows without bound, on the hot
 * ingest path; that trade is revisitable once anyone actually hits the wall.
 */
export const SHARE_LEDGER_KEY = 'shareLedger';

export interface ShareLedgerEntry {
    /** The Worker's short code. The PATCH target. */
    code: string;
    /** Object key in the user's storage, from `shareObjectKey`. Re-upload target. */
    key: string;
    /**
     * Public https URL of the object at `key`.
     *
     * Carried so the demote step can re-derive a report from its own published
     * bytes — fetch, strip, re-upload — instead of needing the log still to be
     * parsed locally. Without it retention could only ever demote reports from
     * the current session, which is the opposite of what an LRU wants.
     */
    loc: string;
    /** Size of the Tier 1 object as last written, in bytes. */
    bytes: number;
    stage: RetentionStage;
    created: number;
    /**
     * Exempt from eviction at every stage. Nothing sets this yet — there is no
     * pin affordance in the UI — but `planRetention` already honours it, so the
     * field is carried rather than invented later against a populated ledger.
     */
    pinned?: boolean;
}

const isEntry = (value: any): value is ShareLedgerEntry =>
    !!value
    && typeof value.code === 'string' && value.code !== ''
    && typeof value.key === 'string' && value.key !== ''
    && typeof value.loc === 'string' && value.loc !== ''
    && typeof value.bytes === 'number' && Number.isFinite(value.bytes)
    && (value.stage === 'full' || value.stage === 'demoted' || value.stage === 'tombstone')
    && typeof value.created === 'number' && Number.isFinite(value.created);

/**
 * Anything malformed is dropped rather than repaired. The ledger is a cache of
 * facts that live authoritatively elsewhere (the Worker holds the stage, the
 * repo holds the bytes), so a corrupt row costs one report its eviction
 * candidacy, and guessing at it risks issuing a PATCH against the wrong code.
 */
export const readLedger = (store: any): ShareLedgerEntry[] => {
    let raw: unknown;
    try {
        raw = store?.get?.(SHARE_LEDGER_KEY);
    } catch {
        return [];
    }
    return Array.isArray(raw) ? raw.filter(isEntry) : [];
};

export const writeLedger = (store: any, entries: ShareLedgerEntry[]): void => {
    try {
        store?.set?.(SHARE_LEDGER_KEY, entries.filter(isEntry));
    } catch {
        // A ledger that cannot be persisted must never fail the share that
        // triggered it: the link is already minted and working by this point.
    }
};

/**
 * Record a freshly minted share, replacing any earlier row for the same code.
 *
 * Re-sharing the same log mints a NEW code but reuses the same object key
 * (`shareObjectKey` is a pure function of the log id), so two codes can point
 * at one object. Both rows are kept — each has its own pointer to demote — but
 * `totalBytes` counts distinct KEYS, so the shared object is not double-billed
 * against the budget.
 */
export const recordShare = (store: any, entry: ShareLedgerEntry): ShareLedgerEntry[] => {
    if (!isEntry(entry)) return readLedger(store);
    const next = [...readLedger(store).filter((e) => e.code !== entry.code), entry];
    writeLedger(store, next);
    return next;
};

/** Apply a stage/bytes change after a demote or tombstone has actually landed. */
export const updateShare = (
    store: any,
    code: string,
    patch: { stage?: RetentionStage; bytes?: number }
): ShareLedgerEntry[] => {
    const next = readLedger(store).map((entry) =>
        entry.code === code
            ? {
                  ...entry,
                  ...(patch.stage ? { stage: patch.stage } : {}),
                  ...(typeof patch.bytes === 'number' && Number.isFinite(patch.bytes)
                      ? { bytes: Math.max(0, patch.bytes) }
                      : {})
              }
            : entry
    );
    writeLedger(store, next);
    return next;
};

/**
 * The user's footprint, counting each distinct object key once.
 *
 * See `recordShare`: several codes may address one object, and billing that
 * object per-code would over-report the footprint and evict early.
 */
export const totalBytes = (entries: ShareLedgerEntry[]): number => {
    const byKey = new Map<string, number>();
    for (const entry of entries) {
        byKey.set(entry.key, Math.max(byKey.get(entry.key) ?? 0, entry.bytes));
    }
    let total = 0;
    for (const bytes of byKey.values()) total += bytes;
    return total;
};

/**
 * Join the ledger to the live last-seen timestamps the Worker holds.
 *
 * `seen` is `null` for any code the lookup did not answer for — a pointer that
 * has never been opened, or a lookup that failed. `planRetention` ranks null
 * first, so an unanswered code becomes the MOST evictable. That is the correct
 * direction under demote-never-delete (the worst case is an early demote of a
 * report nobody has opened, which re-sharing undoes) and it is why the join is
 * allowed to be lossy at all.
 */
export const toRetentionEntries = (
    entries: ShareLedgerEntry[],
    seenByCode: Record<string, number | null | undefined>
): RetentionEntry[] =>
    entries.map((entry) => ({
        id: entry.code,
        bytes: entry.bytes,
        stage: entry.stage,
        seen: typeof seenByCode[entry.code] === 'number' ? (seenByCode[entry.code] as number) : null,
        pinned: entry.pinned === true
    }));
