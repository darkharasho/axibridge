# Discord Report Post Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each report webhook a choice of three Discord post styles — a rich text embed (default), a generated banner plus text fields, or a single generated graphic — for the message posted after publishing a web report.

**Architecture:** A pure `buildReportCardModel` in `src/shared/` turns the sprawling `stats` blob into a small typed struct. `buildReportEmbed` renders that model to Discord embed JSON under hard field/character budgets. For the two graphic styles, `reportCardTemplate` produces HTML and `reportCardRenderer` captures it with a hidden `BrowserWindow`, returning `null` on any failure so the post always degrades to the text embed. `postReportToWebhooks` gains a multipart branch and keeps both existing self-heal retries.

**Tech Stack:** TypeScript, Electron 35 (main process), React (settings UI), vitest, Node global `FormData`/`Blob`.

**Spec:** `docs/superpowers/specs/2026-09-07-discord-report-post-styles-design.md`

## Global Constraints

- **No new runtime dependencies.** `sharp` stays a devDependency. Use Node's global `FormData` and `Blob` (available under Electron 35), not the `form-data` package — that stays with the axios code in `src/main/discord.ts`.
- **Discord limits:** 25 embed fields, 6000 characters total per embed, 5 forum tags per post.
- **Attachment filename is `report-card.png`**, referenced as `attachment://report-card.png`.
- **Default style is `'text'`.** Anything missing or unrecognized coerces to `'text'`.
- **The two self-heal retries in `postReportToWebhooks` must keep working on every path** — the `thread_name` 400 flip and the `applied_tags` 400 drop.
- **`renderReportCard` never throws.** It returns `Buffer` or `null`.
- **Run vitest with limited parallelism:** `npx vitest run <file> --maxWorkers=2`.
- **The nine leaderboards, in order:** `damage`, `healing`, `barrier`, `cleanses`, `strips`, `stability`, `ccAndInterrupts`, `downContrib`, `closestToTag`. No per-board toggles.
- **Validate before each commit** where TypeScript changed: `npm run typecheck`.

## Domain Notes (read before starting)

These are facts about the existing code that the tasks depend on. They were verified against the repo, not assumed.

**The stats object** (`src/renderer/stats/incrementalAggregation.ts:1790`) has these top-level fields the card uses:
`total`, `wins`, `losses`, `avgSquadSize`, `avgEnemies`, `squadKDR`, `enemyKDR`, `totalSquadKills`, `totalSquadDeaths`, `totalEnemyKills`, `totalEnemyDeaths`, `totalSquadDowns`, `totalEnemyDowns`, `leaderboards`, `mapData`, `fightBreakdown`.

`squadKDR` and `enemyKDR` are **already-formatted strings**, not numbers.

**A leaderboard entry** is `{ rank: number; account: string; profession: string; professionList?: string[]; value: number; count?: number }`. Entries are pre-sorted and pre-ranked with ties sharing a rank. `closestToTag` is sorted ascending (lower is better) and already filtered to finite values.

**`stability` maps to `s.stab`** — a summed stability-generation value, **not a percentage**. Format it as a compact number with no `%` sign.

**`closestToTag`** is an average distance in inches.

**`mapData`** is `{ name: string; value: number; color: string }[]`, sorted descending by `value`. Colors are already assigned (EBG `#ffffff`, red `#ef4444`, blue `#3b82f6`, green `#22c55e`, other `#64748b`).

**`fightBreakdown`** is an array of `{ id, shortLabel, fullLabel, mapName, timestamp, duration, isWin, ... }` sorted so `F1` is the earliest fight.

**`meta.guild`** is attached in main at `src/main/handlers/githubHandlers.ts:1767` as `{ id, name, tag }`; `name` and `tag` can each be `null` when guild resolution failed.

**Class icons** are PNGs at `img/class-icons/<Profession>.png` (47 files, base professions and elite specs). `process.env.VITE_PUBLIC` already points at `dist-react` when packaged and `public` in dev (`src/main/index.ts:250`), so `path.join(process.env.VITE_PUBLIC, 'img/class-icons')` resolves in both. Do **not** use `src/renderer/classIconUtils.ts` — it relies on Vite's `import.meta.glob` and is renderer-only.

**There is no settings normalizer for report webhooks.** `src/main/index.ts:1664` stores the array raw. That is why Task 1 exports a coercion helper used at each read site.

---

### Task 1: `ReportPostStyle` on the webhook type

**Files:**
- Modify: `src/shared/reportWebhooks.ts`
- Test: `src/shared/__tests__/reportWebhooks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type ReportPostStyle = 'text' | 'hybrid' | 'graphic'`; `const REPORT_POST_STYLES: readonly ReportPostStyle[]`; `const DEFAULT_REPORT_POST_STYLE: ReportPostStyle`; `function coerceReportPostStyle(raw: unknown): ReportPostStyle`; `IReportWebhook.style?: ReportPostStyle`.

- [ ] **Step 1: Write the failing test**

Append to `src/shared/__tests__/reportWebhooks.test.ts`:

```ts
import { coerceReportPostStyle, DEFAULT_REPORT_POST_STYLE, makeDefaultReportWebhook, REPORT_POST_STYLES } from '../reportWebhooks';

describe('report post style', () => {
    it('accepts the three known styles', () => {
        expect(coerceReportPostStyle('text')).toBe('text');
        expect(coerceReportPostStyle('hybrid')).toBe('hybrid');
        expect(coerceReportPostStyle('graphic')).toBe('graphic');
    });

    it('coerces anything unrecognized to text', () => {
        expect(coerceReportPostStyle(undefined)).toBe('text');
        expect(coerceReportPostStyle(null)).toBe('text');
        expect(coerceReportPostStyle('')).toBe('text');
        expect(coerceReportPostStyle('IMAGE')).toBe('text');
        expect(coerceReportPostStyle(7)).toBe('text');
        expect(coerceReportPostStyle({ style: 'hybrid' })).toBe('text');
    });

    it('defaults new webhooks to text', () => {
        expect(makeDefaultReportWebhook('x').style).toBe('text');
        expect(DEFAULT_REPORT_POST_STYLE).toBe('text');
        expect(REPORT_POST_STYLES).toEqual(['text', 'hybrid', 'graphic']);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: FAIL — `coerceReportPostStyle` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/shared/reportWebhooks.ts`, add above `IReportWebhook`:

```ts
export type ReportPostStyle = 'text' | 'hybrid' | 'graphic';

export const REPORT_POST_STYLES: readonly ReportPostStyle[] = ['text', 'hybrid', 'graphic'];

export const DEFAULT_REPORT_POST_STYLE: ReportPostStyle = 'text';

/** Webhooks persisted before this field existed have no `style`, and the store
 *  is written raw with no normalizer — so every read site coerces here. */
export const coerceReportPostStyle = (raw: unknown): ReportPostStyle =>
    raw === 'hybrid' || raw === 'graphic' ? raw : DEFAULT_REPORT_POST_STYLE;
```

Add to `IReportWebhook` (optional, so legacy persisted objects still type-check):

```ts
    style?: ReportPostStyle;
```

Add to the object returned by `makeDefaultReportWebhook`:

```ts
    style: DEFAULT_REPORT_POST_STYLE,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/shared/reportWebhooks.ts src/shared/__tests__/reportWebhooks.test.ts
git commit -m "feat(report-webhooks): add per-webhook post style with text default"
```

---

### Task 2: `buildReportCardModel`

**Files:**
- Create: `src/shared/reportCardModel.ts`
- Test: `src/shared/__tests__/reportCardModel.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the types and functions below. Tasks 3 and 5 both consume `ReportCardModel`.

```ts
export type CardValueFormat = 'compact' | 'int' | 'dist';

export interface CardLeader {
    rank: number;
    account: string;
    profession: string;
    value: string;   // pre-formatted for display
}

export interface CardBoard {
    key: string;
    label: string;
    leaders: CardLeader[];   // empty when the board has no entries
}

export interface CardMapSlice { name: string; value: number; color: string }

export interface CardFight { label: string; isWin: boolean }

export interface ReportCardModel {
    headline: string;         // e.g. "WvW Raid Report"
    guildTag: string;         // '' when unresolved
    guildName: string;        // '' when unresolved
    dateLabel: string;        // '' when meta has none
    fightCount: number;
    wins: number;
    losses: number;
    recordLabel: string;      // '8W – 4L'
    squad: { kills: number; downs: number; deaths: number; kdr: string };
    enemy: { kills: number; downs: number; deaths: number; kdr: string };
    size: { squad: number; enemy: number };
    maps: CardMapSlice[];
    fights: CardFight[];
    boards: CardBoard[];      // always 9 entries, in REPORT_CARD_BOARDS order
}

export const REPORT_CARD_BOARDS: ReadonlyArray<{ key: string; label: string; format: CardValueFormat }>;
export function formatCardValue(value: number, format: CardValueFormat): string;
export function buildReportCardModel(meta: any, stats: any, opts?: { topN?: number }): ReportCardModel;
```

- [ ] **Step 1: Write the failing test**

Create `src/shared/__tests__/reportCardModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildReportCardModel, formatCardValue, REPORT_CARD_BOARDS } from '../reportCardModel';

const lb = (...vals: Array<[string, string, number]>) =>
    vals.map(([account, profession, value], i) => ({ rank: i + 1, account, profession, value }));

const meta = {
    dateLabel: 'Saturday, September 7, 2026',
    guild: { id: 'G1', name: 'Axius Imperium', tag: 'AXI' },
};

const stats = {
    total: 12, wins: 8, losses: 4,
    avgSquadSize: 41.4, avgEnemies: 36.6,
    squadKDR: '2.31', enemyKDR: '0.43',
    totalSquadKills: 184, totalSquadDeaths: 79, totalSquadDowns: 231,
    totalEnemyKills: 79, totalEnemyDeaths: 184, totalEnemyDowns: 96,
    mapData: [
        { name: 'Eternal Battlegrounds', value: 5, color: '#ffffff' },
        { name: 'Red Desert Borderlands', value: 4, color: '#ef4444' },
    ],
    fightBreakdown: [
        { shortLabel: 'F1', isWin: true },
        { shortLabel: 'F2', isWin: false },
    ],
    leaderboards: {
        damage: lb(['Harasho.1234', 'Firebrand', 4_210_000], ['Nova.5678', 'Scourge', 3_880_000]),
        healing: lb(['Grove.1111', 'Druid', 2_020_000]),
        barrier: lb(['Dusk.2222', 'Scourge', 988_400]),
        cleanses: lb(['Rho.3333', 'Tempest', 1204]),
        strips: lb(['Void.4444', 'Spellbreaker', 612]),
        stability: lb(['Dusk.2222', 'Firebrand', 38_400]),
        ccAndInterrupts: lb(['Iron.5555', 'Herald', 418]),
        downContrib: lb(['Nova.5678', 'Scourge', 1_940_000]),
        closestToTag: lb(['Dusk.2222', 'Firebrand', 312.7]),
    },
};

describe('formatCardValue', () => {
    it('compacts large numbers', () => {
        expect(formatCardValue(4_210_000, 'compact')).toBe('4.21M');
        expect(formatCardValue(988_400, 'compact')).toBe('988k');
        expect(formatCardValue(612, 'compact')).toBe('612');
    });

    it('formats integers with separators', () => {
        expect(formatCardValue(1204, 'int')).toBe('1,204');
    });

    it('rounds distances', () => {
        expect(formatCardValue(312.7, 'dist')).toBe('313');
    });

    it('never emits NaN or Infinity', () => {
        expect(formatCardValue(Number.NaN, 'int')).toBe('—');
        expect(formatCardValue(Number.POSITIVE_INFINITY, 'dist')).toBe('—');
    });
});

describe('buildReportCardModel', () => {
    it('maps the session header', () => {
        const m = buildReportCardModel(meta, stats);
        expect(m.fightCount).toBe(12);
        expect(m.recordLabel).toBe('8W – 4L');
        expect(m.guildTag).toBe('AXI');
        expect(m.guildName).toBe('Axius Imperium');
        expect(m.dateLabel).toBe('Saturday, September 7, 2026');
    });

    it('maps both sides and rounds squad sizes', () => {
        const m = buildReportCardModel(meta, stats);
        expect(m.squad).toEqual({ kills: 184, downs: 231, deaths: 79, kdr: '2.31' });
        expect(m.enemy).toEqual({ kills: 79, downs: 96, deaths: 184, kdr: '0.43' });
        expect(m.size).toEqual({ squad: 41, enemy: 37 });
    });

    it('passes maps and fights through', () => {
        const m = buildReportCardModel(meta, stats);
        expect(m.maps).toHaveLength(2);
        expect(m.maps[0]).toEqual({ name: 'Eternal Battlegrounds', value: 5, color: '#ffffff' });
        expect(m.fights).toEqual([{ label: 'F1', isWin: true }, { label: 'F2', isWin: false }]);
    });

    it('emits all nine boards in order with formatted values', () => {
        const m = buildReportCardModel(meta, stats);
        expect(m.boards.map((b) => b.key)).toEqual(REPORT_CARD_BOARDS.map((b) => b.key));
        const damage = m.boards.find((b) => b.key === 'damage')!;
        expect(damage.leaders[0]).toEqual({ rank: 1, account: 'Harasho.1234', profession: 'Firebrand', value: '4.21M' });
        expect(m.boards.find((b) => b.key === 'stability')!.leaders[0].value).toBe('38.4k');
        expect(m.boards.find((b) => b.key === 'closestToTag')!.leaders[0].value).toBe('313');
    });

    it('honors topN', () => {
        const m = buildReportCardModel(meta, stats, { topN: 1 });
        expect(m.boards.find((b) => b.key === 'damage')!.leaders).toHaveLength(1);
    });

    it('survives a single-fight session', () => {
        const m = buildReportCardModel(meta, { ...stats, total: 1, wins: 1, losses: 0 });
        expect(m.fightCount).toBe(1);
        expect(m.recordLabel).toBe('1W – 0L');
    });

    it('survives empty and missing leaderboards', () => {
        const m = buildReportCardModel(meta, { ...stats, leaderboards: { damage: [] } });
        expect(m.boards).toHaveLength(9);
        expect(m.boards.every((b) => Array.isArray(b.leaders))).toBe(true);
        expect(m.boards.find((b) => b.key === 'healing')!.leaders).toEqual([]);
    });

    it('survives missing guild, maps, and fights', () => {
        const m = buildReportCardModel({}, { total: 3, wins: 2, losses: 1 });
        expect(m.guildTag).toBe('');
        expect(m.guildName).toBe('');
        expect(m.dateLabel).toBe('');
        expect(m.maps).toEqual([]);
        expect(m.fights).toEqual([]);
        expect(m.squad.kdr).toBe('—');
    });

    it('survives a null guild name and tag', () => {
        const m = buildReportCardModel({ guild: { id: 'G1', name: null, tag: null } }, stats);
        expect(m.guildTag).toBe('');
        expect(m.guildName).toBe('');
    });

    it('never throws on a completely empty stats object', () => {
        expect(() => buildReportCardModel({}, {})).not.toThrow();
        const m = buildReportCardModel({}, {});
        expect(m.fightCount).toBe(0);
        expect(m.boards).toHaveLength(9);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/reportCardModel.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../reportCardModel`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/reportCardModel.ts`:

```ts
/** The card's view of a published session. Built once from the raw `stats`
 *  blob and consumed by both the text embed and the PNG template, so the two
 *  cannot drift apart. Pure — no Electron, no Discord, no I/O. */

export type CardValueFormat = 'compact' | 'int' | 'dist';

export interface CardLeader {
    rank: number;
    account: string;
    profession: string;
    value: string;
}

export interface CardBoard {
    key: string;
    label: string;
    leaders: CardLeader[];
}

export interface CardMapSlice { name: string; value: number; color: string }

export interface CardFight { label: string; isWin: boolean }

export interface ReportCardModel {
    headline: string;
    guildTag: string;
    guildName: string;
    dateLabel: string;
    fightCount: number;
    wins: number;
    losses: number;
    recordLabel: string;
    squad: { kills: number; downs: number; deaths: number; kdr: string };
    enemy: { kills: number; downs: number; deaths: number; kdr: string };
    size: { squad: number; enemy: number };
    maps: CardMapSlice[];
    fights: CardFight[];
    boards: CardBoard[];
}

/** Fixed board set. `stability` is a summed stability-generation value, not a
 *  percentage — it formats as a compact number with no unit. `closestToTag` is
 *  an average distance in inches, already sorted ascending upstream. */
export const REPORT_CARD_BOARDS: ReadonlyArray<{ key: string; label: string; format: CardValueFormat }> = [
    { key: 'damage', label: 'Damage', format: 'compact' },
    { key: 'healing', label: 'Healing', format: 'compact' },
    { key: 'barrier', label: 'Barrier', format: 'compact' },
    { key: 'cleanses', label: 'Cleanses', format: 'int' },
    { key: 'strips', label: 'Strips', format: 'int' },
    { key: 'stability', label: 'Stability', format: 'compact' },
    { key: 'ccAndInterrupts', label: 'CC + Interrupts', format: 'int' },
    { key: 'downContrib', label: 'Down Contribution', format: 'compact' },
    { key: 'closestToTag', label: 'Closest to Tag', format: 'dist' },
];

const DEFAULT_TOP_N = 3;

export function formatCardValue(value: number, format: CardValueFormat): string {
    if (!Number.isFinite(value)) return '—';
    if (format === 'dist') return String(Math.round(value));
    if (format === 'int') return Math.round(value).toLocaleString('en-US');
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) {
        const k = value / 1_000;
        // 988.4k reads as noise at card size; 38.4k does not.
        return `${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}k`;
    }
    return String(Math.round(value));
}

const num = (raw: unknown): number => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
};

const str = (raw: unknown): string => (raw === null || raw === undefined ? '' : String(raw));

/** KDR arrives pre-formatted as a string; an absent one is a dash, not "0". */
const kdr = (raw: unknown): string => {
    const s = str(raw).trim();
    return s.length > 0 ? s : '—';
};

export function buildReportCardModel(meta: any, stats: any, opts?: { topN?: number }): ReportCardModel {
    const topN = Math.max(1, opts?.topN ?? DEFAULT_TOP_N);
    const leaderboards = (stats?.leaderboards ?? {}) as Record<string, any>;

    const boards: CardBoard[] = REPORT_CARD_BOARDS.map(({ key, label, format }) => {
        const raw = Array.isArray(leaderboards[key]) ? leaderboards[key] : [];
        const leaders = raw.slice(0, topN).map((entry: any, index: number) => ({
            rank: num(entry?.rank) || index + 1,
            account: str(entry?.account),
            profession: str(entry?.profession),
            value: formatCardValue(Number(entry?.value), format),
        }));
        return { key, label, leaders };
    });

    const maps: CardMapSlice[] = (Array.isArray(stats?.mapData) ? stats.mapData : []).map((slice: any) => ({
        name: str(slice?.name),
        value: num(slice?.value),
        color: str(slice?.color) || '#64748b',
    }));

    const fights: CardFight[] = (Array.isArray(stats?.fightBreakdown) ? stats.fightBreakdown : []).map(
        (fight: any, index: number) => ({
            label: str(fight?.shortLabel) || `F${index + 1}`,
            isWin: Boolean(fight?.isWin),
        })
    );

    const wins = num(stats?.wins);
    const losses = num(stats?.losses);

    return {
        headline: 'WvW Raid Report',
        guildTag: str(meta?.guild?.tag),
        guildName: str(meta?.guild?.name),
        dateLabel: str(meta?.dateLabel),
        fightCount: num(stats?.total),
        wins,
        losses,
        recordLabel: `${wins}W – ${losses}L`,
        squad: {
            kills: num(stats?.totalSquadKills),
            downs: num(stats?.totalSquadDowns),
            deaths: num(stats?.totalSquadDeaths),
            kdr: kdr(stats?.squadKDR),
        },
        enemy: {
            kills: num(stats?.totalEnemyKills),
            downs: num(stats?.totalEnemyDowns),
            deaths: num(stats?.totalEnemyDeaths),
            kdr: kdr(stats?.enemyKDR),
        },
        size: {
            squad: Math.round(num(stats?.avgSquadSize)),
            enemy: Math.round(num(stats?.avgEnemies)),
        },
        maps,
        fights,
        boards,
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/__tests__/reportCardModel.test.ts --maxWorkers=2`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/shared/reportCardModel.ts src/shared/__tests__/reportCardModel.test.ts
git commit -m "feat(report-card): add pure ReportCardModel builder"
```

---

### Task 3: `buildReportEmbed` and the rich text post

**Files:**
- Create: `src/main/reportEmbed.ts`
- Create: `src/main/__tests__/reportEmbed.test.ts`
- Modify: `src/main/reportWebhooks.ts`
- Modify: `src/main/__tests__/reportWebhooks.test.ts`

This task makes the default `text` style actually ship — the post gets rich immediately, before any image work exists.

**Interfaces:**
- Consumes: `ReportCardModel`, `buildReportCardModel` (Task 2); `ReportPostStyle`, `coerceReportPostStyle` (Task 1).
- Produces:

```ts
export const REPORT_CARD_FILENAME = 'report-card.png';
export const DISCORD_EMBED_FIELD_LIMIT = 25;
export const DISCORD_EMBED_CHAR_LIMIT = 6000;
export interface DiscordEmbedField { name: string; value: string; inline?: boolean }
export interface DiscordEmbed {
    title: string; url: string; color: number;
    description?: string;
    fields?: DiscordEmbedField[];
    footer?: { text: string };
    image?: { url: string };
}
export function buildReportEmbed(args: {
    model: ReportCardModel; style: ReportPostStyle; title: string; url: string; hasImage: boolean;
}): DiscordEmbed;
```

`postReportToWebhooks` gains an optional `topN` — no. It gains nothing yet beyond calling `buildReportEmbed`. Its exported signature is unchanged in this task.

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/reportEmbed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildReportEmbed, DISCORD_EMBED_CHAR_LIMIT, DISCORD_EMBED_FIELD_LIMIT, REPORT_CARD_FILENAME } from '../reportEmbed';
import { buildReportCardModel } from '../../shared/reportCardModel';

const lb = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({ rank: i + 1, account: `${prefix}${i}.1234`, profession: 'Firebrand', value: 1000 - i }));

const stats = {
    total: 12, wins: 8, losses: 4,
    avgSquadSize: 41, avgEnemies: 37,
    squadKDR: '2.31', enemyKDR: '0.43',
    totalSquadKills: 184, totalSquadDeaths: 79, totalSquadDowns: 231,
    totalEnemyKills: 79, totalEnemyDeaths: 184, totalEnemyDowns: 96,
    mapData: [{ name: 'Eternal Battlegrounds', value: 5, color: '#ffffff' }],
    fightBreakdown: [{ shortLabel: 'F1', isWin: true }],
    leaderboards: {
        damage: lb(5, 'a'), healing: lb(5, 'b'), barrier: lb(5, 'c'),
        cleanses: lb(5, 'd'), strips: lb(5, 'e'), stability: lb(5, 'f'),
        ccAndInterrupts: lb(5, 'g'), downContrib: lb(5, 'h'), closestToTag: lb(5, 'i'),
    },
};

const meta = { dateLabel: 'Saturday, September 7, 2026', guild: { id: 'G', name: 'Axius', tag: 'AXI' } };
const model = buildReportCardModel(meta, stats);

const charCount = (embed: any) =>
    String(embed.title ?? '').length +
    String(embed.description ?? '').length +
    String(embed.footer?.text ?? '').length +
    (embed.fields ?? []).reduce((sum: number, f: any) => sum + f.name.length + f.value.length, 0);

describe('buildReportEmbed', () => {
    it('builds a rich text embed with KPI and board fields', () => {
        const embed = buildReportEmbed({ model, style: 'text', title: 'T', url: 'https://r/1', hasImage: false });
        expect(embed.title).toBe('T');
        expect(embed.url).toBe('https://r/1');
        expect(embed.description).toContain('12 fights');
        expect(embed.description).toContain('8W – 4L');
        expect(embed.footer?.text).toBe('Saturday, September 7, 2026');
        const names = embed.fields!.map((f) => f.name);
        expect(names.some((n) => n.includes('Squad'))).toBe(true);
        expect(names.some((n) => n.includes('Enemy'))).toBe(true);
        expect(names.some((n) => n.includes('Damage'))).toBe(true);
        expect(embed.image).toBeUndefined();
    });

    it('omits boards with no entries instead of emitting empty fields', () => {
        const sparse = buildReportCardModel(meta, { ...stats, leaderboards: { damage: lb(2, 'a') } });
        const embed = buildReportEmbed({ model: sparse, style: 'text', title: 'T', url: 'u', hasImage: false });
        const names = embed.fields!.map((f) => f.name);
        expect(names.some((n) => n.includes('Damage'))).toBe(true);
        expect(names.some((n) => n.includes('Healing'))).toBe(false);
        expect(embed.fields!.every((f) => f.value.trim().length > 0)).toBe(true);
    });

    it('attaches the image and keeps fields for hybrid', () => {
        const embed = buildReportEmbed({ model, style: 'hybrid', title: 'T', url: 'u', hasImage: true });
        expect(embed.image).toEqual({ url: `attachment://${REPORT_CARD_FILENAME}` });
        expect(embed.fields!.length).toBeGreaterThan(0);
    });

    it('drops fields entirely for graphic', () => {
        const embed = buildReportEmbed({ model, style: 'graphic', title: 'T', url: 'u', hasImage: true });
        expect(embed.image).toEqual({ url: `attachment://${REPORT_CARD_FILENAME}` });
        expect(embed.fields ?? []).toHaveLength(0);
    });

    it('falls back to the text layout when a graphic style has no image', () => {
        const embed = buildReportEmbed({ model, style: 'graphic', title: 'T', url: 'u', hasImage: false });
        expect(embed.image).toBeUndefined();
        expect(embed.fields!.length).toBeGreaterThan(0);
    });

    it('stays inside Discord limits on a hostile model', () => {
        const huge = {
            ...stats,
            leaderboards: Object.fromEntries(
                Object.keys(stats.leaderboards).map((k) => [k, lb(50, 'X'.repeat(28))])
            ),
        };
        const hostile = buildReportCardModel(meta, huge, { topN: 10 });
        const embed = buildReportEmbed({ model: hostile, style: 'text', title: 'X'.repeat(200), url: 'u', hasImage: false });
        expect(embed.fields!.length).toBeLessThanOrEqual(DISCORD_EMBED_FIELD_LIMIT);
        expect(charCount(embed)).toBeLessThanOrEqual(DISCORD_EMBED_CHAR_LIMIT);
        expect(embed.fields!.length).toBeGreaterThan(0);
    });

    it('never emits a field longer than 1024 characters', () => {
        const wide = buildReportCardModel(meta, {
            ...stats,
            leaderboards: { damage: lb(40, 'Y'.repeat(30)) },
        }, { topN: 40 });
        const embed = buildReportEmbed({ model: wide, style: 'text', title: 'T', url: 'u', hasImage: false });
        expect(embed.fields!.every((f) => f.value.length <= 1024)).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/reportEmbed.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../reportEmbed`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/reportEmbed.ts`:

```ts
import type { ReportCardModel } from '../shared/reportCardModel';
import type { ReportPostStyle } from '../shared/reportWebhooks';

export const REPORT_CARD_FILENAME = 'report-card.png';

export const DISCORD_EMBED_FIELD_LIMIT = 25;
export const DISCORD_EMBED_CHAR_LIMIT = 6000;
const DISCORD_FIELD_VALUE_LIMIT = 1024;
/** Headroom under the hard cap so a long title or footer can never tip us over. */
const CHAR_BUDGET = 5500;

export interface DiscordEmbedField { name: string; value: string; inline?: boolean }

export interface DiscordEmbed {
    title: string;
    url: string;
    color: number;
    description?: string;
    fields?: DiscordEmbedField[];
    footer?: { text: string };
    image?: { url: string };
}

const EMBED_COLOR = 0xef4444;

const fieldCost = (field: DiscordEmbedField) => field.name.length + field.value.length;

const clampValue = (value: string) =>
    value.length <= DISCORD_FIELD_VALUE_LIMIT ? value : `${value.slice(0, DISCORD_FIELD_VALUE_LIMIT - 1)}…`;

const kpiFields = (model: ReportCardModel): DiscordEmbedField[] => [
    {
        name: '⚔️ Squad',
        value: `${model.squad.kills.toLocaleString('en-US')} kills · ${model.squad.downs.toLocaleString('en-US')} downs\n${model.squad.deaths.toLocaleString('en-US')} deaths\nKDR **${model.squad.kdr}**`,
        inline: true,
    },
    {
        name: '🛡️ Enemy',
        value: `${model.enemy.kills.toLocaleString('en-US')} kills · ${model.enemy.downs.toLocaleString('en-US')} downs\n${model.enemy.deaths.toLocaleString('en-US')} deaths\nKDR **${model.enemy.kdr}**`,
        inline: true,
    },
    {
        name: '👥 Size',
        value: `Squad avg **${model.size.squad}**\nEnemy avg **${model.size.enemy}**`,
        inline: true,
    },
];

const mapField = (model: ReportCardModel): DiscordEmbedField[] => {
    if (model.maps.length === 0) return [];
    const value = model.maps.map((slice) => `${slice.name} ${slice.value}`).join(' · ');
    return [{ name: '🗺️ Maps', value: clampValue(value), inline: false }];
};

const boardFields = (model: ReportCardModel): DiscordEmbedField[] =>
    model.boards
        .filter((board) => board.leaders.length > 0)
        .map((board) => ({
            name: board.label,
            value: clampValue(
                board.leaders.map((leader) => `${leader.rank}. ${leader.account} — ${leader.value}`).join('\n')
            ),
            inline: true,
        }));

/** Truncation is deterministic: KPI and map fields are kept, then boards are
 *  appended while both the field count and the character budget allow. Boards
 *  drop from the tail of REPORT_CARD_BOARDS order, so the same model always
 *  produces the same embed. */
const fitFields = (
    required: DiscordEmbedField[],
    optional: DiscordEmbedField[],
    fixedChars: number
): DiscordEmbedField[] => {
    const out: DiscordEmbedField[] = [];
    let chars = fixedChars;
    for (const field of required) {
        if (out.length >= DISCORD_EMBED_FIELD_LIMIT) break;
        if (chars + fieldCost(field) > CHAR_BUDGET) break;
        out.push(field);
        chars += fieldCost(field);
    }
    for (const field of optional) {
        if (out.length >= DISCORD_EMBED_FIELD_LIMIT) break;
        if (chars + fieldCost(field) > CHAR_BUDGET) continue;
        out.push(field);
        chars += fieldCost(field);
    }
    return out;
};

export function buildReportEmbed(args: {
    model: ReportCardModel;
    style: ReportPostStyle;
    title: string;
    url: string;
    hasImage: boolean;
}): DiscordEmbed {
    const { model, title, url, hasImage } = args;
    // A graphic style with no rendered card degrades to the text layout, which
    // is the whole fallback contract: a failed capture never costs the link.
    const style = args.style !== 'text' && !hasImage ? 'text' : args.style;

    const description = [
        model.fightCount > 0 ? `**${model.fightCount} fight${model.fightCount === 1 ? '' : 's'}**` : '',
        model.recordLabel,
    ]
        .filter(Boolean)
        .join(' · ');

    const embed: DiscordEmbed = { title, url, color: EMBED_COLOR };
    if (description) embed.description = description;
    if (model.dateLabel) embed.footer = { text: model.dateLabel };
    if (style !== 'text') embed.image = { url: `attachment://${REPORT_CARD_FILENAME}` };

    if (style === 'graphic') {
        embed.fields = [];
        return embed;
    }

    const fixedChars = title.length + description.length + model.dateLabel.length;
    embed.fields = fitFields([...kpiFields(model), ...mapField(model)], boardFields(model), fixedChars);
    return embed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/reportEmbed.test.ts --maxWorkers=2`
Expected: PASS

- [ ] **Step 5: Wire it into `postReportToWebhooks`**

In `src/main/reportWebhooks.ts`, add imports:

```ts
import { buildReportCardModel } from '../shared/reportCardModel';
import { buildReportEmbed } from './reportEmbed';
import { coerceReportPostStyle } from '../shared/reportWebhooks';
```

Replace the `const description = buildReportSummaryLine(opts.stats);` line with:

```ts
    const model = buildReportCardModel(opts.meta, opts.stats);
```

Replace the embed construction inside the `try` block:

```ts
            title = renderReportTitle(hook.titleTemplate, ctx);
            embed = {
                title,
                url: opts.url,
                color: EMBED_COLOR,
            };
            if (description) embed.description = description;
            if (opts.meta?.dateLabel) embed.footer = { text: String(opts.meta.dateLabel) };
```

with:

```ts
            title = renderReportTitle(hook.titleTemplate, ctx);
            embed = buildReportEmbed({
                model,
                style: coerceReportPostStyle(hook.style),
                title,
                url: opts.url,
                hasImage: false,
            });
```

Delete the now-unused `EMBED_COLOR` constant from `reportWebhooks.ts` (it lives in `reportEmbed.ts` now). Keep `buildReportSummaryLine` exported — it still has its own tests and is cheap to retain.

- [ ] **Step 6: Update the existing webhook test expectations**

In `src/main/__tests__/reportWebhooks.test.ts`, the first test asserts the old one-line description. Replace that single assertion:

```ts
        expect(body.embeds[0].description).toBe('19 fights • 16W – 3L • Squad KDR 5.56');
```

with:

```ts
        expect(body.embeds[0].description).toBe('**19 fights** · 16W – 3L');
        expect(Array.isArray(body.embeds[0].fields)).toBe(true);
```

- [ ] **Step 7: Run the full main test suite**

Run: `npx vitest run src/main/__tests__/reportWebhooks.test.ts src/main/__tests__/reportEmbed.test.ts --maxWorkers=2`
Expected: PASS — all self-heal, forum, and tag tests still green.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck
git add src/main/reportEmbed.ts src/main/__tests__/reportEmbed.test.ts src/main/reportWebhooks.ts src/main/__tests__/reportWebhooks.test.ts
git commit -m "feat(report-post): build a rich text embed from the card model"
```

---

### Task 4: Multipart attachment path

**Files:**
- Modify: `src/main/reportWebhooks.ts`
- Modify: `src/main/__tests__/reportWebhooks.test.ts`

**Interfaces:**
- Consumes: `buildReportEmbed`, `REPORT_CARD_FILENAME` (Task 3).
- Produces: `postReportToWebhooks` accepts two new optional options:

```ts
    /** Rendered card keyed by style. A missing or null entry means the hook's
     *  style degrades to text for that post. */
    images?: Partial<Record<ReportPostStyle, Buffer | null>>;
```

- [ ] **Step 1: Write the failing test**

Append to `src/main/__tests__/reportWebhooks.test.ts`:

```ts
import { REPORT_CARD_FILENAME } from '../reportEmbed';

const readFormBody = async (call: any[]) => {
    const form = (call[1] as RequestInit).body as FormData;
    const payload = JSON.parse(form.get('payload_json') as string);
    const file = form.get('files[0]') as Blob & { name?: string };
    return { form, payload, file };
};

const png = () => Buffer.from('fake-png-bytes');

// TAG_A in the existing suite is scoped to its own describe block, so the
// multipart suite declares its own.
const IMG_TAG = '111111111111111111';

describe('postReportToWebhooks with an image', () => {
    it('posts multipart with payload_json and the card file', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        await postReportToWebhooks({
            webhooks: [hook({ style: 'graphic' })],
            meta, stats, url: 'u', fetchImpl,
            images: { graphic: png() },
        });
        const call = fetchImpl.mock.calls[0] as any[];
        expect((call[1] as RequestInit).headers).toBeUndefined();
        const { payload, file } = await readFormBody(call);
        expect(payload.username).toBe('AxiBridge');
        expect(payload.embeds[0].image.url).toBe(`attachment://${REPORT_CARD_FILENAME}`);
        expect(file).toBeInstanceOf(Blob);
        expect((file as any).name ?? REPORT_CARD_FILENAME).toBe(REPORT_CARD_FILENAME);
    });

    it('puts thread_name and applied_tags inside payload_json for forums', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        await postReportToWebhooks({
            webhooks: [hook({ style: 'hybrid', isForum: true, forumTagIds: IMG_TAG })],
            meta, stats, url: 'u', fetchImpl,
            images: { hybrid: png() },
        });
        const { form, payload } = await readFormBody(fetchImpl.mock.calls[0] as any[]);
        expect(payload.thread_name).toBe('Axi Vale');
        expect(payload.applied_tags).toEqual([IMG_TAG]);
        expect(form.get('thread_name')).toBeNull();
    });

    it('self-heals the forum flag on the multipart path with a fresh body each attempt', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, '{"message": "Webhooks posted to forum channels must have a thread_name or thread_id"}'))
            .mockResolvedValueOnce(okResponse);
        const persistForumFlag = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook({ style: 'graphic', isForum: false })],
            meta, stats, url: 'u', fetchImpl, persistForumFlag,
            images: { graphic: png() },
        });
        expect(results[0].ok).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const first = (fetchImpl.mock.calls[0] as any[])[1].body;
        const second = (fetchImpl.mock.calls[1] as any[])[1].body;
        expect(first).not.toBe(second);
        const { payload } = await readFormBody(fetchImpl.mock.calls[1] as any[]);
        expect(payload.thread_name).toBe('Axi Vale');
        expect(persistForumFlag).toHaveBeenCalledWith('h1', true);
    });

    it('drops applied_tags on a tag 400 over multipart', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, '{"applied_tags": ["Unknown tag"]}'))
            .mockResolvedValueOnce(okResponse);
        const results = await postReportToWebhooks({
            webhooks: [hook({ style: 'graphic', isForum: true, forumTagIds: IMG_TAG })],
            meta, stats, url: 'u', fetchImpl,
            images: { graphic: png() },
        });
        expect(results[0].ok).toBe(true);
        const { payload } = await readFormBody(fetchImpl.mock.calls[1] as any[]);
        expect(payload.applied_tags).toBeUndefined();
    });

    it('falls back to a JSON text post when the card is missing', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        await postReportToWebhooks({
            webhooks: [hook({ style: 'graphic' })],
            meta, stats, url: 'u', fetchImpl,
            images: { graphic: null },
        });
        const call = fetchImpl.mock.calls[0] as any[];
        expect((call[1] as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
        const body = JSON.parse((call[1] as RequestInit).body as string);
        expect(body.embeds[0].image).toBeUndefined();
        expect(body.embeds[0].fields.length).toBeGreaterThan(0);
    });

    it('falls back to text when the card exceeds the attachment ceiling', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        await postReportToWebhooks({
            webhooks: [hook({ style: 'graphic' })],
            meta, stats, url: 'u', fetchImpl,
            images: { graphic: Buffer.alloc(9 * 1024 * 1024) },
        });
        const call = fetchImpl.mock.calls[0] as any[];
        expect((call[1] as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('ignores an image when the hook style is text', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        await postReportToWebhooks({
            webhooks: [hook({ style: 'text' })],
            meta, stats, url: 'u', fetchImpl,
            images: { hybrid: png(), graphic: png() },
        });
        const call = fetchImpl.mock.calls[0] as any[];
        expect((call[1] as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: FAIL — `images` is not an accepted option and every multipart assertion fails.

- [ ] **Step 3: Write minimal implementation**

In `src/main/reportWebhooks.ts`, add to the imports:

```ts
import { coerceReportPostStyle, type ReportPostStyle } from '../shared/reportWebhooks';
import { buildReportEmbed, REPORT_CARD_FILENAME } from './reportEmbed';
```

Add constants near `POST_TIMEOUT_MS`:

```ts
const IMAGE_POST_TIMEOUT_MS = 30_000;
/** Conservative ceiling under Discord's attachment limit. An oversized card
 *  degrades to text before we send, rather than after a doomed upload. */
const MAX_CARD_BYTES = 7 * 1024 * 1024;
```

Add `images` to the options type:

```ts
    images?: Partial<Record<ReportPostStyle, Buffer | null>>;
```

Inside the per-hook loop, before `const post = ...`, resolve the effective image:

```ts
        const style = coerceReportPostStyle(hook.style);
        const candidate = style === 'text' ? null : (opts.images?.[style] ?? null);
        const image = candidate && candidate.byteLength > 0 && candidate.byteLength <= MAX_CARD_BYTES
            ? candidate
            : null;
```

Replace the body of `post` with a branch. The `payload` object is identical on both paths; only the transport differs:

```ts
        const post = async (withThreadName: boolean, withTags: boolean) => {
            const payload: any = {
                username: 'AxiBridge',
                avatar_url: DISCORD_WEBHOOK_AVATAR_URL,
                embeds: [embed],
            };
            if (withThreadName) {
                payload.thread_name = title.slice(0, 100);
                if (withTags && tagIds.length > 0) payload.applied_tags = tagIds;
            }
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), image ? IMAGE_POST_TIMEOUT_MS : POST_TIMEOUT_MS);
            try {
                // A fresh body per attempt: the self-heal retries call post()
                // again, and a FormData whose stream has already been consumed
                // would fail in a way that looks like a Discord error.
                const init: RequestInit = image
                    ? {
                        method: 'POST',
                        // No Content-Type — fetch must write the multipart boundary itself.
                        body: (() => {
                            const form = new FormData();
                            form.set('payload_json', JSON.stringify(payload));
                            form.set(
                                'files[0]',
                                new Blob([new Uint8Array(image)], { type: 'image/png' }),
                                REPORT_CARD_FILENAME
                            );
                            return form;
                        })(),
                        signal: controller.signal,
                    }
                    : {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: controller.signal,
                    };
                const resp = await doFetch(hook.url, init);
                const text = resp.ok ? '' : await resp.text().catch(() => '');
                return { ok: resp.ok, status: resp.status, text };
            } finally {
                clearTimeout(timer);
            }
        };
```

Update the embed construction to pass the resolved image state:

```ts
            embed = buildReportEmbed({
                model,
                style,
                title,
                url: opts.url,
                hasImage: image !== null,
            });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: PASS — including all pre-existing self-heal, forum, and tag tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/main/reportWebhooks.ts src/main/__tests__/reportWebhooks.test.ts
git commit -m "feat(report-post): post the card as a multipart attachment"
```

---

### Task 5: Card template and bundled font

**Files:**
- Create: `src/main/reportCardTemplate.ts`
- Create: `src/main/__tests__/reportCardTemplate.test.ts`
- Create: `public/fonts/InterVariable.woff2`

**Interfaces:**
- Consumes: `ReportCardModel` (Task 2).
- Produces:

```ts
export type ReportCardVariant = 'hybrid' | 'graphic';
export interface ReportCardAssets { fontDir: string; iconDir: string; glyphPath: string }
export const REPORT_CARD_SIZES: Record<ReportCardVariant, { width: number; height: number }>;
export function resolveReportCardAssets(publicDir: string): ReportCardAssets;
export function renderReportCardHtml(model: ReportCardModel, variant: ReportCardVariant, assets: ReportCardAssets): string;
```

`REPORT_CARD_SIZES` is `{ hybrid: { width: 1200, height: 500 }, graphic: { width: 1200, height: 900 } }`. Both are ~2× Discord's display width so the capture downsamples crisply. `height` is a starting box; Task 7 measures the real content height and resizes before capturing.

- [ ] **Step 1: Add the font file**

Download the latest Inter release zip from https://github.com/rsms/inter/releases and copy `web/InterVariable.woff2` out of it to `public/fonts/InterVariable.woff2`. One variable file covers every weight the card uses, so there are no static filenames to guess.

```bash
mkdir -p public/fonts
ls -l public/fonts/InterVariable.woff2
```

Expected: one file, roughly 300–400 KB.

Rationale to keep in the commit message: the app loads Inter from Google Fonts at runtime (`src/renderer/index.css:1`), and a capture that races a network font fetch — or silently falls back offline — produces a public artifact that cannot be re-rendered.

- [ ] **Step 2: Write the failing test**

Create `src/main/__tests__/reportCardTemplate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildReportCardModel } from '../../shared/reportCardModel';
import { renderReportCardHtml, REPORT_CARD_SIZES, resolveReportCardAssets } from '../reportCardTemplate';

const model = buildReportCardModel(
    { dateLabel: 'Saturday, September 7, 2026', guild: { id: 'G', name: 'Axius Imperium', tag: 'AXI' } },
    {
        total: 12, wins: 8, losses: 4,
        avgSquadSize: 41, avgEnemies: 37,
        squadKDR: '2.31', enemyKDR: '0.43',
        totalSquadKills: 184, totalSquadDeaths: 79, totalSquadDowns: 231,
        totalEnemyKills: 79, totalEnemyDeaths: 184, totalEnemyDowns: 96,
        mapData: [
            { name: 'Eternal Battlegrounds', value: 5, color: '#ffffff' },
            { name: 'Red Desert Borderlands', value: 4, color: '#ef4444' },
        ],
        fightBreakdown: [{ shortLabel: 'F1', isWin: true }, { shortLabel: 'F2', isWin: false }],
        leaderboards: {
            damage: [{ rank: 1, account: 'Harasho.1234', profession: 'Firebrand', value: 4_210_000 }],
            healing: [{ rank: 1, account: 'Grove.1111', profession: 'Druid', value: 2_020_000 }],
        },
    }
);

const assets = resolveReportCardAssets('/app/public');

describe('resolveReportCardAssets', () => {
    it('derives font, icon, and glyph paths from the public dir', () => {
        expect(assets.fontDir).toContain('fonts');
        expect(assets.iconDir).toContain('class-icons');
        expect(assets.glyphPath).toContain('AxiBridge-glyph.png');
    });
});

describe('renderReportCardHtml', () => {
    it('embeds the session numbers', () => {
        const html = renderReportCardHtml(model, 'hybrid', assets);
        expect(html).toContain('12');
        expect(html).toContain('8W – 4L');
        expect(html).toContain('2.31');
        expect(html).toContain('AXI');
    });

    it('declares local @font-face rules and no remote font fetch', () => {
        const html = renderReportCardHtml(model, 'hybrid', assets);
        expect(html).toContain('@font-face');
        expect(html).toContain('InterVariable.woff2');
        expect(html).not.toContain('fonts.googleapis.com');
        expect(html).not.toContain('http://');
    });

    it('draws one map segment per map with its color', () => {
        const html = renderReportCardHtml(model, 'hybrid', assets);
        expect(html).toContain('#ffffff');
        expect(html).toContain('#ef4444');
    });

    it('includes the fight sparkline and leaders only in the graphic variant', () => {
        const hybrid = renderReportCardHtml(model, 'hybrid', assets);
        const graphic = renderReportCardHtml(model, 'graphic', assets);
        expect(graphic).toContain('data-fight="F1"');
        expect(graphic).toContain('Harasho.1234');
        expect(hybrid).not.toContain('data-fight="F1"');
        expect(hybrid).not.toContain('Harasho.1234');
    });

    it('references class icons with object-fit contain', () => {
        const html = renderReportCardHtml(model, 'graphic', assets);
        expect(html).toContain('Firebrand.png');
        expect(html).toContain('object-fit: contain');
    });

    it('escapes account names so a crafted name cannot inject markup', () => {
        const evil = buildReportCardModel({}, {
            total: 1, wins: 1, losses: 0,
            leaderboards: { damage: [{ rank: 1, account: '<img src=x onerror=alert(1)>', profession: 'Firebrand', value: 1 }] },
        });
        const html = renderReportCardHtml(evil, 'graphic', assets);
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img src=x');
    });

    it('renders with empty maps, fights, and boards without throwing', () => {
        const empty = buildReportCardModel({}, {});
        expect(() => renderReportCardHtml(empty, 'graphic', assets)).not.toThrow();
        expect(() => renderReportCardHtml(empty, 'hybrid', assets)).not.toThrow();
    });

    it('exposes 2x sizes for both variants', () => {
        expect(REPORT_CARD_SIZES.hybrid.width).toBe(1200);
        expect(REPORT_CARD_SIZES.graphic.width).toBe(1200);
        expect(REPORT_CARD_SIZES.graphic.height).toBeGreaterThan(REPORT_CARD_SIZES.hybrid.height);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/reportCardTemplate.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../reportCardTemplate`.

- [ ] **Step 4: Write minimal implementation**

Create `src/main/reportCardTemplate.ts`:

```ts
import path from 'path';
import { pathToFileURL } from 'url';
import type { CardBoard, ReportCardModel } from '../shared/reportCardModel';

export type ReportCardVariant = 'hybrid' | 'graphic';

export interface ReportCardAssets {
    fontDir: string;
    iconDir: string;
    glyphPath: string;
}

/** Authored at ~2x Discord's embed image width so the capture downsamples
 *  crisply. `height` is a starting box; the renderer measures the real content
 *  height before capturing. */
export const REPORT_CARD_SIZES: Record<ReportCardVariant, { width: number; height: number }> = {
    hybrid: { width: 1200, height: 500 },
    graphic: { width: 1200, height: 900 },
};

export function resolveReportCardAssets(publicDir: string): ReportCardAssets {
    return {
        fontDir: path.join(publicDir, 'fonts'),
        iconDir: path.join(publicDir, 'img', 'class-icons'),
        glyphPath: path.join(publicDir, 'img', 'AxiBridge-glyph.png'),
    };
}

const fileUrl = (p: string) => pathToFileURL(p).href;

const esc = (raw: string): string =>
    String(raw)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const fontFace = (assets: ReportCardAssets) => `
@font-face {
  font-family: 'InterCard';
  font-weight: 100 900;
  font-display: block;
  src: url('${fileUrl(path.join(assets.fontDir, 'InterVariable.woff2'))}') format('woff2');
}`;

const mapBar = (model: ReportCardModel) => {
    const total = model.maps.reduce((sum, slice) => sum + slice.value, 0);
    if (total <= 0) return '';
    const segments = model.maps
        .map((slice) => `<span style="flex: ${slice.value}; background: ${esc(slice.color)}"></span>`)
        .join('');
    const legend = model.maps
        .map(
            (slice) =>
                `<span class="lg"><i style="background: ${esc(slice.color)}"></i>${esc(slice.name)} ${slice.value}</span>`
        )
        .join('');
    return `<div class="mapbar">${segments}</div><div class="legend">${legend}</div>`;
};

const kpi = (label: string, value: string) => `<div class="kpi"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;

const sparkline = (model: ReportCardModel) => {
    if (model.fights.length === 0) return '';
    const bars = model.fights
        .map(
            (fight) =>
                `<span data-fight="${esc(fight.label)}" class="${fight.isWin ? 'win' : 'loss'}">${esc(fight.label)}</span>`
        )
        .join('');
    return `<div class="spark">${bars}</div>`;
};

const leaderChips = (boards: CardBoard[], assets: ReportCardAssets) => {
    const chips = boards
        .filter((board) => board.leaders.length > 0)
        .slice(0, 6)
        .map((board) => {
            const leader = board.leaders[0];
            const icon = leader.profession
                ? `<img src="${fileUrl(path.join(assets.iconDir, `${leader.profession}.png`))}" alt="" onerror="this.replaceWith(document.createTextNode('${esc(leader.profession.slice(0, 2).toUpperCase())}'))">`
                : '';
            return `<div class="chip">${icon}<div><span class="cl">${esc(board.label)}</span><span class="cn">${esc(leader.account)}</span><span class="cv">${esc(leader.value)}</span></div></div>`;
        })
        .join('');
    return chips ? `<div class="chips"><div class="chipshdr">Session leaders</div><div class="chipgrid">${chips}</div></div>` : '';
};

export function renderReportCardHtml(
    model: ReportCardModel,
    variant: ReportCardVariant,
    assets: ReportCardAssets
): string {
    const size = REPORT_CARD_SIZES[variant];
    const tag = model.guildTag ? `<span class="tag">[${esc(model.guildTag)}]</span>` : '';

    const body = `
<div id="card" class="card ${variant}">
  <div class="hdr">
    <div class="id">${tag}<span class="hl">${esc(model.headline)}</span></div>
    <div class="date">${esc(model.dateLabel)}</div>
  </div>
  <div class="hero">
    <div class="fights"><b>${model.fightCount}</b><span>FIGHT${model.fightCount === 1 ? '' : 'S'}</span></div>
    <div class="record"><b>${esc(model.recordLabel)}</b><span>KDR ${esc(model.squad.kdr)}</span></div>
  </div>
  <div class="kpis">
    ${kpi('Kills', model.squad.kills.toLocaleString('en-US'))}
    ${kpi('Deaths', model.squad.deaths.toLocaleString('en-US'))}
    ${kpi('Avg Squad', String(model.size.squad))}
    ${kpi('Avg Enemy', String(model.size.enemy))}
  </div>
  ${variant === 'graphic'
        ? `<div class="kpis">
    ${kpi('Enemy Downs', model.enemy.downs.toLocaleString('en-US'))}
    ${kpi('Squad Downs', model.squad.downs.toLocaleString('en-US'))}
    ${kpi('Enemy Deaths', model.enemy.deaths.toLocaleString('en-US'))}
    ${kpi('Enemy KDR', model.enemy.kdr)}
  </div>`
        : ''}
  ${mapBar(model)}
  ${variant === 'graphic' ? sparkline(model) : ''}
  ${variant === 'graphic' ? leaderChips(model.boards, assets) : ''}
  <div class="foot"><img src="${fileUrl(assets.glyphPath)}" alt="">AxiBridge</div>
</div>`;

    return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace(assets)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#1a1b1e}
body{font-family:'InterCard',sans-serif;color:#dbdee1;width:${size.width}px}
.card{width:${size.width}px;padding:40px 48px;background:linear-gradient(150deg,#25262b,#1a1b1e);border-left:10px solid #ef4444}
.hdr{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:28px}
.tag{color:#ef4444;font-weight:700;margin-right:12px}
.hl{font-size:30px;font-weight:700;color:#f2f3f5}
.date{font-size:18px;color:#8d95a0}
.hero{display:flex;gap:56px;align-items:flex-end;margin-bottom:30px}
.fights b{font-size:88px;font-weight:700;color:#f2f3f5;line-height:.9}
.fights span{font-size:18px;letter-spacing:.14em;color:#8d95a0;margin-left:14px}
.record b{font-size:36px;font-weight:600;color:#f2f3f5;display:block}
.record span{font-size:18px;color:#8d95a0}
.kpis{display:flex;gap:16px;margin-bottom:22px}
.kpi{flex:1;background:#2b2d31;border-radius:8px;padding:16px 18px}
.kpi b{display:block;font-size:30px;font-weight:600;color:#f2f3f5}
.kpi span{font-size:15px;color:#8d95a0}
.mapbar{display:flex;height:14px;border-radius:7px;overflow:hidden;margin-bottom:12px}
.legend{display:flex;gap:22px;font-size:15px;color:#a3a6aa;margin-bottom:22px}
.lg i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:7px}
.spark{display:flex;gap:6px;margin-bottom:26px}
.spark span{flex:1;text-align:center;font-size:14px;padding:9px 0;border-radius:5px;color:#1a1b1e;font-weight:600}
.spark .win{background:#22c55e}
.spark .loss{background:#ef4444}
.chipshdr{font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#8d95a0;margin-bottom:14px}
.chipgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.chip{display:flex;gap:12px;align-items:center;background:#2b2d31;border-radius:8px;padding:14px 16px}
.chip img{width:34px;height:34px;object-fit: contain;flex:0 0 34px}
.cl{display:block;font-size:13px;color:#8d95a0}
.cn{display:block;font-size:17px;font-weight:600;color:#f2f3f5}
.cv{display:block;font-size:15px;color:#a3a6aa}
.foot{display:flex;align-items:center;gap:10px;margin-top:28px;font-size:15px;color:#8d95a0}
.foot img{width:24px;height:24px;object-fit: contain}
</style></head><body>${body}</body></html>`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/reportCardTemplate.test.ts --maxWorkers=2`
Expected: PASS

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/main/reportCardTemplate.ts src/main/__tests__/reportCardTemplate.test.ts public/fonts
git commit -m "feat(report-card): add card HTML template with bundled Inter"
```

---

### Task 6: `renderReportCard`

**Files:**
- Create: `src/main/reportCardRenderer.ts`

**Interfaces:**
- Consumes: `renderReportCardHtml`, `resolveReportCardAssets`, `REPORT_CARD_SIZES`, `ReportCardVariant` (Task 5); `ReportCardModel` (Task 2).
- Produces: `export async function renderReportCard(model: ReportCardModel, variant: ReportCardVariant): Promise<Buffer | null>`.

This task has no unit test — it needs a live Electron window. Its contract (never throws, returns `null` on failure) is what Tasks 4 and 7 are tested against, and Task 8 exercises it by hand.

- [ ] **Step 1: Write the implementation**

Create `src/main/reportCardRenderer.ts`:

```ts
import { BrowserWindow } from 'electron';
import {
    REPORT_CARD_SIZES,
    renderReportCardHtml,
    resolveReportCardAssets,
    type ReportCardVariant,
} from './reportCardTemplate';
import type { ReportCardModel } from '../shared/reportCardModel';

const RENDER_TIMEOUT_MS = 15_000;
/** A valid card is tens of KB. Anything smaller is a blank or half-painted
 *  frame, which some platform/compositor combinations return for hidden
 *  windows — we would rather post text than a grey rectangle. */
const MIN_CARD_BYTES = 4096;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Card render timed out')), ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });

/** Renders the session card offscreen. Never throws: a null result means the
 *  caller posts the text embed instead, so a broken card cannot cost someone
 *  their report link. */
export async function renderReportCard(
    model: ReportCardModel,
    variant: ReportCardVariant
): Promise<Buffer | null> {
    const size = REPORT_CARD_SIZES[variant];
    let win: BrowserWindow | null = null;
    try {
        const publicDir = process.env.VITE_PUBLIC || '';
        if (!publicDir) return null;
        const html = renderReportCardHtml(model, variant, resolveReportCardAssets(publicDir));

        win = new BrowserWindow({
            width: size.width,
            height: size.height,
            useContentSize: true,
            show: false,
            paintWhenInitiallyHidden: true,
            frame: false,
            backgroundColor: '#1a1b1e',
            webPreferences: { nodeIntegration: false, contextIsolation: true, offscreen: false },
        });

        const buffer = await withTimeout(
            (async (): Promise<Buffer | null> => {
                const target = win!;
                await target.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
                // One round-trip that waits for fonts and a painted frame, then
                // reports the real content height. Capturing before this
                // resolves yields unstyled or half-laid-out pixels.
                const height = await target.webContents.executeJavaScript(`
                    (async () => {
                        await document.fonts.ready;
                        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
                        return Math.ceil(document.getElementById('card').getBoundingClientRect().height);
                    })()
                `);
                const contentHeight = Number(height);
                if (Number.isFinite(contentHeight) && contentHeight > 0) {
                    target.setContentSize(size.width, contentHeight);
                    await target.webContents.executeJavaScript(
                        'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'
                    );
                }
                const image = await target.webContents.capturePage();
                if (image.isEmpty()) return null;
                const png = image.toPNG();
                return png.byteLength >= MIN_CARD_BYTES ? png : null;
            })(),
            RENDER_TIMEOUT_MS
        );

        return buffer;
    } catch (err) {
        console.error('[Main] Report card render failed:', err);
        return null;
    } finally {
        // destroy(), not close(): a headless window has no reliable close path.
        try { win?.destroy(); } catch { /* already gone */ }
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/reportCardRenderer.ts
git commit -m "feat(report-card): render the card offscreen with a hidden window"
```

---

### Task 7: Wire rendering into the publish flow

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts` (around line 2238–2260)
- Create: `src/main/reportCardRenderPlan.ts`
- Create: `src/main/__tests__/reportCardRenderPlan.test.ts`

The pure "which variants do I need" decision is extracted so it can be tested without Electron; the handler just executes it.

**Interfaces:**
- Consumes: `IReportWebhook`, `coerceReportPostStyle` (Task 1); `ReportCardVariant` (Task 5); `renderReportCard` (Task 6).
- Produces: `export function planReportCardVariants(webhooks: IReportWebhook[]): ReportCardVariant[]`.

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/reportCardRenderPlan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { planReportCardVariants } from '../reportCardRenderPlan';
import { makeDefaultReportWebhook } from '../../shared/reportWebhooks';

const h = (id: string, style?: any) => ({ ...makeDefaultReportWebhook(id), style });

describe('planReportCardVariants', () => {
    it('returns nothing when every hook is text', () => {
        expect(planReportCardVariants([h('a', 'text'), h('b')])).toEqual([]);
    });

    it('returns one entry per distinct style, not per webhook', () => {
        expect(planReportCardVariants([h('a', 'hybrid'), h('b', 'hybrid'), h('c', 'hybrid')])).toEqual(['hybrid']);
    });

    it('returns both variants when both are in use, in stable order', () => {
        expect(planReportCardVariants([h('a', 'graphic'), h('b', 'hybrid')])).toEqual(['hybrid', 'graphic']);
    });

    it('ignores unrecognized styles', () => {
        expect(planReportCardVariants([h('a', 'IMAGE'), h('b', 7 as any)])).toEqual([]);
    });

    it('handles an empty list', () => {
        expect(planReportCardVariants([])).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/reportCardRenderPlan.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../reportCardRenderPlan`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/reportCardRenderPlan.ts`:

```ts
import { coerceReportPostStyle, type IReportWebhook } from '../shared/reportWebhooks';
import type { ReportCardVariant } from './reportCardTemplate';

/** Which card variants a publish actually needs. Rendering is per distinct
 *  style, not per webhook — ten hooks on 'graphic' cost one capture. */
export function planReportCardVariants(webhooks: IReportWebhook[]): ReportCardVariant[] {
    const styles = new Set((webhooks || []).map((hook) => coerceReportPostStyle(hook?.style)));
    const variants: ReportCardVariant[] = [];
    if (styles.has('hybrid')) variants.push('hybrid');
    if (styles.has('graphic')) variants.push('graphic');
    return variants;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/reportCardRenderPlan.test.ts --maxWorkers=2`
Expected: PASS

- [ ] **Step 5: Wire it into the publish handler**

In `src/main/handlers/githubHandlers.ts`, add to the imports at the top:

```ts
import { buildReportCardModel } from '../../shared/reportCardModel';
import { planReportCardVariants } from '../reportCardRenderPlan';
import { renderReportCard } from '../reportCardRenderer';
import type { ReportCardVariant } from '../reportCardTemplate';
```

Inside the `if (reportWebhooks.length > 0) {` block, immediately before the `webhookResults = await postReportToWebhooks({` call, insert:

```ts
                const variants = planReportCardVariants(reportWebhooks);
                const images: Partial<Record<ReportCardVariant, Buffer | null>> = {};
                if (variants.length > 0) {
                    sendWebUploadStatus('Posting', 'Rendering report card...', 100);
                    const cardModel = buildReportCardModel(reportMeta, payload.stats);
                    for (const variant of variants) {
                        images[variant] = await renderReportCard(cardModel, variant);
                        if (!images[variant]) {
                            sendWebUploadStatus('Warning', `Report card (${variant}) could not be rendered — posting text instead.`, 100);
                        }
                    }
                }
```

Then add `images,` to the `postReportToWebhooks({ ... })` argument object.

- [ ] **Step 6: Verify the whole suite is green**

```bash
npm run typecheck
npx vitest run src/main src/shared --maxWorkers=2
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/reportCardRenderPlan.ts src/main/__tests__/reportCardRenderPlan.test.ts src/main/handlers/githubHandlers.ts
git commit -m "feat(report-post): render card variants once per publish"
```

---

### Task 8: Style picker in settings

**Files:**
- Modify: `src/renderer/ReportWebhooksCard.tsx`
- Modify: `src/renderer/__tests__/ReportWebhooksCard.test.tsx`

**Interfaces:**
- Consumes: `ReportPostStyle`, `REPORT_POST_STYLES`, `coerceReportPostStyle` (Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/__tests__/ReportWebhooksCard.test.tsx` (matching the file's existing import and render helpers):

```tsx
describe('post style picker', () => {
    it('shows the three styles and defaults a legacy hook to text', () => {
        const legacy = { ...makeDefaultReportWebhook('h1'), url: 'https://discord.com/api/webhooks/1/a' } as any;
        delete legacy.style;
        render(<ReportWebhooksCard reportWebhooks={[legacy]} onChange={() => {}} />);
        const picker = screen.getByLabelText('Post style') as HTMLSelectElement;
        expect(picker.value).toBe('text');
        expect(Array.from(picker.options).map((o) => o.value)).toEqual(['text', 'hybrid', 'graphic']);
    });

    it('emits the chosen style', () => {
        const onChange = vi.fn();
        const hook = { ...makeDefaultReportWebhook('h1'), url: 'https://discord.com/api/webhooks/1/a' };
        render(<ReportWebhooksCard reportWebhooks={[hook]} onChange={onChange} />);
        fireEvent.change(screen.getByLabelText('Post style'), { target: { value: 'graphic' } });
        expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'h1', style: 'graphic' })]);
    });

    it('describes the selected style', () => {
        const hook = { ...makeDefaultReportWebhook('h1'), style: 'hybrid' as const, url: 'https://discord.com/api/webhooks/1/a' };
        render(<ReportWebhooksCard reportWebhooks={[hook]} onChange={() => {}} />);
        expect(screen.getByText(/banner image/i)).toBeInTheDocument();
    });
});
```

If `makeDefaultReportWebhook`, `fireEvent`, or `vi` are not already imported in that test file, add them.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/ReportWebhooksCard.test.tsx --maxWorkers=2`
Expected: FAIL — no element labelled "Post style".

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/ReportWebhooksCard.tsx`, extend the import from `../shared/reportWebhooks`:

```ts
import {
    coerceReportPostStyle,
    IReportWebhook,
    MAX_FORUM_POST_TAGS,
    makeDefaultReportWebhook,
    parseForumTagIds,
    renderReportTitle,
    type ReportPostStyle,
} from '../shared/reportWebhooks';
```

Add above the component:

```tsx
const STYLE_OPTIONS: Array<{ value: ReportPostStyle; label: string; hint: string }> = [
    { value: 'text', label: 'Text', hint: 'Session stats and leaderboards as embed fields. No image.' },
    { value: 'hybrid', label: 'Banner + stats', hint: 'A generated banner image plus the leaderboards as text.' },
    { value: 'graphic', label: 'Full graphic', hint: 'One generated image carries the whole session.' },
];
```

Inside the per-hook block, after the title-template preview paragraph and before the `{hook.isForum && (` block, insert:

```tsx
                            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                <span className="shrink-0">Post style</span>
                                <select
                                    aria-label="Post style"
                                    value={coerceReportPostStyle(hook.style)}
                                    onChange={(e) => patch(hook.id, { style: e.target.value as ReportPostStyle })}
                                    className="rounded-[4px] border px-2 py-1.5 text-xs bg-transparent focus:outline-none"
                                    style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                                >
                                    {STYLE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                {STYLE_OPTIONS.find((o) => o.value === coerceReportPostStyle(hook.style))!.hint}
                            </p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/ReportWebhooksCard.test.tsx --maxWorkers=2`
Expected: PASS

- [ ] **Step 5: Typecheck, lint, and commit**

```bash
npm run validate
git add src/renderer/ReportWebhooksCard.tsx src/renderer/__tests__/ReportWebhooksCard.test.tsx
git commit -m "feat(settings): add per-webhook report post style picker"
```

---

### Task 9: Dev card preview

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts` (the `mock-web-report` handler, around line 2265)

Gives a loop for tuning the template without publishing or hitting Discord.

**Interfaces:**
- Consumes: `renderReportCard` (Task 6), `buildReportCardModel` (Task 2).
- Produces: an IPC handler `preview-report-card`, returning `{ success: true; filePath: string } | { success: false; error: string }`.

- [ ] **Step 1: Write the implementation**

In `src/main/handlers/githubHandlers.ts`, directly after the `ipcMain.handle('mock-web-report', ...)` registration closes, add:

```ts
    ipcMain.handle('preview-report-card', async (_event, payload: { meta: any; stats: any; variant?: 'hybrid' | 'graphic' }) => {
        if (app.isPackaged) {
            return { success: false, error: 'Card previews are only available in dev builds.' };
        }
        try {
            const variant = payload?.variant === 'graphic' ? 'graphic' : 'hybrid';
            const model = buildReportCardModel(payload?.meta || {}, payload?.stats || {});
            const png = await renderReportCard(model, variant);
            if (!png) return { success: false, error: 'Card render returned no image.' };
            const outDir = path.join(app.getPath('userData'), 'card-previews');
            fs.mkdirSync(outDir, { recursive: true });
            const filePath = path.join(outDir, `report-card-${variant}.png`);
            fs.writeFileSync(filePath, png);
            await shell.openPath(filePath);
            return { success: true, filePath };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Card preview failed.' };
        }
    });
```

If `shell` is not already imported in this file, add it to the existing `electron` import.

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Exercise it by hand**

```bash
npm run dev
```

In the renderer devtools console:

```js
await window.electronAPI.invoke?.('preview-report-card', { meta: {}, stats: {}, variant: 'graphic' })
```

If the preload does not expose a generic `invoke`, call the handler through whatever channel helper the preload provides. Expected: a PNG opens in the system image viewer showing the card with an empty session (zeros, no boards) — this is the degenerate-input path, and it proving renderable is the point.

Then re-run with a real publish's stats to check the populated layout.

- [ ] **Step 4: Commit**

```bash
git add src/main/handlers/githubHandlers.ts
git commit -m "feat(dev): add report card preview handler"
```

---

### Task 10: Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-09-07-discord-report-post-styles-design.md`

- [ ] **Step 1: Correct the two spec claims that did not survive contact with the code**

In the **Settings** section, replace:

> That coercion belongs in the same normalizer the existing fields use, not scattered `?? 'text'` at read sites.

with:

> There is no normalizer for report webhooks — `src/main/index.ts:1664` writes the array to the store raw. So `coerceReportPostStyle` is exported from `src/shared/reportWebhooks.ts` and called at each read site: `postReportToWebhooks`, `planReportCardVariants`, and `ReportWebhooksCard`.

In the **Testing** section, replace the `settingsMigration.test.ts` bullet with:

> - **Coercion** — `src/shared/__tests__/reportWebhooks.test.ts` covers missing, empty, wrong-cased, and non-string `style` values.

In the **Fonts and assets** section, replace the `dist-react/img/...` sentence with:

> Class icons and the AxiBridge glyph resolve under `process.env.VITE_PUBLIC` (`src/main/index.ts:250`), which already points at `dist-react` when packaged and `public` in dev. An icon that fails to resolve degrades to a text abbreviation rather than a broken-image box.

Add to the **The board set is fixed** section:

> `stability` maps to `s.stab`, a summed stability-generation value — it is formatted as a compact number, not a percentage. `closestToTag` is an average distance in inches.

- [ ] **Step 2: Update the status line**

Change `Status: design, awaiting review` to `Status: implemented`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-07-discord-report-post-styles-design.md
git commit -m "docs: reconcile report post style spec with implementation"
```
