import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    SkillNameCache,
    SKILL_NAME_CACHE_MAX,
    applyLearnedSkillNames,
    getSkillNameCache,
    initSkillNameCache,
    isPlaceholderSkillName,
    learnSkillNames,
    resetSkillNameCache,
    type SkillNamePersistence,
} from '../skillNameCache';
import { applyEiCompatShims } from '../axilogParser';

/** Persistence backed by a plain object, so no fs and no Electron. */
const memoryStore = (seed: Record<string, string> | null = null) => {
    let data = seed;
    return {
        persistence: {
            read: () => data,
            write: (names: Record<string, string>) => {
                data = names;
            },
        } as SkillNamePersistence,
        get current() {
            return data;
        },
    };
};

/** Minimal EI-shaped details: `skillMap` keys are prefixed, catalogs are bare. */
const detailsWith = (skillMap: Record<string, any>, extra: Record<string, any> = {}): any => ({
    skillMap,
    ...extra,
});

beforeEach(() => {
    resetSkillNameCache();
});

describe('isPlaceholderSkillName', () => {
    it('matches axilog\'s `Skill <id>` fallback for that id only', () => {
        expect(isPlaceholderSkillName('Skill 80224', '80224')).toBe(true);
        // Right shape, wrong id — this is a real name that merely looks like one.
        expect(isPlaceholderSkillName('Skill 80224', '12345')).toBe(false);
        expect(isPlaceholderSkillName('Rend', '80224')).toBe(false);
        expect(isPlaceholderSkillName(undefined, '80224')).toBe(false);
    });

    it('handles the negative ids EI uses for synthetic skills', () => {
        expect(isPlaceholderSkillName('Skill -2', '-2')).toBe(true);
        expect(isPlaceholderSkillName('Weapon Swap', '-2')).toBe(false);
    });
});

describe('SkillNameCache', () => {
    it('refuses to learn a placeholder as if it were a name', () => {
        const cache = new SkillNameCache();
        expect(cache.learn('80224', 'Skill 80224')).toBe(false);
        expect(cache.learn('80224', '')).toBe(false);
        expect(cache.learn('80224', undefined)).toBe(false);
        expect(cache.size).toBe(0);
    });

    it('keeps the first name it learns for an id', () => {
        const cache = new SkillNameCache();
        expect(cache.learn('80224', 'Rend')).toBe(true);
        expect(cache.learn('80224', 'Something Else')).toBe(false);
        expect(cache.lookup('80224')).toBe('Rend');
    });

    it('round-trips through persistence and drops stored placeholders', () => {
        const store = memoryStore();
        const writer = new SkillNameCache(store.persistence, 0);
        writer.learn('80224', 'Rend');
        writer.learn('873', 'Resolution');
        writer.flush();
        expect(store.current).toEqual({ '80224': 'Rend', '873': 'Resolution' });

        // A cache file poisoned with placeholders must not re-import them,
        // otherwise a bad write would permanently mask a later real name.
        const poisoned = memoryStore({ '80224': 'Rend', '999': 'Skill 999' });
        const reader = new SkillNameCache(poisoned.persistence, 0);
        reader.load();
        expect(reader.lookup('80224')).toBe('Rend');
        expect(reader.lookup('999')).toBeUndefined();
    });

    it('survives an unreadable or corrupt store', () => {
        const cache = new SkillNameCache(
            {
                read: () => {
                    throw new Error('ENOENT');
                },
                write: () => {
                    throw new Error('EACCES');
                },
            },
            0
        );
        expect(() => cache.load()).not.toThrow();
        // A failed write must not lose the in-memory name or the dirty flag.
        expect(() => cache.learn('80224', 'Rend')).not.toThrow();
        expect(cache.lookup('80224')).toBe('Rend');
    });

    it('debounces writes and flushes on demand', () => {
        vi.useFakeTimers();
        const store = memoryStore();
        const writes = vi.spyOn(store.persistence, 'write');
        const cache = new SkillNameCache(store.persistence, 5_000);
        cache.learn('1', 'A');
        cache.learn('2', 'B');
        cache.learn('3', 'C');
        expect(writes).not.toHaveBeenCalled();
        vi.advanceTimersByTime(5_000);
        expect(writes).toHaveBeenCalledTimes(1);
        expect(store.current).toEqual({ '1': 'A', '2': 'B', '3': 'C' });
        // Nothing changed since — flush must not write again.
        cache.flush();
        expect(writes).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('stops learning at the cap rather than evicting a name in use', () => {
        const cache = new SkillNameCache();
        for (let i = 0; i < SKILL_NAME_CACHE_MAX; i += 1) cache.learn(String(i), `Skill Name ${i}`);
        expect(cache.size).toBe(SKILL_NAME_CACHE_MAX);
        expect(cache.learn('overflow', 'Too Late')).toBe(false);
        // The earliest entry is still there; nothing was evicted to make room.
        expect(cache.lookup('0')).toBe('Skill Name 0');
    });
});

describe('learn / apply over a details object', () => {
    it('teaches one log from another', () => {
        const cache = new SkillNameCache();
        const namedLog = detailsWith({ s80224: { name: 'Rend' } });
        const placeholderLog = detailsWith({ s80224: { name: 'Skill 80224' } });

        // Before anything is learned the placeholder stands.
        expect(applyLearnedSkillNames(placeholderLog, cache)).toBe(0);
        expect(placeholderLog.skillMap.s80224.name).toBe('Skill 80224');

        expect(learnSkillNames(namedLog, cache)).toBe(1);
        expect(applyLearnedSkillNames(placeholderLog, cache)).toBe(1);
        expect(placeholderLog.skillMap.s80224.name).toBe('Rend');
    });

    it('never displaces a real name', () => {
        const cache = new SkillNameCache();
        cache.learn('80224', 'Rend');
        const log = detailsWith({ s80224: { name: 'A Better Name From The Log' } });
        expect(applyLearnedSkillNames(log, cache)).toBe(0);
        expect(log.skillMap.s80224.name).toBe('A Better Name From The Log');
    });

    it('shares one id space across skillMap, buffMap and both native catalogs', () => {
        const cache = new SkillNameCache();
        // 873 is Resolution whether read as a buff or as the skill applying it.
        learnSkillNames(detailsWith({}, { buffMap: { b873: { name: 'Resolution' } } }), cache);

        const log = detailsWith(
            { s873: { name: 'Skill 873' } },
            {
                buffMap: { b873: { name: 'Skill 873' } },
                native: {
                    catalogs: {
                        skills: { '873': { name: 'Skill 873' } },
                        buffs: { '873': { name: 'Skill 873' } },
                    },
                },
            }
        );
        // All four maps must be substituted: EI-shaped views and the views
        // already migrated to the native catalogs read different halves.
        expect(applyLearnedSkillNames(log, cache)).toBe(4);
        expect(log.skillMap.s873.name).toBe('Resolution');
        expect(log.buffMap.b873.name).toBe('Resolution');
        expect(log.native.catalogs.skills['873'].name).toBe('Resolution');
        expect(log.native.catalogs.buffs['873'].name).toBe('Resolution');
    });

    it('does not confuse a prefixed key with a bare one', () => {
        const cache = new SkillNameCache();
        // `s873` must learn under `873`, not under `s873`, or the native
        // catalog (which keys bare) would never match it.
        learnSkillNames(detailsWith({ s873: { name: 'Resolution' } }), cache);
        expect(cache.lookup('873')).toBe('Resolution');
        expect(cache.lookup('s873')).toBeUndefined();
    });

    it('tolerates missing maps and junk entries', () => {
        const cache = new SkillNameCache();
        expect(() => learnSkillNames(null, cache)).not.toThrow();
        expect(() => learnSkillNames({ skillMap: 'nope' }, cache)).not.toThrow();
        expect(() => applyLearnedSkillNames(undefined, cache)).not.toThrow();
        expect(learnSkillNames(detailsWith({ s1: null, s2: 'string', s3: { name: 'Ok' } }), cache)).toBe(1);
    });
});

describe('applyEiCompatShims integration', () => {
    it('recovers a name across two parses in the order they arrive', () => {
        initSkillNameCache(memoryStore().persistence, 0);

        // Parse 1: this client had the skill cached, so the log names it.
        const first: any = { skillMap: { s80224: { name: 'Rend' } } };
        applyEiCompatShims(first, '/logs/first.zevtc');

        // Parse 2: same skill, same build, but this log carries no name.
        const second: any = { skillMap: { s80224: { name: 'Skill 80224' } } };
        applyEiCompatShims(second, '/logs/second.zevtc');
        expect(second.skillMap.s80224.name).toBe('Rend');

        expect(getSkillNameCache().lookup('80224')).toBe('Rend');
    });

    it('recovers on re-read of an already-cached details object', () => {
        // The shim also runs when details come back from the dps.report cache,
        // which is what lets a name learned today reach a log parsed months ago.
        initSkillNameCache(memoryStore({ '80224': 'Rend' }).persistence, 0);
        const stale: any = { skillMap: { s80224: { name: 'Skill 80224' } } };
        applyEiCompatShims(stale, '/cache/stale.json');
        expect(stale.skillMap.s80224.name).toBe('Rend');
    });

    it('leaves an id nothing has ever named alone', () => {
        initSkillNameCache(memoryStore().persistence, 0);
        const log: any = { skillMap: { s10667: { name: 'Skill 10667' } } };
        applyEiCompatShims(log, '/logs/only.zevtc');
        expect(log.skillMap.s10667.name).toBe('Skill 10667');
    });
});
