# Agentic Tool Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an agentic tool-dispatch loop to the AI chat — the model can call five typed JS workers (player deep-dive, rank players, boon analysis, group breakdown, compare fights) against the EI JSON in the DetailsCache, with visible Lucide badges in the UI while tools run.

**Architecture:** A new `agentLoop()` function (renderer-side) drives a plan → execute → stream cycle using Ollama's native tool-call API. A non-streaming `chatOnce` IPC endpoint is added to the main process. Tool executors are pure synchronous JS functions that query the DetailsCache directly. `useChat` exposes `toolCalls` and `thinking` state; `ChatView` renders badges with `Loader2`/`CheckCircle2` icons.

**Tech Stack:** Ollama `/api/chat` with `tools` + `stream: false`, Electron IPC, React, Lucide icons, Vitest for executor unit tests.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/main/ollama.ts` | Add `chatOnce()` non-streaming method; update `ChatMessage` role to include `'tool'` |
| Modify | `src/main/handlers/ollamaHandlers.ts` | Register `ollama:chat-once` IPC handler |
| Modify | `src/preload/index.ts` | Expose `chatOnce` via contextBridge |
| Modify | `src/renderer/global.d.ts` | Add `OllamaToolCall`, `OllamaChatResponse` interfaces; add `chatOnce` to electronAPI; update `ChatMessage` role |
| Create | `src/renderer/chat/tools/toolSchemas.ts` | Five Ollama-format tool definitions |
| Create | `src/renderer/chat/tools/toolExecutors.ts` | Five pure synchronous executor functions + `executeToolCall` dispatcher |
| Create | `src/renderer/chat/__tests__/toolExecutors.test.ts` | Unit tests for all five executors |
| Create | `src/renderer/chat/agentLoop.ts` | `agentLoop()` + `ToolUseNotSupportedError` |
| Modify | `src/renderer/chat/useChat.ts` | Expose `toolCalls`, `thinking`; replace sendMessage body with agentLoop |
| Modify | `src/renderer/ChatView.tsx` | Tool call badges, thinking indicator |

---

## Task 1: Main Process — `chatOnce` IPC

**Files:**
- Modify: `src/main/ollama.ts`
- Modify: `src/main/handlers/ollamaHandlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/global.d.ts`

- [ ] **Step 1: Update `ChatMessage` role in `src/main/ollama.ts` to include `'tool'`**

The tool-result messages the renderer will send back in the history need `role: 'tool'`. Find this block:
```ts
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
```
Replace with:
```ts
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, any> } }>;
}
```

- [ ] **Step 2: Add `chatOnce()` to `OllamaManager` in `src/main/ollama.ts`**

Add this method after `chat()`:
```ts
async chatOnce(messages: ChatMessage[], tools?: any[]): Promise<any> {
    const activeModel = 'llama3.1:8b'; // model resolved by handler from store
    const body: any = { model: activeModel, messages, stream: false };
    if (tools?.length) body.tools = tools;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
        const res = await fetch(`${BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`chatOnce failed: ${res.status} ${await res.text()}`);
        return await res.json();
    } finally {
        clearTimeout(timeout);
    }
}
```

- [ ] **Step 3: Register `ollama:chat-once` in `src/main/handlers/ollamaHandlers.ts`**

Add this handler after the `ollama:chat` handler:
```ts
ipcMain.handle('ollama:chat-once', async (_event, messages: ChatMessage[], tools?: any[]) => {
    const mgr = getOllamaManager();
    const activeModel = (store.get('ollamaActiveModel', 'llama3.1:8b') as string);
    // Inject active model into the manager call
    return mgr.chatOnce(messages, tools, activeModel);
});
```

**Note:** `chatOnce` needs to accept `model` as a parameter so the handler can pass the stored model. Update the `chatOnce` signature in `ollama.ts` to:
```ts
async chatOnce(messages: ChatMessage[], tools?: any[], model = 'llama3.1:8b'): Promise<any>
```
And replace the hardcoded `'llama3.1:8b'` in the body with the `model` parameter.

- [ ] **Step 4: Expose `chatOnce` in `src/preload/index.ts`**

Add after `stopOllama`:
```ts
chatOnce: (messages: any[], tools?: any[]) => ipcRenderer.invoke('ollama:chat-once', messages, tools),
```

- [ ] **Step 5: Update `src/renderer/global.d.ts`**

Add after the `ChatMessage` interface:
```ts
export interface OllamaToolCall {
    function: { name: string; arguments: Record<string, any> };
}

export interface OllamaChatResponse {
    message: {
        role: string;
        content: string;
        tool_calls?: OllamaToolCall[];
    };
}
```

Update `ChatMessage`:
```ts
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: OllamaToolCall[];
}
```

Add `chatOnce` to the `electronAPI` interface (after `stopOllama`):
```ts
chatOnce: (messages: ChatMessage[], tools?: any[]) => Promise<OllamaChatResponse>;
```

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/main/ollama.ts src/main/handlers/ollamaHandlers.ts src/preload/index.ts src/renderer/global.d.ts
git commit -m "feat: add chatOnce non-streaming IPC endpoint for agentic tool dispatch"
```

---

## Task 2: Tool Schemas

**Files:**
- Create: `src/renderer/chat/tools/toolSchemas.ts`

- [ ] **Step 1: Create `src/renderer/chat/tools/toolSchemas.ts`**

```ts
export interface OllamaTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, { type: string; description: string }>;
            required: string[];
        };
    };
}

export const TOOL_SCHEMAS: OllamaTool[] = [
    {
        type: 'function',
        function: {
            name: 'player_deep_dive',
            description: 'Get all available stats for a specific player — damage by skill, boon uptimes, defenses, support stats, and health timeline. Use when asked about a specific player in detail.',
            parameters: {
                type: 'object',
                properties: {
                    character_name: { type: 'string', description: 'Character name, account name, or partial match' },
                    fight_index: { type: 'number', description: '0-based fight index. Omit to search all fights.' },
                },
                required: ['character_name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'rank_players',
            description: 'Rank all players by a named metric. Use when asked "who topped X" or "who had the best/worst Y". Valid metrics: dps, damage, deaths, downs, damage_taken, cleanses, strips, rezzes, breakbar_damage, dist_to_tag, stability_uptime, quickness_uptime, alacrity_uptime, might_uptime.',
            parameters: {
                type: 'object',
                properties: {
                    metric: { type: 'string', description: 'Metric name, e.g. "dps", "deaths", "stability_uptime"' },
                    fight_index: { type: 'number', description: '0-based fight index. Omit to aggregate across all fights.' },
                },
                required: ['metric'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'boon_analysis',
            description: 'Get per-player boon uptime table for a fight. Use when asked about boon coverage, who had high/low boon uptime, or support performance.',
            parameters: {
                type: 'object',
                properties: {
                    fight_index: { type: 'number', description: '0-based fight index. Omit for all fights.' },
                    boon_name: { type: 'string', description: 'Filter to a specific boon: stability, quickness, alacrity, might, fury, swiftness, protection, aegis, regeneration, vigor, resolution, resistance. Omit for all boons.' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'group_breakdown',
            description: 'Get aggregate stats (damage, deaths, cleanses, rezzes) broken down per subgroup (G1–G5). Use when asked how each group or subgroup performed.',
            parameters: {
                type: 'object',
                properties: {
                    fight_index: { type: 'number', description: '0-based fight index. Omit for all fights.' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'compare_fights',
            description: 'Compare a metric across all fights — either squad-wide or for a specific player. Use when asked "how did X change across fights" or "which fight had the best Y".',
            parameters: {
                type: 'object',
                properties: {
                    metric: { type: 'string', description: 'Metric name, e.g. "dps", "deaths", "stability_uptime"' },
                    player_name: { type: 'string', description: 'Optional: filter to a specific player. Omit for squad aggregate.' },
                },
                required: ['metric'],
            },
        },
    },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/chat/tools/toolSchemas.ts
git commit -m "feat: add Ollama tool schemas for agentic dispatch"
```

---

## Task 3: Tool Executors

**Files:**
- Create: `src/renderer/chat/tools/toolExecutors.ts`
- Create: `src/renderer/chat/__tests__/toolExecutors.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/renderer/chat/__tests__/toolExecutors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { executeToolCall } from '../tools/toolExecutors';

// Minimal fake log + details
function makeLog(id: string, fightName: string): ILogData {
    return { id, filePath: `/path/${id}`, fightName, detailsStatus: 'loaded', permalink: '' } as any;
}

function makePlayer(char: string, account: string, group: number, overrides: any = {}) {
    return {
        character_name: char,
        display_name: char,
        account,
        profession: 'Daredevil',
        group,
        dpsAll: [{ damage: 100_000, dps: 500, breakbarDamage: 50 }],
        defenses: [{ deadCount: 1, downCount: 2, damageTaken: 20_000, dodgeCount: 3, blockedCount: 0, evadedCount: 1, missedCount: 0 }],
        support: [{ resurrects: 2, condiCleanse: 5, condiCleanseSelf: 1, boonStrips: 3 }],
        statsAll: [{ distToCom: 100 }],
        buffUptimes: [
            { id: 726, buffData: [{ uptime: 0.9 }] },   // Stability
            { id: 1187, buffData: [{ uptime: 0.8 }] },  // Quickness
        ],
        ...overrides,
    };
}

const logs: ILogData[] = [makeLog('l1', 'Fight A'), makeLog('l2', 'Fight B')];
const detailsA = {
    players: [
        makePlayer('Alpha', 'alpha.1234', 1),
        makePlayer('Beta', 'beta.5678', 2, { dpsAll: [{ damage: 200_000, dps: 1000, breakbarDamage: 0 }] }),
    ],
};
const detailsB = {
    players: [makePlayer('Alpha', 'alpha.1234', 1, { defenses: [{ deadCount: 0, downCount: 0, damageTaken: 5_000 }] })],
};
const getDetails = (id: string) => id === 'l1' ? detailsA : id === 'l2' ? detailsB : undefined;

describe('rank_players', () => {
    it('ranks by dps descending', () => {
        const result = executeToolCall('rank_players', { metric: 'dps' }, logs, getDetails);
        expect(result.ranked[0].name).toBe('Beta');
        expect(result.ranked[1].name).toBe('Alpha');
    });

    it('returns error for unknown metric', () => {
        const result = executeToolCall('rank_players', { metric: 'nonsense' }, logs, getDetails);
        expect(result.error).toBe('Unknown metric');
        expect(result.valid_metrics).toContain('dps');
    });

    it('filters to a specific fight by fight_index', () => {
        const result = executeToolCall('rank_players', { metric: 'dps', fight_index: 0 }, logs, getDetails);
        expect(result.ranked.length).toBe(2);
    });
});

describe('player_deep_dive', () => {
    it('finds player by partial name', () => {
        const result = executeToolCall('player_deep_dive', { character_name: 'alph' }, logs, getDetails);
        expect(result.results).toBeDefined();
        expect(result.results.length).toBeGreaterThan(0);
        expect(result.results[0].player.character_name).toBe('Alpha');
    });

    it('returns available players when not found', () => {
        const result = executeToolCall('player_deep_dive', { character_name: 'nobody' }, logs, getDetails);
        expect(result.error).toBe('Player not found');
        expect(result.available_players).toContain('Alpha');
    });
});

describe('boon_analysis', () => {
    it('returns boon uptime per player', () => {
        const result = executeToolCall('boon_analysis', {}, logs, getDetails);
        expect(result.fights[0].players.length).toBeGreaterThan(0);
        expect(result.fights[0].players[0].boons).toHaveProperty('stability');
    });

    it('filters to a specific boon', () => {
        const result = executeToolCall('boon_analysis', { boon_name: 'quickness' }, logs, getDetails);
        const boonKeys = Object.keys(result.fights[0].players[0].boons);
        expect(boonKeys).toEqual(['quickness']);
    });
});

describe('group_breakdown', () => {
    it('groups players by group number', () => {
        const result = executeToolCall('group_breakdown', {}, logs, getDetails);
        const fightA = result.fights[0];
        expect(fightA.groups.find((g: any) => g.group === 1)).toBeDefined();
        expect(fightA.groups.find((g: any) => g.group === 2)).toBeDefined();
    });
});

describe('compare_fights', () => {
    it('compares squad dps across fights', () => {
        const result = executeToolCall('compare_fights', { metric: 'dps' }, logs, getDetails);
        expect(result.fights.length).toBe(2);
        expect(result.fights[0].fight).toBe('Fight A');
    });

    it('compares a specific player across fights', () => {
        const result = executeToolCall('compare_fights', { metric: 'deaths', player_name: 'Alpha' }, logs, getDetails);
        expect(result.fights[0].value).toBe(1); // Fight A: 1 death
        expect(result.fights[1].value).toBe(0); // Fight B: 0 deaths
    });
});

describe('executeToolCall', () => {
    it('returns error for unknown tool', () => {
        const result = executeToolCall('unknown_tool', {}, logs, getDetails);
        expect(result.error).toBe('Unknown tool');
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/renderer/chat/__tests__/toolExecutors.test.ts
```
Expected: All tests fail with "Cannot find module '../tools/toolExecutors'".

- [ ] **Step 3: Create `src/renderer/chat/tools/toolExecutors.ts`**

```ts
// Metric extractors — map string name → (player) => number
const METRIC_MAP: Record<string, (p: any) => number> = {
    dps:             p => p.dpsAll?.[0]?.dps ?? 0,
    damage:          p => p.dpsAll?.[0]?.damage ?? 0,
    deaths:          p => p.defenses?.[0]?.deadCount ?? 0,
    downs:           p => p.defenses?.[0]?.downCount ?? 0,
    damage_taken:    p => p.defenses?.[0]?.damageTaken ?? 0,
    cleanses:        p => (p.support?.[0]?.condiCleanse ?? 0) + (p.support?.[0]?.condiCleanseSelf ?? 0),
    strips:          p => p.support?.[0]?.boonStrips ?? 0,
    rezzes:          p => p.support?.[0]?.resurrects ?? 0,
    breakbar_damage: p => p.dpsAll?.[0]?.breakbarDamage ?? 0,
    dist_to_tag:     p => p.statsAll?.[0]?.distToCom ?? p.statsAll?.[0]?.stackDist ?? 0,
    stability_uptime:  p => Math.round((p.buffUptimes?.find((b: any) => b.id === 726 || b.id === 1122)?.buffData?.[0]?.uptime ?? 0) * 100),
    quickness_uptime:  p => Math.round((p.buffUptimes?.find((b: any) => b.id === 1187)?.buffData?.[0]?.uptime ?? 0) * 100),
    alacrity_uptime:   p => Math.round((p.buffUptimes?.find((b: any) => b.id === 30328)?.buffData?.[0]?.uptime ?? 0) * 100),
    might_uptime:      p => Math.round((p.buffUptimes?.find((b: any) => b.id === 1)?.buffData?.[0]?.uptime ?? 0) * 100),
};

const BOON_IDS: Record<string, number> = {
    stability: 726, quickness: 1187, alacrity: 30328, might: 1,
    fury: 5, swiftness: 725, protection: 743, aegis: 717,
    regeneration: 718, vigor: 719, resolution: 873, resistance: 26980,
};
const BOON_ID_TO_NAME = new Map(Object.entries(BOON_IDS).map(([k, v]) => [v, k]));

type Executor = (args: Record<string, any>, logs: ILogData[], getDetails: (id: string) => any | undefined) => Record<string, any>;

function loadedFights(logs: ILogData[], fightIndex?: number): ILogData[] {
    const loaded = logs.filter(l => l.detailsStatus === 'loaded');
    if (fightIndex != null) return loaded[fightIndex] ? [loaded[fightIndex]] : [];
    return loaded;
}

const executors: Record<string, Executor> = {
    player_deep_dive(args, logs, getDetails) {
        const { character_name, fight_index } = args;
        const query = String(character_name).toLowerCase();
        const fights = loadedFights(logs, fight_index);
        const results: any[] = [];

        for (const log of fights) {
            const details = getDetails(log.id) ?? getDetails(log.filePath);
            if (!details) continue;
            const player = (details.players ?? []).find((p: any) =>
                p.character_name?.toLowerCase().includes(query) ||
                p.display_name?.toLowerCase().includes(query) ||
                p.account?.toLowerCase().includes(query)
            );
            if (player) results.push({ fight: log.fightName ?? log.id, player });
        }

        if (results.length === 0) {
            const allNames = fights.flatMap(log => {
                const d = getDetails(log.id) ?? getDetails(log.filePath);
                return (d?.players ?? []).map((p: any) => p.character_name || p.display_name || '?');
            });
            return { error: 'Player not found', available_players: [...new Set(allNames)].slice(0, 20) };
        }
        return { results };
    },

    rank_players(args, logs, getDetails) {
        const { metric, fight_index } = args;
        const extractor = METRIC_MAP[metric];
        if (!extractor) return { error: 'Unknown metric', valid_metrics: Object.keys(METRIC_MAP) };

        const fights = loadedFights(logs, fight_index);
        const playerMap = new Map<string, { name: string; account: string; profession: string; values: number[] }>();

        for (const log of fights) {
            const details = getDetails(log.id) ?? getDetails(log.filePath);
            if (!details) continue;
            for (const p of details.players ?? []) {
                const key = p.character_name || p.display_name || '?';
                if (!playerMap.has(key)) {
                    playerMap.set(key, { name: key, account: p.account ?? '', profession: p.profession ?? '', values: [] });
                }
                playerMap.get(key)!.values.push(extractor(p));
            }
        }

        const ranked = Array.from(playerMap.values())
            .map(p => ({
                name: p.name, account: p.account, profession: p.profession,
                value: Math.round(p.values.reduce((a, b) => a + b, 0) / p.values.length),
                metric,
            }))
            .sort((a, b) => b.value - a.value);

        return { metric, ranked: ranked.slice(0, 30) };
    },

    boon_analysis(args, logs, getDetails) {
        const { fight_index, boon_name } = args;
        const targetIds = boon_name
            ? [BOON_IDS[String(boon_name).toLowerCase()]].filter(Boolean)
            : Array.from(BOON_ID_TO_NAME.keys());

        const fights = loadedFights(logs, fight_index);
        const result = fights.map(log => {
            const details = getDetails(log.id) ?? getDetails(log.filePath);
            const players = (details?.players ?? []).map((p: any) => {
                const boons: Record<string, number> = {};
                for (const b of p.buffUptimes ?? []) {
                    if (targetIds.includes(b.id)) {
                        const name = BOON_ID_TO_NAME.get(b.id) ?? String(b.id);
                        boons[name] = Math.round((b.buffData?.[0]?.uptime ?? 0) * 100);
                    }
                }
                return { name: p.character_name || p.display_name, profession: p.profession, boons };
            }).filter((p: any) => Object.keys(p.boons).length > 0);
            return { fight: log.fightName ?? log.id, players };
        });

        return { boon_name: boon_name ?? 'all', fights: result };
    },

    group_breakdown(args, logs, getDetails) {
        const { fight_index } = args;
        const fights = loadedFights(logs, fight_index);
        const result = fights.map(log => {
            const details = getDetails(log.id) ?? getDetails(log.filePath);
            const byGroup = new Map<number, any[]>();
            for (const p of details?.players ?? []) {
                const g = p.group ?? 0;
                if (!byGroup.has(g)) byGroup.set(g, []);
                byGroup.get(g)!.push(p);
            }
            const groups = Array.from(byGroup.entries()).sort(([a], [b]) => a - b).map(([g, players]) => ({
                group: g,
                count: players.length,
                totalDamage: players.reduce((s: number, p: any) => s + (p.dpsAll?.[0]?.damage ?? 0), 0),
                totalDeaths: players.reduce((s: number, p: any) => s + (p.defenses?.[0]?.deadCount ?? 0), 0),
                totalCleanses: players.reduce((s: number, p: any) => s + (p.support?.[0]?.condiCleanse ?? 0) + (p.support?.[0]?.condiCleanseSelf ?? 0), 0),
                totalRezzes: players.reduce((s: number, p: any) => s + (p.support?.[0]?.resurrects ?? 0), 0),
                players: players.map((p: any) => p.character_name || p.display_name),
            }));
            return { fight: log.fightName ?? log.id, groups };
        });
        return { fights: result };
    },

    compare_fights(args, logs, getDetails) {
        const { metric, player_name } = args;
        const extractor = METRIC_MAP[metric];
        if (!extractor) return { error: 'Unknown metric', valid_metrics: Object.keys(METRIC_MAP) };

        const loaded = logs.filter(l => l.detailsStatus === 'loaded');
        const fights = loaded.map((log, i) => {
            const details = getDetails(log.id) ?? getDetails(log.filePath);
            if (!details) return { fight_index: i, fight: log.fightName ?? log.id, value: null, error: 'details not cached' };
            const players: any[] = details.players ?? [];

            if (player_name) {
                const query = String(player_name).toLowerCase();
                const p = players.find(p =>
                    p.character_name?.toLowerCase().includes(query) ||
                    p.display_name?.toLowerCase().includes(query)
                );
                return { fight_index: i, fight: log.fightName ?? log.id, value: p != null ? extractor(p) : null };
            }

            const values = players.map(extractor).filter(v => v > 0);
            const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
            const total = values.reduce((a, b) => a + b, 0);
            return { fight_index: i, fight: log.fightName ?? log.id, avg, total };
        });
        return { metric, player_name: player_name ?? null, fights };
    },
};

export function executeToolCall(
    name: string,
    args: Record<string, any>,
    logs: ILogData[],
    getDetails: (id: string) => any | undefined
): Record<string, any> {
    const executor = executors[name];
    if (!executor) return { error: 'Unknown tool', valid_tools: Object.keys(executors) };
    try {
        return executor(args, logs, getDetails);
    } catch (err: any) {
        return { error: err?.message ?? 'Tool execution failed' };
    }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/renderer/chat/__tests__/toolExecutors.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/chat/tools/toolExecutors.ts src/renderer/chat/__tests__/toolExecutors.test.ts
git commit -m "feat: add tool executors for agentic dispatch (player deep-dive, rank, boon, group, compare)"
```

---

## Task 4: Agentic Loop

**Files:**
- Create: `src/renderer/chat/agentLoop.ts`

- [ ] **Step 1: Create `src/renderer/chat/agentLoop.ts`**

```ts
import { TOOL_SCHEMAS } from './tools/toolSchemas';
import { executeToolCall } from './tools/toolExecutors';

export class ToolUseNotSupportedError extends Error {
    constructor() {
        super("This model doesn't support tool use. Switch to llama3.1, mistral, or qwen2.5.");
        this.name = 'ToolUseNotSupportedError';
    }
}

const MAX_ITERATIONS = 3;

export async function agentLoop(
    userText: string,
    history: ChatMessage[],
    logs: ILogData[],
    getDetails: (id: string) => any | undefined,
    onToolCall: (name: string, status: 'running' | 'done') => void,
    onToken: (token: string, done: boolean) => void,
): Promise<void> {
    // Internal message list — typed loosely to support tool_calls on assistant messages
    const messages: any[] = [
        ...history,
        { role: 'user', content: userText },
    ];

    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
        iterations++;

        let response: OllamaChatResponse;
        try {
            response = await window.electronAPI.chatOnce(messages, TOOL_SCHEMAS);
        } catch (err: any) {
            const msg = (err?.message ?? '').toLowerCase();
            if (msg.includes('tool') || msg.includes('function')) {
                throw new ToolUseNotSupportedError();
            }
            throw err;
        }

        const toolCalls = response.message.tool_calls;

        // Model answered directly — emit full content as a single token then return
        if (!toolCalls?.length) {
            const content = response.message.content ?? '';
            onToken(content, true);
            return;
        }

        // Append the assistant's tool-call message to history
        messages.push({
            role: 'assistant',
            content: response.message.content ?? '',
            tool_calls: toolCalls,
        });

        // Execute each tool and append results
        for (const tc of toolCalls) {
            const { name, arguments: args } = tc.function;
            onToolCall(name, 'running');

            let result: Record<string, any>;
            try {
                result = executeToolCall(name, args, logs, getDetails);
            } catch (err: any) {
                result = { error: err?.message ?? 'Tool execution failed' };
            }

            messages.push({ role: 'tool', content: JSON.stringify(result) });
            onToolCall(name, 'done');
        }
    }

    // Cap reached — fall through to streaming with accumulated context
    console.warn('[agentLoop] Max iterations reached, falling through to streaming');

    await new Promise<void>((resolve, reject) => {
        const unsub = window.electronAPI.onOllamaChatToken(({ token, done }) => {
            onToken(token, done);
            if (done) {
                unsub();
                resolve();
            }
        });
        window.electronAPI.ollamaChat(messages).catch(err => {
            unsub();
            reject(err);
        });
    });
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/chat/agentLoop.ts
git commit -m "feat: add agentLoop with plan→execute→stream cycle and ToolUseNotSupportedError"
```

---

## Task 5: Wire `useChat`

**Files:**
- Modify: `src/renderer/chat/useChat.ts`

- [ ] **Step 1: Replace `useChat.ts` with the updated version**

Full file content (replace entirely):
```ts
import { useState, useCallback, useEffect, useRef, useContext } from 'react';
import type { ChatMessage } from '../global';
import { buildChatContext } from './buildChatContext';
import { agentLoop, ToolUseNotSupportedError } from './agentLoop';
import { DetailsCacheContext } from '../cache/DetailsCacheContext';

export interface ChatMsg {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    streaming?: boolean;
}

export interface ToolCallStatus {
    id: string;
    name: string;
    status: 'running' | 'done';
}

const TOOL_DISPLAY: Record<string, string> = {
    player_deep_dive: 'Analyzing player',
    rank_players: 'Ranking players',
    boon_analysis: 'Analyzing boons',
    group_breakdown: 'Breaking down groups',
    compare_fights: 'Comparing fights',
};

export function useChat(logs: ILogData[], ollamaEnabled: boolean) {
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [streaming, setStreaming] = useState(false);
    const [thinking, setThinking] = useState(false);
    const [toolCalls, setToolCalls] = useState<ToolCallStatus[]>([]);
    const [ollamaConnected, setOllamaConnected] = useState(false);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const messagesRef = useRef<ChatMsg[]>([]);
    const detailsCache = useContext(DetailsCacheContext);

    useEffect(() => { messagesRef.current = messages; }, [messages]);

    useEffect(() => {
        if (!ollamaEnabled) return;
        let cancelled = false;
        window.electronAPI.getOllamaStatus().then(status => {
            if (!cancelled) {
                setOllamaConnected(status.connected);
                setAvailableModels(status.models);
            }
        });
        const unsub = window.electronAPI.onOllamaStatusChanged(status => {
            setOllamaConnected(status.connected);
            setAvailableModels(status.models);
        });
        return () => { cancelled = true; unsub(); };
    }, [ollamaEnabled]);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || streaming) return;

        const userMsg: ChatMsg = { id: crypto.randomUUID(), role: 'user', content: text };
        const assistantId = crypto.randomUUID();

        setMessages(prev => [
            ...prev,
            userMsg,
            { id: assistantId, role: 'assistant', content: '', streaming: true },
        ]);
        setStreaming(true);
        setThinking(true);
        setToolCalls([]);

        const systemPrompt = buildChatContext(logs, (id) => detailsCache?.peek(id));
        const history: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...messagesRef.current.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ];

        const handleToolCall = (name: string, status: 'running' | 'done') => {
            setThinking(false);
            setToolCalls(prev => {
                const existing = prev.find(t => t.name === name && t.status === 'running');
                if (status === 'running') {
                    return [...prev, { id: crypto.randomUUID(), name, status }];
                }
                if (existing) {
                    return prev.map(t => t.name === name && t.status === 'running' ? { ...t, status: 'done' } : t);
                }
                return prev;
            });
        };

        let buffer = '';
        const handleToken = (token: string, done: boolean) => {
            setThinking(false);
            buffer += token;
            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: buffer, streaming: !done }
                    : m
            ));
            if (done) setStreaming(false);
        };

        try {
            await agentLoop(text, history, logs, (id) => detailsCache?.peek(id), handleToolCall, handleToken);
        } catch (err: any) {
            const content = err instanceof ToolUseNotSupportedError
                ? err.message
                : 'Error: could not reach Ollama. Is it still running?';
            setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content, streaming: false } : m
            ));
            setStreaming(false);
            setThinking(false);
        }
    }, [logs, streaming, detailsCache]);

    const clearMessages = useCallback(() => {
        setMessages([]);
        setToolCalls([]);
    }, []);

    return { messages, streaming, thinking, toolCalls, ollamaConnected, availableModels, sendMessage, clearMessages };
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/chat/useChat.ts
git commit -m "feat: wire agentLoop into useChat, expose toolCalls and thinking state"
```

---

## Task 6: UI — Badges and Thinking Indicator

**Files:**
- Modify: `src/renderer/ChatView.tsx`

- [ ] **Step 1: Update imports in `ChatView.tsx`**

Replace the existing import line:
```ts
import { Maximize2, X, Send, Bot, Play } from 'lucide-react';
```
With:
```ts
import { Maximize2, X, Send, Bot, Play, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
```

- [ ] **Step 2: Destructure new state from `useChat`**

Replace:
```ts
const { messages, streaming, ollamaConnected: hookConnected, sendMessage } = useChat(logs, ollamaEnabled);
```
With:
```ts
const { messages, streaming, thinking, toolCalls, ollamaConnected: hookConnected, sendMessage } = useChat(logs, ollamaEnabled);
```

- [ ] **Step 3: Add `TOOL_DISPLAY` map and `ToolCallBadges` component inside `ChatView.tsx` (above the `ChatViewProps` interface)**

```ts
const TOOL_DISPLAY: Record<string, string> = {
    player_deep_dive: 'Analyzing player',
    rank_players: 'Ranking players',
    boon_analysis: 'Analyzing boons',
    group_breakdown: 'Breaking down groups',
    compare_fights: 'Comparing fights',
};

function ToolCallBadge({ name, status }: { name: string; status: 'running' | 'done' }) {
    const label = TOOL_DISPLAY[name] ?? name;
    return (
        <div className={`flex items-center gap-1.5 text-xs py-1 ${status === 'done' ? 'text-green-400' : 'text-gray-500'}`}>
            {status === 'running'
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <CheckCircle2 className="w-3 h-3" />}
            <span>{label}</span>
        </div>
    );
}
```

- [ ] **Step 4: Add tool badges and thinking indicator into the message list**

In the messages section, after the `messages.map(...)` block and before `<div ref={bottomRef} />`, add:

```tsx
{/* Tool call badges — rendered after last user message, before final assistant response */}
{toolCalls.length > 0 && (
    <div className="self-start flex flex-col gap-0.5 px-1">
        {toolCalls.map(tc => (
            <ToolCallBadge key={tc.id} name={tc.name} status={tc.status} />
        ))}
    </div>
)}
```

- [ ] **Step 5: Update the input row to show the thinking indicator**

Replace the `<form>` block (input + send button) with:

```tsx
{thinking ? (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Thinking...</span>
    </div>
) : (
    <form
        onSubmit={e => { e.preventDefault(); handleSubmit(input); }}
        className="flex gap-2 items-center"
    >
        <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your fights..."
            disabled={streaming}
            className="flex-1 text-sm px-3 py-2 rounded-md border bg-gray-900 text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            style={{ borderColor: 'var(--border-default)' }}
        />
        <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="p-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
            <Send className="w-4 h-4 text-white" />
        </button>
    </form>
)}
```

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 7: Run unit tests**

```bash
npm run test:unit
```
Expected: all tests pass including the new toolExecutors tests.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/ChatView.tsx
git commit -m "feat: add tool call badges and thinking indicator to ChatView"
```

---

## Self-Review Checklist

- [x] **Spec coverage**
  - Section 1 (architecture): Tasks 1, 4, 5 cover all new/modified files
  - Section 2 (tool schemas + executors): Tasks 2, 3
  - Section 3 (agentic loop): Task 4
  - Section 4 (IPC): Task 1
  - Section 5 (UI badges + thinking): Task 6
- [x] **No placeholders**: All steps have complete code
- [x] **Type consistency**: `ToolCallStatus` defined in Task 5 and used in Task 6 via destructuring from `useChat`. `OllamaChatResponse` defined in Task 1 and used in Task 4. `executeToolCall` defined in Task 3 and imported in Task 4. `TOOL_SCHEMAS` defined in Task 2 and imported in Task 4.
- [x] **`ChatMessage` role `'tool'`**: Updated in both `src/main/ollama.ts` (Task 1 Step 1) and `src/renderer/global.d.ts` (Task 1 Step 5)
