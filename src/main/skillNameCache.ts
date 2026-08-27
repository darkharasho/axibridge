/**
 * Learned skill-name cache — recovers names arcdps didn't write into a log.
 *
 * # Why this exists
 *
 * A `.zevtc` always carries the *id* of every skill it records. It carries the
 * *name* only when the capturing client happened to have that skill's data
 * loaded at the moment it fired. Two logs from the same night, the same build
 * and the same parser therefore disagree:
 *
 * ```
 * 20260130-193742.zevtc   s80224 -> "Rend"
 * 20260130-201115.zevtc   s80224 -> "Skill 80224"
 * ```
 *
 * Nothing downstream can fix that from inside one file. axilog resolves what it
 * can from the log's own table, then from the GW2 API catalog, GW2EI's name
 * overrides, the buff tables and `SkillIDs.cs` symbols, and honestly emits
 * `Skill <id>` when none of them answer. For a tail of ids — NPC, environment
 * and gathering skills — none of them ever will: `/v2/skills` 404s for them and
 * they appear in no bundled table.
 *
 * But AxiBridge is not limited to one file. It has the user's whole log
 * history, and across a 4063-log corpus 11 of the 29 ids that resolve to a
 * placeholder are named outright by some *other* log. So the first log that
 * names `80224` can teach every log that doesn't — which is exactly what this
 * module does.
 *
 * # Where it runs
 *
 * Inside {@link applyEiCompatShims}, learn-then-substitute, because that shim
 * is applied both to a fresh parse *and* to details re-read from the
 * dps.report details cache. A name learned today therefore reaches logs parsed
 * months ago on their next read, with no re-parse and no schema bump.
 *
 * # What it will not do
 *
 * It only ever replaces a name that is exactly the `Skill <id>` placeholder for
 * that same id, and it only learns names that are not themselves placeholders.
 * A real name — from the log, the API catalog or any of axilog's tables — is
 * never displaced, so this cannot make a correct name wrong. Ids are global and
 * immutable in GW2, so a name learned from any log is valid for all of them.
 */

// ─── Placeholder shape ────────────────────────────────────────────────────────

/**
 * axilog's last-resort name, from `skill_map::resolve_name`:
 * `None => format!("Skill {id}")`. Matched against the id it is keyed under
 * rather than by regex, so a genuine skill *called* "Skill 5" (there is no such
 * thing today, but the check costs nothing) is not mistaken for a placeholder.
 */
export const isPlaceholderSkillName = (name: unknown, id: string): boolean =>
    typeof name === 'string' && name === `Skill ${id}`;

/** A name worth remembering: a non-empty string that is not a placeholder. */
const isLearnableName = (name: unknown, id: string): name is string =>
    typeof name === 'string' && name.trim() !== '' && !isPlaceholderSkillName(name, id);

// ─── Persistence ──────────────────────────────────────────────────────────────

/** Injectable backing store, so tests need no filesystem and no Electron. */
export interface SkillNamePersistence {
    read(): Record<string, string> | null;
    write(names: Record<string, string>): void;
}

/**
 * Bound above any plausible real total — the union across a 4063-log WvW corpus
 * is in the low thousands — so this is a runaway guard, not a working limit.
 * Hitting it stops new learning rather than evicting, because eviction would
 * silently un-learn a name the UI is already showing.
 */
export const SKILL_NAME_CACHE_MAX = 50_000;

// ─── Cache ────────────────────────────────────────────────────────────────────

export class SkillNameCache {
    private names = new Map<string, string>();
    private dirty = false;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private persistence: SkillNamePersistence | null = null,
        /** Debounce window for autosave; 0 writes synchronously (tests). */
        private saveDebounceMs = 5_000
    ) {}

    /** Populate from the backing store. Never throws; a corrupt store starts empty. */
    load(): void {
        let stored: Record<string, string> | null = null;
        try {
            stored = this.persistence?.read() ?? null;
        } catch {
            stored = null;
        }
        if (!stored || typeof stored !== 'object') return;
        for (const [id, name] of Object.entries(stored)) {
            if (isLearnableName(name, id)) this.names.set(id, name);
        }
    }

    get size(): number {
        return this.names.size;
    }

    lookup(id: string): string | undefined {
        return this.names.get(id);
    }

    /**
     * Remember `name` for `id`. First writer wins: names are immutable per id,
     * so a later log re-teaching the same id is a no-op rather than a rewrite,
     * which keeps the cache stable and the dirty flag quiet.
     */
    learn(id: string, name: unknown): boolean {
        if (!isLearnableName(name, id)) return false;
        if (this.names.has(id)) return false;
        if (this.names.size >= SKILL_NAME_CACHE_MAX) return false;
        this.names.set(id, name);
        this.dirty = true;
        this.scheduleSave();
        return true;
    }

    private scheduleSave(): void {
        if (!this.persistence || this.saveTimer) return;
        if (this.saveDebounceMs <= 0) {
            this.flush();
            return;
        }
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.flush();
        }, this.saveDebounceMs);
        // Never hold the event loop open on behalf of a cache write.
        (this.saveTimer as any)?.unref?.();
    }

    /** Write immediately if anything changed. Safe to call on shutdown. */
    flush(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        if (!this.dirty || !this.persistence) return;
        try {
            this.persistence.write(Object.fromEntries(this.names));
            this.dirty = false;
        } catch {
            // Keep the in-memory cache and the dirty flag; the next learn retries.
        }
    }
}

// ─── Details traversal ────────────────────────────────────────────────────────

/**
 * The name-bearing maps on a details object, as `[map, keyPrefix]`.
 *
 * `skillMap`/`buffMap` are the EI-shaped maps nearly every UI surface reads.
 * The native catalogs are read by the views migrated off EI, and both halves
 * come from one axilog parse — so a name substituted in only one of them would
 * show a placeholder in exactly the views that had already been migrated.
 *
 * EI keys these by a prefixed id (`s80224`, `b10243`, and negatives like
 * `s-2`); the native catalogs key by the bare id. One prefix strip covers both.
 */
const nameMapsOf = (details: any): Array<[Record<string, any>, string]> => {
    const maps: Array<[Record<string, any>, string]> = [];
    const push = (map: unknown, prefix: string) => {
        if (map && typeof map === 'object') maps.push([map as Record<string, any>, prefix]);
    };
    push(details?.skillMap, 's');
    push(details?.buffMap, 'b');
    push(details?.native?.catalogs?.skills, '');
    push(details?.native?.catalogs?.buffs, '');
    return maps;
};

/**
 * Skills and buffs share one id space in GW2 — `873` is Resolution whether it
 * is read as a buff or as the skill that applied it — so all four maps learn
 * into and read from a single table.
 */
const bareId = (key: string, prefix: string): string =>
    prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;

/** Record every real name this log carries. Returns how many were new. */
export const learnSkillNames = (details: any, cache: SkillNameCache): number => {
    let learned = 0;
    for (const [map, prefix] of nameMapsOf(details)) {
        for (const [key, entry] of Object.entries(map)) {
            if (!entry || typeof entry !== 'object') continue;
            if (cache.learn(bareId(key, prefix), (entry as any).name)) learned += 1;
        }
    }
    return learned;
};

/** Replace `Skill <id>` placeholders with learned names. Returns how many. */
export const applyLearnedSkillNames = (details: any, cache: SkillNameCache): number => {
    let applied = 0;
    for (const [map, prefix] of nameMapsOf(details)) {
        for (const [key, entry] of Object.entries(map)) {
            if (!entry || typeof entry !== 'object') continue;
            const id = bareId(key, prefix);
            if (!isPlaceholderSkillName((entry as any).name, id)) continue;
            const learnedName = cache.lookup(id);
            if (!learnedName) continue;
            (entry as any).name = learnedName;
            applied += 1;
        }
    }
    return applied;
};

// ─── Process-wide instance ────────────────────────────────────────────────────

let instance = new SkillNameCache();

/** The cache the shim uses. Unconfigured until {@link initSkillNameCache}. */
export const getSkillNameCache = (): SkillNameCache => instance;

/** Point the cache at a backing store and load it. Called once, from main. */
export const initSkillNameCache = (persistence: SkillNamePersistence, saveDebounceMs?: number): SkillNameCache => {
    instance = new SkillNameCache(persistence, saveDebounceMs);
    instance.load();
    return instance;
};

/** Drop back to an unpersisted empty cache. For tests. */
export const resetSkillNameCache = (): SkillNameCache => {
    instance = new SkillNameCache();
    return instance;
};
