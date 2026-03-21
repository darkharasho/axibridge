import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

const SCHEMA_VERSION = 1;
const IDB_PREFIX = 'details:';

type IdbEntry = { schemaVersion: number; details: any; storedAt: number };

export type DetailsFetcher = (logId: string) => Promise<any | null>;

export class DetailsCache {
    private lru = new Map<string, any>();
    private lruCapacity: number;
    private fetchDetails: DetailsFetcher;
    private inFlight = new Map<string, Promise<any | null>>();

    constructor(options: { lruCapacity?: number; fetchDetails: DetailsFetcher }) {
        this.lruCapacity = options.lruCapacity ?? 5;
        this.fetchDetails = options.fetchDetails;
    }

    /** Synchronous — checks memory LRU only. */
    peek(logId: string): any | undefined {
        return this.lru.get(logId);
    }

    /** Async — checks LRU → IndexedDB → IPC fallback. */
    async get(logId: string): Promise<any | null> {
        // Tier 1: memory LRU
        const memHit = this.lru.get(logId);
        if (memHit !== undefined) {
            // Promote to most-recently-used
            this.lru.delete(logId);
            this.lru.set(logId, memHit);
            return memHit;
        }

        // Tier 2: IndexedDB
        try {
            const entry = await idbGet<IdbEntry>(IDB_PREFIX + logId);
            if (entry && entry.schemaVersion === SCHEMA_VERSION && entry.details) {
                this.lruSet(logId, entry.details);
                return entry.details;
            }
        } catch {
            // IndexedDB unavailable — fall through to IPC
        }

        // Tier 3: IPC fallback (deduplicate concurrent requests)
        const existing = this.inFlight.get(logId);
        if (existing) return existing;

        const promise = this.fetchDetails(logId).then((fetched) => {
            this.inFlight.delete(logId);
            if (fetched) {
                this.lruSet(logId, fetched);
                this.idbPut(logId, fetched);
            }
            return fetched;
        }).catch((err) => {
            this.inFlight.delete(logId);
            throw err;
        });
        this.inFlight.set(logId, promise);
        return promise;
    }

    /** Write-through — stores in both LRU and IndexedDB. */
    async put(logId: string, details: any): Promise<void> {
        this.lruSet(logId, details);
        await this.idbPut(logId, details);
    }

    /** Fire-and-forget variant of put — does not await IndexedDB write. */
    putSync(logId: string, details: any): void {
        this.lruSet(logId, details);
        this.idbPut(logId, details);
    }

    /** Evict from memory LRU only (IndexedDB retained). */
    evict(logId: string): void {
        this.lru.delete(logId);
    }

    /** Evict from both memory and IndexedDB. */
    async purge(logId: string): Promise<void> {
        this.lru.delete(logId);
        try {
            await idbDel(IDB_PREFIX + logId);
        } catch {
            // IndexedDB unavailable — memory eviction still succeeded
        }
    }

    /** Current memory LRU size. */
    get memorySize(): number {
        return this.lru.size;
    }

    private lruSet(logId: string, details: any): void {
        this.lru.delete(logId);
        this.lru.set(logId, details);
        if (this.lru.size > this.lruCapacity) {
            const oldest = this.lru.keys().next().value;
            if (oldest !== undefined) this.lru.delete(oldest);
        }
    }

    private idbPut(logId: string, details: any): Promise<void> {
        const entry: IdbEntry = {
            schemaVersion: SCHEMA_VERSION,
            details,
            storedAt: Date.now(),
        };
        return idbSet(IDB_PREFIX + logId, entry).catch(() => {
            // IndexedDB write failed — memory LRU still has it
        });
    }
}
