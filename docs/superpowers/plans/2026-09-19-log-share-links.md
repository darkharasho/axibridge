# Log Share Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dps.report permalink with our own short share link, `bridge.axi.link/r/<code>`, where only a ~300-byte pointer is hosted by us.

**Architecture:** Three storage tiers — a Cloudflare KV pointer we own, the brotli-compressed native axilog report in the *user's* R2 or GitHub Pages, and an optional raw `.zevtc`. A small Cloudflare Worker resolves codes, emits Open Graph tags for Discord previews, and stamps last-seen for LRU. Retention runs client-side at publish time and *demotes* reports (full → replay-stripped → summary card) instead of deleting them, so a link never 404s.

**Tech Stack:** TypeScript, Electron main process, Cloudflare Workers + KV, node `zlib` brotli, vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-log-share-links-design.md`

## Global Constraints

- Share link domain is exactly `bridge.axi.link`; path prefix is `/r/`. The `bridge.` subdomain is deliberate (namespaces AxiBridge against other `axi.link` products) — do not shorten to `axi.link/r/`.
- Share codes are exactly 8 characters from the base62 alphabet `0-9A-Za-z`, generated with a CSPRNG.
- Tier 1 stores the **native axilog** block, not the EI-shaped JSON.
- Compression is brotli at quality 11.
- `vitest.config.ts` pins `pool: 'forks'` and `maxWorkers: 2`. Do not raise it; run tests with plain `npx vitest run`.
- Lint runs with `--max-warnings 0`. Code must pass `npm run lint` and `npm run typecheck`.
- Existing indentation in `src/main/` is 4 spaces. Match it.
- Do NOT modify or delete `src/main/uploader.ts` or `src/main/permalinkWait.ts`. dps.report coexists with share links in v1.
- No test may contact live GitHub, live R2, or live Cloudflare.

---

## File Structure

**New — Worker (separate deploy target, not bundled into Electron):**
- `worker/wrangler.toml` — Worker config and KV binding
- `worker/src/pointer.ts` — pure: code generation, pointer record shape and validation
- `worker/src/og.ts` — pure: Open Graph HTML for a resolved pointer
- `worker/src/auth.ts` — pure-ish: GitHub token → login, KV-backed rate limit
- `worker/src/index.ts` — thin fetch handler wiring the three routes
- `worker/src/__tests__/` — vitest against a fake KV

**New — client:**
- `src/shared/shareSummary.ts` — builds the ~200 B summary from a parsed log
- `src/main/shareRetention.ts` — pure retention ladder
- `src/main/shareService.ts` — compress → upload Tier 1 → create pointer
- `src/main/handlers/shareHandlers.ts` — IPC surface

**Modified:**
- `src/renderer/global.d.ts` — add `shareId` / `shareUrl` to `ILogData`
- `src/renderer/stats/hooks/useStatsUploads.ts:290` — `shareUrl || permalink`
- `src/renderer/stats/incrementalAggregation.ts:562,571` — `shareUrl || permalink`
- `package.json` — add `wrangler` devDependency and worker scripts

---

### Task 1: Pointer record and code generation

**Files:**
- Create: `worker/src/pointer.ts`
- Test: `worker/src/__tests__/pointer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Stage = 'full' | 'demoted' | 'tombstone'`
  - `interface ShareSummary { f: string; m: string; d: number; t: number; sq: number; en: number }`
  - `interface PointerRecord { v: 1; loc: string; raw?: string; stage: Stage; sum: ShareSummary; created: number; seen: number; owner: string }`
  - `generateCode(bytes?: Uint8Array): string`
  - `isValidCode(code: string): boolean`
  - `parsePointer(json: string | null): PointerRecord | null`

- [ ] **Step 1: Write the failing test**

Create `worker/src/__tests__/pointer.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { generateCode, isValidCode, parsePointer, type PointerRecord } from '../pointer';

const summary = { f: 'Detonator', m: 'Eternal Battlegrounds', d: 182000, t: 1758240000000, sq: 42, en: 51 };

const record: PointerRecord = {
    v: 1,
    loc: 'https://cdn.example.com/a.br',
    stage: 'full',
    sum: summary,
    created: 1758240000000,
    seen: 1758240000000,
    owner: 'darkharasho'
};

describe('generateCode', () => {
    it('produces exactly 8 base62 characters', () => {
        const code = generateCode();
        expect(code).toHaveLength(8);
        expect(code).toMatch(/^[0-9A-Za-z]{8}$/);
    });

    it('is deterministic for given random bytes', () => {
        const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(generateCode(bytes)).toBe(generateCode(bytes));
    });

    it('maps distinct bytes to distinct codes', () => {
        const a = generateCode(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
        const b = generateCode(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]));
        expect(a).not.toBe(b);
    });
});

describe('isValidCode', () => {
    it.each(['k3Xm9qR2', '00000000', 'zzzzzzzz'])('accepts %s', (code) => {
        expect(isValidCode(code)).toBe(true);
    });

    it.each(['short', 'toolongcode', 'has-dash', '', 'k3Xm9qR!'])('rejects %s', (code) => {
        expect(isValidCode(code)).toBe(false);
    });
});

describe('parsePointer', () => {
    it('round-trips a valid record', () => {
        expect(parsePointer(JSON.stringify(record))).toEqual(record);
    });

    it('returns null for null input', () => {
        expect(parsePointer(null)).toBeNull();
    });

    it('returns null for malformed JSON', () => {
        expect(parsePointer('{not json')).toBeNull();
    });

    it('returns null when the version is unknown', () => {
        expect(parsePointer(JSON.stringify({ ...record, v: 2 }))).toBeNull();
    });

    it('returns null when a required field is missing', () => {
        const { loc, ...withoutLoc } = record;
        expect(parsePointer(JSON.stringify(withoutLoc))).toBeNull();
    });

    it('returns null when the stage is not a known stage', () => {
        expect(parsePointer(JSON.stringify({ ...record, stage: 'archived' }))).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/src/__tests__/pointer.test.ts`
Expected: FAIL — cannot resolve `../pointer`.

- [ ] **Step 3: Write minimal implementation**

Create `worker/src/pointer.ts`:

```typescript
/**
 * The pointer record is the only thing we host per share link (~300 B in KV).
 * Everything else — the report bytes — lives in the user's own storage, so this
 * record is what lets a link survive the user relocating them.
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const CODE_LENGTH = 8;

export type Stage = 'full' | 'demoted' | 'tombstone';

const STAGES: readonly Stage[] = ['full', 'demoted', 'tombstone'];

export interface ShareSummary {
    /** Fight name. */
    f: string;
    /** Map / zone name. */
    m: string;
    /** Duration in ms. */
    d: number;
    /** Fight start, epoch ms. */
    t: number;
    /** Squad size. */
    sq: number;
    /** Enemy count. */
    en: number;
}

export interface PointerRecord {
    v: 1;
    /** Absolute URL of the brotli-compressed native report (Tier 1). */
    loc: string;
    /** Absolute URL of the raw .zevtc (Tier 2), when the user opted in. */
    raw?: string;
    stage: Stage;
    sum: ShareSummary;
    created: number;
    /** Last resolve, epoch ms. Drives least-recently-used retention. */
    seen: number;
    /** GitHub login that created the pointer. */
    owner: string;
}

export const generateCode = (bytes?: Uint8Array): string => {
    const source = bytes ?? crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += ALPHABET[(source[i] ?? 0) % ALPHABET.length];
    }
    return code;
};

export const isValidCode = (code: string): boolean =>
    typeof code === 'string' && new RegExp(`^[0-9A-Za-z]{${CODE_LENGTH}}$`).test(code);

const isSummary = (value: any): value is ShareSummary =>
    !!value
    && typeof value.f === 'string'
    && typeof value.m === 'string'
    && typeof value.d === 'number'
    && typeof value.t === 'number'
    && typeof value.sq === 'number'
    && typeof value.en === 'number';

export const parsePointer = (json: string | null): PointerRecord | null => {
    if (!json) return null;
    let parsed: any;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (!parsed || parsed.v !== 1) return null;
    if (typeof parsed.loc !== 'string' || !parsed.loc) return null;
    if (!STAGES.includes(parsed.stage)) return null;
    if (!isSummary(parsed.sum)) return null;
    if (typeof parsed.created !== 'number' || typeof parsed.seen !== 'number') return null;
    if (typeof parsed.owner !== 'string') return null;
    return parsed as PointerRecord;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/src/__tests__/pointer.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add worker/src/pointer.ts worker/src/__tests__/pointer.test.ts
git commit -m "feat(worker): pointer record shape and share code generation"
```

---

### Task 2: Open Graph rendering

**Files:**
- Create: `worker/src/og.ts`
- Test: `worker/src/__tests__/og.test.ts`

**Interfaces:**
- Consumes: `PointerRecord`, `ShareSummary`, `Stage` from `worker/src/pointer.ts` (Task 1).
- Produces: `renderPointerHtml(record: PointerRecord, opts: { code: string; viewerUrl: string }): string`

This is what makes a Discord preview work: the crawler never runs JavaScript, so the
title/description must be in the served HTML.

- [ ] **Step 1: Write the failing test**

Create `worker/src/__tests__/og.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { renderPointerHtml } from '../og';
import type { PointerRecord } from '../pointer';

const base: PointerRecord = {
    v: 1,
    loc: 'https://cdn.example.com/a.br',
    stage: 'full',
    sum: { f: 'Detonator', m: 'Eternal Battlegrounds', d: 182000, t: 1758240000000, sq: 42, en: 51 },
    created: 1758240000000,
    seen: 1758240000000,
    owner: 'darkharasho'
};

const render = (record: PointerRecord) =>
    renderPointerHtml(record, { code: 'k3Xm9qR2', viewerUrl: 'https://bridge.axi.link/view' });

describe('renderPointerHtml', () => {
    it('puts the fight name in the og:title', () => {
        expect(render(base)).toContain('<meta property="og:title" content="Detonator');
    });

    it('describes squad, enemies, map and duration', () => {
        const html = render(base);
        expect(html).toContain('42 squad');
        expect(html).toContain('51 enemies');
        expect(html).toContain('Eternal Battlegrounds');
        expect(html).toContain('3:02');
    });

    it('embeds the report location for the client-side viewer', () => {
        expect(render(base)).toContain('https://cdn.example.com/a.br');
    });

    it('marks a tombstone as expired and omits the report location', () => {
        const html = render({ ...base, stage: 'tombstone' });
        expect(html).toContain('no longer stored');
        expect(html).not.toContain('https://cdn.example.com/a.br');
    });

    it('notes that a demoted report has no replay', () => {
        expect(render({ ...base, stage: 'demoted' })).toContain('without map replay');
    });

    it('escapes HTML metacharacters in the fight name', () => {
        const html = render({ ...base, sum: { ...base.sum, f: 'Ranger "<Zerg>" & Co' } });
        expect(html).toContain('&quot;');
        expect(html).toContain('&lt;Zerg&gt;');
        expect(html).toContain('&amp;');
        expect(html).not.toContain('<Zerg>');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/src/__tests__/og.test.ts`
Expected: FAIL — cannot resolve `../og`.

- [ ] **Step 3: Write minimal implementation**

Create `worker/src/og.ts`:

```typescript
import type { PointerRecord } from './pointer';

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const formatDuration = (ms: number): string => {
    const total = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const describe = (record: PointerRecord): string => {
    const { sq, en, m, d } = record.sum;
    const head = `${sq} squad vs ${en} enemies · ${m} · ${formatDuration(d)}`;
    if (record.stage === 'tombstone') return `${head} — full report no longer stored`;
    if (record.stage === 'demoted') return `${head} — full stats, without map replay`;
    return head;
};

/**
 * Discord's crawler does not run JavaScript, so the preview has to be in the
 * served HTML. The heavy report is fetched client-side from the user's own
 * storage, which never touches this Worker.
 */
export const renderPointerHtml = (
    record: PointerRecord,
    opts: { code: string; viewerUrl: string }
): string => {
    const title = escapeHtml(record.sum.f);
    const description = escapeHtml(describe(record));
    const canonical = escapeHtml(`https://bridge.axi.link/r/${opts.code}`);
    const boot = record.stage === 'tombstone'
        ? 'null'
        : JSON.stringify({ loc: record.loc, stage: record.stage });

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title} — AxiBridge</title>
<meta property="og:title" content="${title} — AxiBridge">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="${canonical}">
</head>
<body>
<script id="axibridge-share" type="application/json">${boot}</script>
<script type="module" src="${escapeHtml(opts.viewerUrl)}/viewer.js"></script>
</body>
</html>`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/src/__tests__/og.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add worker/src/og.ts worker/src/__tests__/og.test.ts
git commit -m "feat(worker): Open Graph rendering for share links"
```

---

### Task 3: GitHub token auth and rate limiting

**Files:**
- Create: `worker/src/auth.ts`
- Test: `worker/src/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface KVLike { get(key: string): Promise<string | null>; put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>; delete(key: string): Promise<void> }`
  - `resolveOwner(token: string | null, fetchImpl: typeof fetch): Promise<string | null>`
  - `checkRateLimit(kv: KVLike, owner: string, opts?: { limit?: number; windowSeconds?: number }): Promise<boolean>`
  - `RATE_LIMIT_PER_HOUR` (number, value `120`)

`KVLike` is the KV seam used by every later Worker task — tests pass a fake, production passes the real binding.

- [ ] **Step 1: Write the failing test**

Create `worker/src/__tests__/auth.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit, RATE_LIMIT_PER_HOUR, resolveOwner, type KVLike } from '../auth';

const fakeKv = (): KVLike & { store: Map<string, string> } => {
    const store = new Map<string, string>();
    return {
        store,
        get: async (key) => store.get(key) ?? null,
        put: async (key, value) => { store.set(key, value); },
        delete: async (key) => { store.delete(key); }
    };
};

const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('resolveOwner', () => {
    it('returns the GitHub login for a valid token', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { login: 'darkharasho' }));
        await expect(resolveOwner('gho_valid', fetchImpl as any)).resolves.toBe('darkharasho');
    });

    it('sends the token as a bearer credential', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { login: 'darkharasho' }));
        await resolveOwner('gho_valid', fetchImpl as any);
        const [, init] = fetchImpl.mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer gho_valid');
    });

    it('returns null for a rejected token', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Bad credentials' }));
        await expect(resolveOwner('gho_bad', fetchImpl as any)).resolves.toBeNull();
    });

    it('returns null when no token is supplied', async () => {
        const fetchImpl = vi.fn();
        await expect(resolveOwner(null, fetchImpl as any)).resolves.toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('returns null when GitHub is unreachable', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
        await expect(resolveOwner('gho_valid', fetchImpl as any)).resolves.toBeNull();
    });
});

describe('checkRateLimit', () => {
    it('allows the first request', async () => {
        await expect(checkRateLimit(fakeKv(), 'darkharasho')).resolves.toBe(true);
    });

    it('allows requests up to the limit and denies the next', async () => {
        const kv = fakeKv();
        for (let i = 0; i < RATE_LIMIT_PER_HOUR; i += 1) {
            await expect(checkRateLimit(kv, 'darkharasho')).resolves.toBe(true);
        }
        await expect(checkRateLimit(kv, 'darkharasho')).resolves.toBe(false);
    });

    it('counts each owner separately', async () => {
        const kv = fakeKv();
        for (let i = 0; i < RATE_LIMIT_PER_HOUR; i += 1) await checkRateLimit(kv, 'a');
        await expect(checkRateLimit(kv, 'a')).resolves.toBe(false);
        await expect(checkRateLimit(kv, 'b')).resolves.toBe(true);
    });

    it('honours an explicit lower limit', async () => {
        const kv = fakeKv();
        await expect(checkRateLimit(kv, 'a', { limit: 1 })).resolves.toBe(true);
        await expect(checkRateLimit(kv, 'a', { limit: 1 })).resolves.toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/src/__tests__/auth.test.ts`
Expected: FAIL — cannot resolve `../auth`.

- [ ] **Step 3: Write minimal implementation**

Create `worker/src/auth.ts`:

```typescript
/**
 * The KV seam. Tests hand in a Map-backed fake; production hands in the real
 * binding. Nothing above this interface knows which it got.
 */
export interface KVLike {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
}

export const RATE_LIMIT_PER_HOUR = 120;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

/**
 * Resolve a GitHub token to its login. Creating a pointer writes to storage we
 * pay for, so it needs a door; reusing the token the app already holds avoids
 * standing up an identity system for it.
 */
export const resolveOwner = async (
    token: string | null,
    fetchImpl: typeof fetch = fetch
): Promise<string | null> => {
    if (!token) return null;
    try {
        const response = await fetchImpl('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'axibridge-share'
            }
        });
        if (!response.ok) return null;
        const body = await response.json() as { login?: unknown };
        return typeof body?.login === 'string' && body.login ? body.login : null;
    } catch {
        return null;
    }
};

export const checkRateLimit = async (
    kv: KVLike,
    owner: string,
    opts: { limit?: number; windowSeconds?: number } = {}
): Promise<boolean> => {
    const limit = opts.limit ?? RATE_LIMIT_PER_HOUR;
    const windowSeconds = opts.windowSeconds ?? RATE_LIMIT_WINDOW_SECONDS;
    const key = `rl:${owner}`;
    const current = Number.parseInt((await kv.get(key)) ?? '0', 10) || 0;
    if (current >= limit) return false;
    await kv.put(key, String(current + 1), { expirationTtl: windowSeconds });
    return true;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/src/__tests__/auth.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add worker/src/auth.ts worker/src/__tests__/auth.test.ts
git commit -m "feat(worker): GitHub token auth and per-owner rate limiting"
```

---

### Task 4: Worker routes

**Files:**
- Create: `worker/src/index.ts`
- Create: `worker/wrangler.toml`
- Create: `worker/tsconfig.json`
- Test: `worker/src/__tests__/index.test.ts`
- Modify: `package.json` (add `wrangler` devDependency and two scripts)

**Interfaces:**
- Consumes: `generateCode`, `isValidCode`, `parsePointer`, `PointerRecord`, `ShareSummary`, `Stage` (Task 1); `renderPointerHtml` (Task 2); `resolveOwner`, `checkRateLimit`, `KVLike` (Task 3).
- Produces:
  - `interface Env { SHARE: KVLike; VIEWER_URL: string }`
  - `handleRequest(request: Request, env: Env, fetchImpl?: typeof fetch): Promise<Response>`
  - default export `{ fetch }` for Workers

- [ ] **Step 1: Write the failing test**

Create `worker/src/__tests__/index.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { handleRequest, type Env } from '../index';
import type { KVLike } from '../auth';
import type { PointerRecord } from '../pointer';

const fakeKv = (): KVLike & { store: Map<string, string> } => {
    const store = new Map<string, string>();
    return {
        store,
        get: async (key) => store.get(key) ?? null,
        put: async (key, value) => { store.set(key, value); },
        delete: async (key) => { store.delete(key); }
    };
};

const env = (kv: KVLike): Env => ({ SHARE: kv, VIEWER_URL: 'https://bridge.axi.link/view' });

const okUser = () => vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ login: 'darkharasho' }), { status: 200 })
);

const summary = { f: 'Detonator', m: 'Eternal Battlegrounds', d: 182000, t: 1758240000000, sq: 42, en: 51 };

const record = (over: Partial<PointerRecord> = {}): PointerRecord => ({
    v: 1,
    loc: 'https://cdn.example.com/a.br',
    stage: 'full',
    sum: summary,
    created: 1,
    seen: 1,
    owner: 'darkharasho',
    ...over
});

const post = (body: unknown, token = 'gho_valid') =>
    new Request('https://bridge.axi.link/r', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });

describe('POST /r', () => {
    it('creates a pointer and returns a valid code and url', async () => {
        const kv = fakeKv();
        const res = await handleRequest(post({ loc: 'https://cdn.example.com/a.br', sum: summary }), env(kv), okUser() as any);
        expect(res.status).toBe(201);
        const body = await res.json() as { code: string; url: string };
        expect(body.code).toMatch(/^[0-9A-Za-z]{8}$/);
        expect(body.url).toBe(`https://bridge.axi.link/r/${body.code}`);
        expect(kv.store.size).toBe(2); // pointer + rate-limit counter
    });

    it('stores the owner resolved from the token', async () => {
        const kv = fakeKv();
        const res = await handleRequest(post({ loc: 'https://cdn.example.com/a.br', sum: summary }), env(kv), okUser() as any);
        const { code } = await res.json() as { code: string };
        expect(JSON.parse(kv.store.get(`p:${code}`)!).owner).toBe('darkharasho');
    });

    it('rejects an unauthenticated request', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
        const res = await handleRequest(post({ loc: 'x', sum: summary }, 'bad'), env(fakeKv()), fetchImpl as any);
        expect(res.status).toBe(401);
    });

    it('rejects a body with no location', async () => {
        const res = await handleRequest(post({ sum: summary }), env(fakeKv()), okUser() as any);
        expect(res.status).toBe(400);
    });

    it('rejects a body with a malformed summary', async () => {
        const res = await handleRequest(post({ loc: 'x', sum: { f: 'a' } }), env(fakeKv()), okUser() as any);
        expect(res.status).toBe(400);
    });

    it('rejects once the owner is over the rate limit', async () => {
        const kv = fakeKv();
        await kv.put('rl:darkharasho', '120');
        const res = await handleRequest(post({ loc: 'x', sum: summary }), env(kv), okUser() as any);
        expect(res.status).toBe(429);
    });
});

describe('GET /r/:code', () => {
    it('serves HTML carrying the Open Graph title', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
        expect(await res.text()).toContain('og:title');
    });

    it('stamps lastSeen so retention can sort by least-recently-used', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record({ seen: 1 })));
        await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).seen).toBeGreaterThan(1);
    });

    it('404s an unknown code', async () => {
        const res = await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(fakeKv()), okUser() as any);
        expect(res.status).toBe(404);
    });

    it('404s a malformed code without touching KV', async () => {
        const kv = fakeKv();
        const getSpy = vi.spyOn(kv, 'get');
        const res = await handleRequest(new Request('https://bridge.axi.link/r/nope'), env(kv), okUser() as any);
        expect(res.status).toBe(404);
        expect(getSpy).not.toHaveBeenCalled();
    });

    it('still serves a tombstone rather than 404ing', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record({ stage: 'tombstone' })));
        const res = await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('no longer stored');
    });
});

describe('PATCH /r/:code', () => {
    const patch = (code: string, stage: string, token = 'gho_valid') =>
        new Request(`https://bridge.axi.link/r/${code}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ stage })
        });

    it('demotes a pointer owned by the caller', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(patch('k3Xm9qR2', 'demoted'), env(kv), okUser() as any);
        expect(res.status).toBe(200);
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).stage).toBe('demoted');
    });

    it('refuses to modify a pointer owned by someone else', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record({ owner: 'someone-else' })));
        const res = await handleRequest(patch('k3Xm9qR2', 'demoted'), env(kv), okUser() as any);
        expect(res.status).toBe(403);
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).stage).toBe('full');
    });

    it('rejects an unknown stage', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(patch('k3Xm9qR2', 'archived'), env(kv), okUser() as any);
        expect(res.status).toBe(400);
    });
});

describe('routing', () => {
    it('404s an unrelated path', async () => {
        const res = await handleRequest(new Request('https://bridge.axi.link/other'), env(fakeKv()), okUser() as any);
        expect(res.status).toBe(404);
    });

    it('405s an unsupported method on a pointer', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(
            new Request('https://bridge.axi.link/r/k3Xm9qR2', { method: 'DELETE' }),
            env(kv),
            okUser() as any
        );
        expect(res.status).toBe(405);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/src/__tests__/index.test.ts`
Expected: FAIL — cannot resolve `../index`.

- [ ] **Step 3: Write minimal implementation**

Create `worker/src/index.ts`:

```typescript
import { checkRateLimit, resolveOwner, type KVLike } from './auth';
import { renderPointerHtml } from './og';
import {
    generateCode,
    isValidCode,
    parsePointer,
    type PointerRecord,
    type ShareSummary,
    type Stage
} from './pointer';

export interface Env {
    SHARE: KVLike;
    VIEWER_URL: string;
}

const STAGES: readonly Stage[] = ['full', 'demoted', 'tombstone'];

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const bearer = (request: Request): string | null => {
    const header = request.headers.get('Authorization') || '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
};

const isSummary = (value: any): value is ShareSummary =>
    !!value
    && typeof value.f === 'string'
    && typeof value.m === 'string'
    && typeof value.d === 'number'
    && typeof value.t === 'number'
    && typeof value.sq === 'number'
    && typeof value.en === 'number';

const key = (code: string) => `p:${code}`;

const createPointer = async (request: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> => {
    const owner = await resolveOwner(bearer(request), fetchImpl);
    if (!owner) return json(401, { error: 'GitHub authentication required.' });
    if (!(await checkRateLimit(env.SHARE, owner))) {
        return json(429, { error: 'Share rate limit reached. Try again later.' });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json(400, { error: 'Malformed JSON body.' });
    }
    if (typeof body?.loc !== 'string' || !body.loc) return json(400, { error: 'Missing report location.' });
    if (!isSummary(body?.sum)) return json(400, { error: 'Missing or malformed summary.' });

    const now = Date.now();
    const record: PointerRecord = {
        v: 1,
        loc: body.loc,
        stage: 'full',
        sum: body.sum,
        created: now,
        seen: now,
        owner,
        ...(typeof body.raw === 'string' && body.raw ? { raw: body.raw } : {})
    };

    const code = generateCode();
    await env.SHARE.put(key(code), JSON.stringify(record));
    return json(201, { code, url: `https://bridge.axi.link/r/${code}` });
};

const resolvePointer = async (code: string, env: Env): Promise<Response> => {
    const record = parsePointer(await env.SHARE.get(key(code)));
    if (!record) return new Response('Not found', { status: 404 });

    // Stamping every resolve is what makes real least-recently-used retention
    // possible — GitHub Pages cannot tell us whether a report was ever opened.
    await env.SHARE.put(key(code), JSON.stringify({ ...record, seen: Date.now() }));

    return new Response(renderPointerHtml(record, { code, viewerUrl: env.VIEWER_URL }), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
    });
};

const patchPointer = async (
    code: string,
    request: Request,
    env: Env,
    fetchImpl: typeof fetch
): Promise<Response> => {
    const owner = await resolveOwner(bearer(request), fetchImpl);
    if (!owner) return json(401, { error: 'GitHub authentication required.' });

    const record = parsePointer(await env.SHARE.get(key(code)));
    if (!record) return new Response('Not found', { status: 404 });
    if (record.owner !== owner) return json(403, { error: 'Not your share link.' });

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json(400, { error: 'Malformed JSON body.' });
    }
    if (!STAGES.includes(body?.stage)) return json(400, { error: 'Unknown stage.' });

    await env.SHARE.put(key(code), JSON.stringify({ ...record, stage: body.stage as Stage }));
    return json(200, { code, stage: body.stage });
};

export const handleRequest = async (
    request: Request,
    env: Env,
    fetchImpl: typeof fetch = fetch
): Promise<Response> => {
    const { pathname } = new URL(request.url);

    if (pathname === '/r' || pathname === '/r/') {
        if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
        return createPointer(request, env, fetchImpl);
    }

    const match = /^\/r\/([^/]+)\/?$/.exec(pathname);
    if (match) {
        const code = match[1];
        if (!isValidCode(code)) return new Response('Not found', { status: 404 });
        if (request.method === 'GET') return resolvePointer(code, env);
        if (request.method === 'PATCH') return patchPointer(code, request, env, fetchImpl);
        return new Response('Method not allowed', { status: 405 });
    }

    return new Response('Not found', { status: 404 });
};

export default {
    fetch: (request: Request, env: Env) => handleRequest(request, env)
};
```

Create `worker/wrangler.toml`:

```toml
name = "axibridge-share"
main = "src/index.ts"
compatibility_date = "2026-09-19"

routes = [
  { pattern = "bridge.axi.link/r", zone_name = "axi.link" },
  { pattern = "bridge.axi.link/r/*", zone_name = "axi.link" }
]

[vars]
VIEWER_URL = "https://bridge.axi.link/view"

[[kv_namespaces]]
binding = "SHARE"
id = "REPLACE_WITH_KV_NAMESPACE_ID"
```

> The `id` above is filled in by running `npx wrangler kv namespace create SHARE`
> and pasting the returned id. It is the one value this plan cannot supply,
> because the namespace does not exist until someone creates it.

Create `worker/tsconfig.json`:

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "lib": ["ES2022", "WebWorker"],
        "module": "ES2022",
        "moduleResolution": "bundler",
        "strict": true,
        "noEmit": true,
        "skipLibCheck": true,
        "types": []
    },
    "include": ["src/**/*.ts"]
}
```

Add to `package.json` `scripts`:

```json
"worker:dev": "wrangler dev --config worker/wrangler.toml",
"worker:deploy": "wrangler deploy --config worker/wrangler.toml"
```

Then install the deploy-only tool:

```bash
npm install --save-dev wrangler
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/src/__tests__/index.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add worker/src/index.ts worker/wrangler.toml worker/tsconfig.json worker/src/__tests__/index.test.ts package.json package-lock.json
git commit -m "feat(worker): share link routes with KV pointer storage"
```

---

### Task 5: Share summary builder

**Files:**
- Create: `src/shared/shareSummary.ts`
- Test: `src/shared/__tests__/shareSummary.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (the `ShareSummary` shape is duplicated deliberately — `src/shared/` must not import from `worker/`, which is a separate deploy target with its own tsconfig).
- Produces:
  - `interface ShareSummary { f: string; m: string; d: number; t: number; sq: number; en: number }`
  - `buildShareSummary(details: any): ShareSummary`
  - `SUMMARY_BUDGET_BYTES` (number, value `400`)

Keeping this under budget is what keeps a KV record ~300 B, which is the entire
basis for the cost model. The test asserts the budget directly.

- [ ] **Step 1: Write the failing test**

Create `src/shared/__tests__/shareSummary.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildShareSummary, SUMMARY_BUDGET_BYTES } from '../shareSummary';

const details = {
    fightName: 'Detonator',
    zone: 'Eternal Battlegrounds',
    durationMS: 182000,
    timeStart: 1758240000000,
    players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    targets: [{ name: 'E1' }, { name: 'E2' }]
};

describe('buildShareSummary', () => {
    it('extracts fight name, map, duration and start', () => {
        const summary = buildShareSummary(details);
        expect(summary.f).toBe('Detonator');
        expect(summary.m).toBe('Eternal Battlegrounds');
        expect(summary.d).toBe(182000);
        expect(summary.t).toBe(1758240000000);
    });

    it('counts squad and enemies from the rosters', () => {
        const summary = buildShareSummary(details);
        expect(summary.sq).toBe(3);
        expect(summary.en).toBe(2);
    });

    it('substitutes safe defaults for a details object missing everything', () => {
        expect(buildShareSummary({})).toEqual({ f: 'Unknown fight', m: 'Unknown', d: 0, t: 0, sq: 0, en: 0 });
    });

    it('tolerates a null details object', () => {
        expect(buildShareSummary(null).sq).toBe(0);
    });

    it('truncates an absurdly long fight name', () => {
        const summary = buildShareSummary({ ...details, fightName: 'x'.repeat(500) });
        expect(summary.f.length).toBeLessThanOrEqual(80);
    });

    it('stays within the KV summary budget even at worst case', () => {
        const summary = buildShareSummary({ ...details, fightName: 'x'.repeat(500), zone: 'y'.repeat(500) });
        expect(Buffer.byteLength(JSON.stringify(summary), 'utf8')).toBeLessThanOrEqual(SUMMARY_BUDGET_BYTES);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/shareSummary.test.ts`
Expected: FAIL — cannot resolve `../shareSummary`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/shareSummary.ts`:

```typescript
/**
 * The ~200-byte card stored alongside every share pointer.
 *
 * It does double duty: it is what Discord's crawler renders as a link preview,
 * and it is the floor retention demotes to. Because a tombstone keeps only this,
 * a share link never 404s — so the budget below is load-bearing for the whole
 * cost model, not a nicety.
 *
 * This shape is duplicated in `worker/src/pointer.ts` on purpose: the Worker is a
 * separate deploy target with its own tsconfig and must not import from `src/`.
 */

export const SUMMARY_BUDGET_BYTES = 400;

const MAX_TEXT = 80;

export interface ShareSummary {
    /** Fight name. */
    f: string;
    /** Map / zone name. */
    m: string;
    /** Duration in ms. */
    d: number;
    /** Fight start, epoch ms. */
    t: number;
    /** Squad size. */
    sq: number;
    /** Enemy count. */
    en: number;
}

const text = (value: unknown, fallback: string): string => {
    const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
    return raw.length > MAX_TEXT ? raw.slice(0, MAX_TEXT) : raw;
};

const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export const buildShareSummary = (details: any): ShareSummary => ({
    f: text(details?.fightName, 'Unknown fight'),
    m: text(details?.zone, 'Unknown'),
    d: num(details?.durationMS),
    t: num(details?.timeStart),
    sq: count(details?.players),
    en: count(details?.targets)
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/__tests__/shareSummary.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/shareSummary.ts src/shared/__tests__/shareSummary.test.ts
git commit -m "feat(share): build the share summary card from parsed details"
```

---

### Task 6: Retention ladder

**Files:**
- Create: `src/main/shareRetention.ts`
- Test: `src/main/__tests__/shareRetention.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type RetentionStage = 'full' | 'demoted' | 'tombstone'`
  - `interface RetentionEntry { id: string; bytes: number; stage: RetentionStage; seen: number | null; pinned: boolean }`
  - `interface RetentionAction { id: string; from: RetentionStage; to: RetentionStage; reclaimed: number }`
  - `planRetention(entries: RetentionEntry[], opts?: { budgetBytes?: number; highWaterPct?: number }): RetentionAction[]`
  - `PAGES_BUDGET_BYTES` (number, 1 GiB), `DEFAULT_HIGH_WATER_PCT` (number, `0.8`), `REPLAY_SHARE_OF_REPORT` (number, `0.66`)

This is the highest-value test surface in the plan: pure, total, and no network.

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/shareRetention.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_HIGH_WATER_PCT,
    PAGES_BUDGET_BYTES,
    planRetention,
    type RetentionEntry
} from '../shareRetention';

const MB = 1024 * 1024;

const entry = (over: Partial<RetentionEntry> & { id: string }): RetentionEntry => ({
    bytes: 4 * MB,
    stage: 'full',
    seen: 1000,
    pinned: false,
    ...over
});

/** A budget small enough to reason about: high-water is 800 bytes of a 1000-byte budget. */
const tiny = { budgetBytes: 1000, highWaterPct: 0.8 };

describe('planRetention', () => {
    it('does nothing when already under the high-water mark', () => {
        const entries = [entry({ id: 'a', bytes: 100 }), entry({ id: 'b', bytes: 200 })];
        expect(planRetention(entries, tiny)).toEqual([]);
    });

    it('does nothing when exactly at the high-water mark', () => {
        expect(planRetention([entry({ id: 'a', bytes: 800 })], tiny)).toEqual([]);
    });

    it('demotes the least-recently-seen report first', () => {
        const entries = [
            entry({ id: 'recent', bytes: 500, seen: 9000 }),
            entry({ id: 'stale', bytes: 500, seen: 1000 })
        ];
        const actions = planRetention(entries, tiny);
        expect(actions[0]).toMatchObject({ id: 'stale', from: 'full', to: 'demoted' });
    });

    it('treats a never-seen report as the most evictable', () => {
        const entries = [
            entry({ id: 'seen-once', bytes: 500, seen: 1 }),
            entry({ id: 'never-seen', bytes: 500, seen: null })
        ];
        expect(planRetention(entries, tiny)[0].id).toBe('never-seen');
    });

    it('reports how many bytes a demotion reclaims', () => {
        const actions = planRetention([entry({ id: 'a', bytes: 1000 })], tiny);
        expect(actions[0].reclaimed).toBe(660);
    });

    it('stops as soon as it is under the mark', () => {
        const entries = [
            entry({ id: 'a', bytes: 500, seen: 1 }),
            entry({ id: 'b', bytes: 500, seen: 2 }),
            entry({ id: 'c', bytes: 500, seen: 3 })
        ];
        // 1500 total, need <= 800. Demoting 'a' reclaims 330 -> 1170, 'b' -> 840, 'c' -> 510.
        expect(planRetention(entries, tiny).map((a) => a.id)).toEqual(['a', 'b', 'c']);
    });

    it('never touches a pinned report', () => {
        const entries = [
            entry({ id: 'pinned', bytes: 900, seen: 1, pinned: true }),
            entry({ id: 'free', bytes: 200, seen: 2 })
        ];
        expect(planRetention(entries, tiny).every((a) => a.id !== 'pinned')).toBe(true);
    });

    it('demotes everything eligible before tombstoning anything', () => {
        const entries = [
            entry({ id: 'a', bytes: 1000, seen: 1 }),
            entry({ id: 'b', bytes: 1000, seen: 2 })
        ];
        const actions = planRetention(entries, tiny);
        const firstTombstone = actions.findIndex((a) => a.to === 'tombstone');
        const lastDemote = actions.map((a) => a.to).lastIndexOf('demoted');
        expect(firstTombstone).toBeGreaterThan(lastDemote);
    });

    it('tombstones when demoting everything is not enough', () => {
        const entries = [entry({ id: 'a', bytes: 5000, seen: 1 })];
        const actions = planRetention(entries, tiny);
        expect(actions.map((a) => a.to)).toEqual(['demoted', 'tombstone']);
    });

    it('does not act on an already-tombstoned report', () => {
        const entries = [entry({ id: 'a', bytes: 0, stage: 'tombstone', seen: 1 })];
        expect(planRetention(entries, tiny)).toEqual([]);
    });

    it('gives up rather than looping when only pinned reports remain over budget', () => {
        const entries = [entry({ id: 'p', bytes: 5000, seen: 1, pinned: true })];
        expect(planRetention(entries, tiny)).toEqual([]);
    });

    it('handles an empty repository', () => {
        expect(planRetention([], tiny)).toEqual([]);
    });

    it('defaults to 80% of a 1 GiB Pages budget', () => {
        expect(PAGES_BUDGET_BYTES).toBe(1024 * 1024 * 1024);
        expect(DEFAULT_HIGH_WATER_PCT).toBe(0.8);
        const justUnder = entry({ id: 'a', bytes: PAGES_BUDGET_BYTES * 0.79 });
        expect(planRetention([justUnder])).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/shareRetention.test.ts`
Expected: FAIL — cannot resolve `../shareRetention`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/shareRetention.ts`:

```typescript
/**
 * Budget-driven retention for share reports.
 *
 * GitHub Pages is a ~1 GiB ceiling, not a monthly bill, so age-based expiry is
 * the wrong instrument: it evicts too early for a casual player and far too late
 * for a raid commander. We evict against a budget instead.
 *
 * Nothing is ever deleted. A report is demoted (replay stripped, ~66% of its
 * bytes) and only then tombstoned down to the KV summary card, which we store
 * anyway for Discord previews. That is why a share link never 404s.
 */

export const PAGES_BUDGET_BYTES = 1024 * 1024 * 1024;
export const DEFAULT_HIGH_WATER_PCT = 0.8;

/** Replay data is ~66% of a published report; demoting reclaims that much. */
export const REPLAY_SHARE_OF_REPORT = 0.66;

export type RetentionStage = 'full' | 'demoted' | 'tombstone';

export interface RetentionEntry {
    id: string;
    bytes: number;
    stage: RetentionStage;
    /** Last resolve from the Worker, epoch ms. `null` means never opened. */
    seen: number | null;
    pinned: boolean;
}

export interface RetentionAction {
    id: string;
    from: RetentionStage;
    to: RetentionStage;
    /** Bytes this single step frees. */
    reclaimed: number;
}

/** Never-opened reports are the most evictable, so they sort first. */
const byLeastRecentlySeen = (a: RetentionEntry, b: RetentionEntry) => (a.seen ?? 0) - (b.seen ?? 0);

export const planRetention = (
    entries: RetentionEntry[],
    opts: { budgetBytes?: number; highWaterPct?: number } = {}
): RetentionAction[] => {
    const budget = opts.budgetBytes ?? PAGES_BUDGET_BYTES;
    const highWater = budget * (opts.highWaterPct ?? DEFAULT_HIGH_WATER_PCT);

    const live = new Map(entries.map((e) => [e.id, { ...e }]));
    let total = entries.reduce((sum, e) => sum + e.bytes, 0);
    if (total <= highWater) return [];

    const actions: RetentionAction[] = [];
    const evictable = entries
        .filter((e) => !e.pinned)
        .slice()
        .sort(byLeastRecentlySeen);

    // Pass 1: strip replays. Reclaims two-thirds of each report while keeping
    // every stat table, so prefer doing it everywhere before losing a report.
    for (const candidate of evictable) {
        if (total <= highWater) break;
        const current = live.get(candidate.id)!;
        if (current.stage !== 'full') continue;
        const reclaimed = Math.round(current.bytes * REPLAY_SHARE_OF_REPORT);
        actions.push({ id: current.id, from: 'full', to: 'demoted', reclaimed });
        current.stage = 'demoted';
        current.bytes -= reclaimed;
        total -= reclaimed;
    }

    // Pass 2: only now give up stat tables.
    for (const candidate of evictable) {
        if (total <= highWater) break;
        const current = live.get(candidate.id)!;
        if (current.stage !== 'demoted') continue;
        const reclaimed = current.bytes;
        actions.push({ id: current.id, from: 'demoted', to: 'tombstone', reclaimed });
        current.stage = 'tombstone';
        current.bytes = 0;
        total -= reclaimed;
    }

    return actions;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/shareRetention.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/shareRetention.ts src/main/__tests__/shareRetention.test.ts
git commit -m "feat(share): budget-driven retention that demotes instead of deleting"
```

---

### Task 7: ShareService

**Files:**
- Create: `src/main/shareService.ts`
- Test: `src/main/__tests__/shareService.test.ts`

**Interfaces:**
- Consumes: `buildShareSummary`, `ShareSummary` from `src/shared/shareSummary.ts` (Task 5); the Worker's `POST /r` contract from Task 4; the existing `R2Uploader` interface from `src/main/cloudflare/uploader.ts`.
- Produces:
  - `interface ShareTarget { putObject(key: string, body: Buffer, contentType: string): Promise<{ success: boolean; url?: string; error?: string }> }`
  - `interface ShareDeps { target: ShareTarget; githubToken: string | null; fetchImpl?: typeof fetch; workerUrl?: string }`
  - `interface ShareResult { success: boolean; code?: string; url?: string; error?: string }`
  - `compressReport(details: unknown): Buffer`
  - `shareLog(details: any, logId: string, deps: ShareDeps): Promise<ShareResult>`

`ShareTarget` is structurally satisfied by the existing `R2Uploader`, so the R2 path
needs no adapter — pass the resolved uploader straight in.

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/shareService.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { brotliDecompressSync } from 'zlib';
import { compressReport, shareLog, type ShareTarget } from '../shareService';

const details = {
    fightName: 'Detonator',
    zone: 'Eternal Battlegrounds',
    durationMS: 182000,
    timeStart: 1758240000000,
    players: [{ name: 'A' }],
    targets: [{ name: 'E' }]
};

const okTarget = (): ShareTarget & { putObject: ReturnType<typeof vi.fn> } => ({
    putObject: vi.fn().mockResolvedValue({ success: true, url: 'https://cdn.example.com/a.br' })
});

const okWorker = () => vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ code: 'k3Xm9qR2', url: 'https://bridge.axi.link/r/k3Xm9qR2' }), { status: 201 })
);

const deps = (over: Partial<Parameters<typeof shareLog>[2]> = {}) => ({
    target: okTarget(),
    githubToken: 'gho_valid',
    fetchImpl: okWorker() as any,
    ...over
});

describe('compressReport', () => {
    it('round-trips through brotli', () => {
        const restored = JSON.parse(brotliDecompressSync(compressReport(details)).toString('utf8'));
        expect(restored).toEqual(details);
    });

    it('produces something smaller than the raw JSON', () => {
        const raw = Buffer.byteLength(JSON.stringify({ padding: 'a'.repeat(10000) }));
        expect(compressReport({ padding: 'a'.repeat(10000) }).length).toBeLessThan(raw);
    });
});

describe('shareLog', () => {
    it('returns the code and url from the worker', async () => {
        await expect(shareLog(details, 'log-1', deps())).resolves.toMatchObject({
            success: true,
            code: 'k3Xm9qR2',
            url: 'https://bridge.axi.link/r/k3Xm9qR2'
        });
    });

    it('uploads brotli-compressed bytes under a .br key', async () => {
        const target = okTarget();
        await shareLog(details, 'log-1', deps({ target }));
        const [key, body, contentType] = target.putObject.mock.calls[0];
        expect(key).toBe('shares/log-1.json.br');
        expect(contentType).toBe('application/json');
        expect(JSON.parse(brotliDecompressSync(body).toString('utf8'))).toEqual(details);
    });

    it('posts the summary and the uploaded location to the worker', async () => {
        const fetchImpl = okWorker();
        await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        const [, init] = fetchImpl.mock.calls[0];
        const body = JSON.parse(init.body);
        expect(body.loc).toBe('https://cdn.example.com/a.br');
        expect(body.sum.f).toBe('Detonator');
        expect(init.headers.Authorization).toBe('Bearer gho_valid');
    });

    it('fails without a GitHub token and never uploads', async () => {
        const target = okTarget();
        const result = await shareLog(details, 'log-1', deps({ target, githubToken: null }));
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/GitHub/i);
        expect(target.putObject).not.toHaveBeenCalled();
    });

    it('surfaces an upload failure without calling the worker', async () => {
        const target: ShareTarget = { putObject: vi.fn().mockResolvedValue({ success: false, error: 'bucket missing' }) };
        const fetchImpl = okWorker();
        const result = await shareLog(details, 'log-1', deps({ target, fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('bucket missing');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('surfaces a worker rejection', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: 'Share rate limit reached. Try again later.' }), { status: 429 })
        );
        const result = await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('rate limit');
    });

    it('surfaces a network failure reaching the worker', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
        const result = await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('offline');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/shareService.test.ts`
Expected: FAIL — cannot resolve `../shareService`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/shareService.ts`:

```typescript
import { brotliCompressSync, constants as zlibConstants } from 'zlib';
import { buildShareSummary } from '../shared/shareSummary';

export const DEFAULT_WORKER_URL = 'https://bridge.axi.link/r';

/**
 * The upload seam. Structurally satisfied by the existing `R2Uploader`, so the
 * R2 path passes its resolved uploader straight in with no adapter.
 */
export interface ShareTarget {
    putObject(
        key: string,
        body: Buffer,
        contentType: string
    ): Promise<{ success: boolean; url?: string; error?: string }>;
}

export interface ShareDeps {
    target: ShareTarget;
    githubToken: string | null;
    fetchImpl?: typeof fetch;
    workerUrl?: string;
}

export interface ShareResult {
    success: boolean;
    code?: string;
    url?: string;
    error?: string;
}

/**
 * Tier 1 is the native axilog block, brotli quality 11. Measured: ~0.78 MB for a
 * typical 42-player fight, ~4.2 MB for a large one.
 */
export const compressReport = (details: unknown): Buffer =>
    brotliCompressSync(Buffer.from(JSON.stringify(details), 'utf8'), {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 }
    });

export const shareLog = async (
    details: any,
    logId: string,
    deps: ShareDeps
): Promise<ShareResult> => {
    if (!deps.githubToken) {
        return { success: false, error: 'Connect GitHub in Settings to create share links.' };
    }

    const body = compressReport(details);
    const put = await deps.target.putObject(`shares/${logId}.json.br`, body, 'application/json');
    if (!put.success || !put.url) {
        return { success: false, error: put.error || 'Failed to upload the report.' };
    }

    const fetchImpl = deps.fetchImpl ?? fetch;
    try {
        const response = await fetchImpl(deps.workerUrl ?? DEFAULT_WORKER_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${deps.githubToken}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ loc: put.url, sum: buildShareSummary(details) })
        });
        const payload = await response.json().catch(() => ({})) as { code?: string; url?: string; error?: string };
        if (!response.ok) {
            return { success: false, error: payload.error || `Share service returned ${response.status}.` };
        }
        return { success: true, code: payload.code, url: payload.url };
    } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to reach the share service.' };
    }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/shareService.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/shareService.ts src/main/__tests__/shareService.test.ts
git commit -m "feat(share): compress and publish a report, then mint a share link"
```

---

### Task 8: Identity fields and the three call sites

**Files:**
- Modify: `src/renderer/global.d.ts` (add two fields to `ILogData`)
- Modify: `src/renderer/stats/hooks/useStatsUploads.ts:290`
- Modify: `src/renderer/stats/incrementalAggregation.ts:562` and `:571`
- Create: `src/main/shareIdentity.ts`
- Test: `src/main/__tests__/shareIdentity.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `shareIdentity(log: { shareUrl?: string | null; permalink?: string | null } | null | undefined): string`

`statsLogKey` keys on `filePath || id`, so squad stats, the worker payload store and
the fight slicer are all untouched by this. Only these three sites treat a link as
identity, and each must prefer the share link while still working for the thousands
of already-persisted logs that only have a dps.report permalink.

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/shareIdentity.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { shareIdentity } from '../shareIdentity';

describe('shareIdentity', () => {
    it('prefers the share url when both are present', () => {
        expect(shareIdentity({ shareUrl: 'https://bridge.axi.link/r/k3Xm9qR2', permalink: 'https://dps.report/abc' }))
            .toBe('https://bridge.axi.link/r/k3Xm9qR2');
    });

    it('falls back to the permalink for a pre-existing log', () => {
        expect(shareIdentity({ permalink: 'https://dps.report/abc' })).toBe('https://dps.report/abc');
    });

    it('uses the share url when there is no permalink', () => {
        expect(shareIdentity({ shareUrl: 'https://bridge.axi.link/r/k3Xm9qR2' }))
            .toBe('https://bridge.axi.link/r/k3Xm9qR2');
    });

    it('returns empty string when neither is present', () => {
        expect(shareIdentity({})).toBe('');
    });

    it.each([null, undefined])('returns empty string for %s', (log) => {
        expect(shareIdentity(log as any)).toBe('');
    });

    it('ignores an empty or whitespace share url', () => {
        expect(shareIdentity({ shareUrl: '   ', permalink: 'https://dps.report/abc' })).toBe('https://dps.report/abc');
    });

    it('trims surrounding whitespace', () => {
        expect(shareIdentity({ shareUrl: ' https://bridge.axi.link/r/k3Xm9qR2 ' }))
            .toBe('https://bridge.axi.link/r/k3Xm9qR2');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/shareIdentity.test.ts`
Expected: FAIL — cannot resolve `../shareIdentity`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/shareIdentity.ts`:

```typescript
/**
 * Which link identifies a log.
 *
 * Share links supersede dps.report permalinks, but thousands of already-persisted
 * logs carry only a permalink and must keep working untouched — so this prefers
 * the new link and falls back rather than migrating anything.
 */
export const shareIdentity = (
    log: { shareUrl?: string | null; permalink?: string | null } | null | undefined
): string => {
    const share = typeof log?.shareUrl === 'string' ? log.shareUrl.trim() : '';
    if (share) return share;
    const permalink = typeof log?.permalink === 'string' ? log.permalink.trim() : '';
    return permalink;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/shareIdentity.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Wire the two new fields into `ILogData`**

In `src/renderer/global.d.ts`, find the `ILogData` interface (it already declares
`permalink`). Add directly beneath that line:

```typescript
    /** Our own share link, e.g. https://bridge.axi.link/r/k3Xm9qR2. */
    shareUrl?: string;
    /** The 8-character share code backing `shareUrl`. */
    shareId?: string;
```

- [ ] **Step 6: Update the three identity call sites**

In `src/renderer/stats/hooks/useStatsUploads.ts`, add the import at the top of the
import block:

```typescript
import { shareIdentity } from '../../../main/shareIdentity';
```

Then replace line 290:

```typescript
                logIds: logs.map((l) => l.permalink).filter(Boolean),
```

with:

```typescript
                logIds: logs.map((l) => shareIdentity(l)).filter(Boolean),
```

In `src/renderer/stats/incrementalAggregation.ts`, add the same import, then replace
line 562:

```typescript
            const link = log?.permalink || log?.details?.permalink;
```

with:

```typescript
            const link = shareIdentity(log) || log?.details?.permalink;
```

Line 571 reads a fight-level permalink, which share links do not replace — leave it
exactly as it is:

```typescript
            const keyPermalink = typeof fight.permalink === 'string' ? fight.permalink.trim() : '';
```

- [ ] **Step 7: Verify nothing regressed**

Run: `npx vitest run src/renderer/__tests__/StatsView.integration.test.tsx src/renderer/stats/hooks/__tests__/useStatsUploads.byteIdentity.test.ts`
Expected: PASS. These are the two suites that exercise the changed call sites.

Run: `npm run typecheck && npm run lint`
Expected: both clean, zero warnings.

- [ ] **Step 8: Commit**

```bash
git add src/main/shareIdentity.ts src/main/__tests__/shareIdentity.test.ts src/renderer/global.d.ts src/renderer/stats/hooks/useStatsUploads.ts src/renderer/stats/incrementalAggregation.ts
git commit -m "feat(share): prefer share links over dps.report permalinks for log identity"
```

---

### Task 9: IPC surface

**Files:**
- Create: `src/main/handlers/shareHandlers.ts`
- Test: `src/main/__tests__/shareHandlers.test.ts`
- Modify: `src/preload/index.ts` (expose two methods)
- Modify: `src/main/index.ts` (register the handlers)

**Interfaces:**
- Consumes: `shareLog`, `ShareResult`, `ShareTarget` (Task 7); `planRetention`, `RetentionEntry`, `RetentionAction` (Task 6); the existing `resolveR2Uploader(store)` from `src/main/handlers/githubHandlers.ts`.
- Produces:
  - `interface ShareHandlerOptions { store: any; getDetails: (logId: string) => any; resolveTarget: (store: any) => ShareTarget | null }`
  - `registerShareHandlers(opts: ShareHandlerOptions): void`
  - IPC channels `share-log` and `share-plan-retention`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/shareHandlers.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (event: unknown, payload: any) => Promise<unknown>>();

vi.mock('electron', () => ({
    ipcMain: {
        handle: (channel: string, fn: (event: unknown, payload: any) => Promise<unknown>) => {
            handlers.set(channel, fn);
        }
    }
}));

const { registerShareHandlers } = await import('../handlers/shareHandlers');

const details = {
    fightName: 'Detonator',
    zone: 'Eternal Battlegrounds',
    durationMS: 182000,
    timeStart: 1758240000000,
    players: [{ name: 'A' }],
    targets: [{ name: 'E' }]
};

const invoke = (channel: string, payload: any) => handlers.get(channel)!(null, payload);

describe('share IPC handlers', () => {
    beforeEach(() => {
        handlers.clear();
        vi.restoreAllMocks();
    });

    it('rejects sharing a log with no details rather than uploading nothing', async () => {
        const resolveTarget = vi.fn().mockReturnValue({ putObject: vi.fn() });
        registerShareHandlers({ store: { get: () => 'gho_valid' }, getDetails: () => null, resolveTarget });
        const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; error: string };
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not parsed|no details/i);
    });

    it('reports when no storage target is configured', async () => {
        registerShareHandlers({
            store: { get: () => 'gho_valid' },
            getDetails: () => details,
            resolveTarget: () => null
        });
        const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; error: string };
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/R2|GitHub Pages|storage/i);
    });

    it('returns a share url on the happy path', async () => {
        const putObject = vi.fn().mockResolvedValue({ success: true, url: 'https://cdn.example.com/a.br' });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ code: 'k3Xm9qR2', url: 'https://bridge.axi.link/r/k3Xm9qR2' }), { status: 201 })
        ));
        registerShareHandlers({
            store: { get: (k: string) => (k === 'githubToken' ? 'gho_valid' : undefined) },
            getDetails: () => details,
            resolveTarget: () => ({ putObject })
        });
        const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; url: string };
        expect(result).toMatchObject({ success: true, url: 'https://bridge.axi.link/r/k3Xm9qR2' });
    });

    it('plans retention from the entries it is handed', async () => {
        registerShareHandlers({ store: { get: () => undefined }, getDetails: () => details, resolveTarget: () => null });
        const result = await invoke('share-plan-retention', {
            entries: [
                { id: 'a', bytes: 900, stage: 'full', seen: 1, pinned: false },
                { id: 'b', bytes: 200, stage: 'full', seen: 2, pinned: false }
            ],
            budgetBytes: 1000,
            highWaterPct: 0.8
        }) as { success: boolean; actions: Array<{ id: string }> };
        expect(result.success).toBe(true);
        expect(result.actions[0].id).toBe('a');
    });

    it('plans nothing for an empty repository', async () => {
        registerShareHandlers({ store: { get: () => undefined }, getDetails: () => details, resolveTarget: () => null });
        const result = await invoke('share-plan-retention', { entries: [] }) as { actions: unknown[] };
        expect(result.actions).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/shareHandlers.test.ts`
Expected: FAIL — cannot resolve `../handlers/shareHandlers`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/handlers/shareHandlers.ts`:

```typescript
import { ipcMain } from 'electron';
import { shareLog, type ShareResult, type ShareTarget } from '../shareService';
import { planRetention, type RetentionAction, type RetentionEntry } from '../shareRetention';

export interface ShareHandlerOptions {
    store: any;
    /** Parsed details for a log, or null if it has not been parsed. */
    getDetails: (logId: string) => any;
    /** Where Tier 1 bytes go — the user's R2, or null when nothing is configured. */
    resolveTarget: (store: any) => ShareTarget | null;
}

export function registerShareHandlers(opts: ShareHandlerOptions) {
    const { store, getDetails, resolveTarget } = opts;

    ipcMain.handle('share-log', async (_event, payload: { logId: string }): Promise<ShareResult> => {
        const logId = payload?.logId;
        if (!logId) return { success: false, error: 'No log specified.' };

        const details = getDetails(logId);
        if (!details) {
            return { success: false, error: 'That log has no details yet — parse it before sharing.' };
        }

        const target = resolveTarget(store);
        if (!target) {
            return {
                success: false,
                error: 'Sharing needs somewhere to put the report. Connect Cloudflare R2 or GitHub Pages in Settings.'
            };
        }

        return shareLog(details, logId, {
            target,
            githubToken: (store.get('githubToken') as string | undefined) ?? null
        });
    });

    ipcMain.handle('share-plan-retention', async (_event, payload: {
        entries?: RetentionEntry[];
        budgetBytes?: number;
        highWaterPct?: number;
    }): Promise<{ success: boolean; actions: RetentionAction[] }> => {
        const entries = Array.isArray(payload?.entries) ? payload.entries : [];
        const actions = planRetention(entries, {
            budgetBytes: payload?.budgetBytes,
            highWaterPct: payload?.highWaterPct
        });
        return { success: true, actions };
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/shareHandlers.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Expose the channels to the renderer**

In `src/preload/index.ts`, find the object passed to `contextBridge.exposeInMainWorld`
and add two methods alongside the existing ones, matching the surrounding style:

```typescript
    shareLog: (logId: string) => ipcRenderer.invoke('share-log', { logId }),
    sharePlanRetention: (payload: { entries: unknown[]; budgetBytes?: number; highWaterPct?: number }) =>
        ipcRenderer.invoke('share-plan-retention', payload),
```

In `src/renderer/global.d.ts`, add the matching declarations to the `electronAPI`
interface:

```typescript
    shareLog?: (logId: string) => Promise<{ success: boolean; code?: string; url?: string; error?: string }>;
    sharePlanRetention?: (payload: { entries: unknown[]; budgetBytes?: number; highWaterPct?: number }) =>
        Promise<{ success: boolean; actions: Array<{ id: string; from: string; to: string; reclaimed: number }> }>;
```

- [ ] **Step 6: Register the handlers at startup**

In `src/main/index.ts`, find where the other `register*Handlers(...)` calls happen
and add, importing `resolveR2Uploader` from `./handlers/githubHandlers`:

```typescript
    registerShareHandlers({
        store,
        getDetails: (logId: string) => getBulkLogDetails(logId),
        resolveTarget: (s: any) => resolveR2Uploader(s).uploader ?? null
    });
```

If the surrounding code names the details getter differently, use whatever the
existing bulk-details accessor in that file is called — the contract is
`(logId: string) => parsed details or null`.

- [ ] **Step 7: Verify the whole suite**

Run: `npx vitest run`
Expected: PASS — no pre-existing suite regressed.

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add src/main/handlers/shareHandlers.ts src/main/__tests__/shareHandlers.test.ts src/preload/index.ts src/renderer/global.d.ts src/main/index.ts
git commit -m "feat(share): IPC surface for creating share links and planning retention"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `bridge.axi.link/r/<code>`, 8 base62 chars | 1, 4 |
| Tier 0 pointer record in KV | 1, 4 |
| Tier 1 native axilog, brotli, user-hosted | 7 |
| Tier 2 raw `.zevtc`, opt-in | 1 (`raw` field), 4 (accepted on POST) — no UI in v1 |
| OG meta for Discord unfurls | 2, 4 |
| `lastSeen` stamping for real LRU | 4 |
| Budget-driven retention, demote never delete | 6 |
| Pinning exemption | 6 |
| Enforcement at publish time | 9 (`share-plan-retention`); wiring into the publish flow is follow-up |
| `POST /r` auth + rate limit | 3, 4 |
| Viewer reuses `dist-web/` | 2 (boot payload); actual viewer wiring is follow-up |
| `shareId` / `shareUrl` identity | 8 |
| Coexistence with dps.report | 8 (fallback), Global Constraints (no edits to `uploader.ts`) |

**Deliberately deferred to a follow-up plan** — each needs the Worker deployed and a
KV namespace to exist first, so neither can be tested offline:

1. Calling `share-plan-retention` from the GitHub publish flow and issuing the
   resulting `PATCH /r/:code` calls.
2. Teaching `dist-web/` to read the `#axibridge-share` boot payload and fetch Tier 1.

Both are noted here so they are not mistaken for oversights.

**Placeholder scan:** The only non-literal value is
`REPLACE_WITH_KV_NAMESPACE_ID` in `worker/wrangler.toml`, which is annotated
inline — the namespace does not exist until someone runs `wrangler kv namespace
create`. No TBDs, no "add error handling", every code step carries real code.

**Type consistency:** `ShareSummary` is defined identically in
`worker/src/pointer.ts` and `src/shared/shareSummary.ts`, with the duplication
justified in both files (separate deploy targets, no shared tsconfig).
`Stage` (Worker) and `RetentionStage` (client) carry the same three members and
are intentionally separate types for the same reason. `ShareTarget.putObject`
matches `R2Uploader.putObject` exactly, so the existing uploader satisfies it
structurally. `KVLike` is defined once in `worker/src/auth.ts` and imported by
Task 4.
