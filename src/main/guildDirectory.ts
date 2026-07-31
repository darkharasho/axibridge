export interface ResolvedGuild {
    id: string;
    name: string | null;
    tag: string | null;
}

const GW2_GUILD_ENDPOINT = 'https://api.guildwars2.com/v2/guild/';
const RESOLVE_TIMEOUT_MS = 8_000;

type StoreLike = { get(key: string, def?: any): any; set(key: string, value: any): void };

/** Resolve a guild id to { name, tag } via the public GW2 API, backed by a
 *  permanent electron-store cache (guild names/tags don't change). Failures
 *  return id-only and cache nothing so the next upload retries. Never throws. */
export async function resolveGuild(
    guildId: string,
    store: StoreLike,
    fetchImpl?: typeof fetch
): Promise<ResolvedGuild> {
    const doFetch = fetchImpl || fetch;
    const cached = (store.get('guildDirectory', {}) as Record<string, any>)[guildId];
    if (cached && typeof cached.name === 'string' && typeof cached.tag === 'string') {
        return { id: guildId, name: cached.name, tag: cached.tag };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
    try {
        const resp = await doFetch(`${GW2_GUILD_ENDPOINT}${guildId}`, { signal: controller.signal });
        if (!resp.ok) return { id: guildId, name: null, tag: null };
        const body: any = await resp.json();
        if (typeof body?.name !== 'string' || typeof body?.tag !== 'string') {
            return { id: guildId, name: null, tag: null };
        }
        const directory = { ...(store.get('guildDirectory', {}) as Record<string, any>) };
        directory[guildId] = { name: body.name, tag: body.tag, resolvedAt: new Date().toISOString() };
        store.set('guildDirectory', directory);
        return { id: guildId, name: body.name, tag: body.tag };
    } catch {
        return { id: guildId, name: null, tag: null };
    } finally {
        clearTimeout(timer);
    }
}
