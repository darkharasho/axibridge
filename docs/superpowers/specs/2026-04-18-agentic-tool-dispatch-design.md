# Agentic Tool Dispatch Design

**Date:** 2026-04-18
**Status:** Approved

## Overview

Extend the AI chat feature with an agentic tool-dispatch loop. Instead of pre-serializing all EI JSON into the system prompt, the model can now request specific data queries mid-conversation. The result is richer, more accurate answers to complex questions without flooding the context window upfront.

Uses Ollama's native tool-call API (`/api/chat` with `tools`). The agentic loop runs entirely in the renderer — main process only adds one non-streaming endpoint.

## Decisions Summary

| Decision | Choice |
|---|---|
| Tool mechanism | Ollama native tool_calls (`/api/chat`, `stream: false`) |
| Incompatible model handling | Hard error with specific message to user |
| Tool execution location | Renderer (DetailsCache lives there) |
| Max agentic iterations | 3 |
| Tool call visibility | Visible badges (Lucide icons) per tool call |
| Thinking indicator | "Thinking..." label, input disabled during loop |
| Existing streaming path | Unchanged — final answer still streams normally |
| Default model | `llama3.1:8b` (already default, supports tool use) |

---

## Section 1: Architecture & Data Flow

Three new layers sit between `useChat` and Ollama:

```
User message
  ↓
agentLoop()          ← orchestrates the full cycle
  ↓
chatOnce()           ← non-streaming IPC call, returns tool_calls or text
  ↓ (if tool_calls present)
toolExecutors[]      ← pure synchronous JS functions, query EI JSON from DetailsCache
  ↓
append tool results as 'tool' role messages to history
  ↓ (loop up to 3 iterations, then fall through)
ollamaChat()         ← existing streaming IPC call → tokens stream to UI
```

### New files

| File | Purpose |
|------|---------|
| `src/renderer/chat/tools/toolSchemas.ts` | Ollama tool definitions (5 schemas) |
| `src/renderer/chat/tools/toolExecutors.ts` | JS functions executing each tool against EI JSON |
| `src/renderer/chat/agentLoop.ts` | Orchestrates plan → execute → stream |

### Modified files

| File | Change |
|------|--------|
| `src/main/ollama.ts` | Add `chatOnce(messages, tools?)` non-streaming method |
| `src/main/handlers/ollamaHandlers.ts` | Register `ollama:chat-once` IPC handler |
| `src/preload/index.ts` | Expose `chatOnce` via contextBridge |
| `src/renderer/global.d.ts` | Add `OllamaChatResponse` interface, `chatOnce` to electronAPI |
| `src/renderer/chat/useChat.ts` | Use agentLoop, expose `toolCalls` state |
| `src/renderer/ChatView.tsx` | Render tool call badges and thinking indicator |

---

## Section 2: Tool Schemas & Executors

### Tool definitions (`toolSchemas.ts`)

Five tools exported as an Ollama-compatible `Tool[]` array:

| Tool name | Required args | Optional args | Returns |
|-----------|--------------|---------------|---------|
| `player_deep_dive` | `character_name: string` | `fight_index: number` | All metrics for that player — damage by skill, health timeline, boon uptimes, defenses, support stats |
| `rank_players` | `metric: string` | `fight_index: number` | All players sorted by the named metric |
| `boon_analysis` | — | `fight_index: number`, `boon_name: string` | Per-player boon uptime table |
| `group_breakdown` | — | `fight_index: number` | Per-subgroup (G1–G5) aggregate stats |
| `compare_fights` | `metric: string` | `player_name: string` | Stat comparison across all fights |

`fight_index` is 0-based; omitting it means all fights are aggregated. `metric` is a free string (e.g. `"dps"`, `"stability_uptime"`, `"damage_taken"`).

### Executor contract (`toolExecutors.ts`)

```ts
type ToolExecutor = (
  args: Record<string, any>,
  logs: ILogData[],
  getDetails: (id: string) => any | undefined
) => Record<string, any>
```

Each executor is **pure and synchronous** — no async, no IPC. Unknown metrics return `{ error: "Unknown metric", valid_metrics: [...] }` so the model can self-correct. Player not found returns `{ error: "Player not found", available_players: [...] }`.

---

## Section 3: Agentic Loop (`agentLoop.ts`)

```ts
async function agentLoop(
  userText: string,
  history: ChatMessage[],
  logs: ILogData[],
  getDetails: (id: string) => any | undefined,
  onToolCall: (name: string, status: 'running' | 'done') => void,
  onToken: (token: string, done: boolean) => void,
): Promise<void>
```

**Step 1 — Plan:** POST to `ollama:chat-once` with full message history + user message + all 5 tool schemas. Waits for complete response.

**Step 2 — Detect tool calls:** If `chatOnce()` throws with an Ollama error indicating tools are not supported (error message contains "tool" or "function"), rethrow as `ToolUseNotSupportedError`. If the response has `content` and no `tool_calls`, the model chose to answer directly without tools — proceed immediately to Step 5 (stream the content). Only if `tool_calls` is present do we execute tools.

**Step 3 — Execute:** For each tool call in the response:
1. Call `onToolCall(name, 'running')` — UI shows running badge
2. Run the matching executor synchronously
3. Append the assistant message (with tool_calls) to history
4. Append a `{ role: 'tool', content: JSON.stringify(result) }` message
5. Call `onToolCall(name, 'done')` — UI updates badge to done

**Step 4 — Loop or stream:** If any tool calls were executed, go back to Step 1. Cap at **3 iterations** — after the cap, log a warning and fall through to streaming.

**Step 5 — Stream:** Once the model returns plain text (either directly or after tool rounds), `agentLoop` calls `window.electronAPI.ollamaChat(history)` and subscribes to `window.electronAPI.onOllamaChatToken` internally, forwarding each token to `onToken` and cleaning up the listener on done. The caller (`useChat`) does not manage the token listener separately — `agentLoop` owns the full lifecycle of both the planning and streaming calls.

### Error states

| Error | Behaviour |
|-------|-----------|
| Model doesn't support tools | `ToolUseNotSupportedError` → shown as error message in chat: *"This model doesn't support tool use. Switch to llama3.1, mistral, or qwen2.5."* |
| Tool executor throws | Result message contains `{ "error": "..." }`, model reads it and responds gracefully |
| 3-iteration cap reached | Warning logged, agentLoop falls through to streaming with accumulated context |
| `chatOnce` network error | Propagated as existing Ollama connection error |

---

## Section 4: IPC Changes

### New: `ollama:chat-once` handler

```ts
ipcMain.handle('ollama:chat-once', async (_event, messages, tools?) => {
  return ollamaManager.chatOnce(messages, tools);
});
```

### New: `OllamaManager.chatOnce()`

```ts
async chatOnce(messages: ChatMessage[], tools?: Tool[]): Promise<OllamaChatResponse>
```

POSTs to `/api/chat` with `stream: false` and optionally `tools`. Returns the full parsed JSON response. No streaming, no token events. Timeout: 30s.

### New types (`global.d.ts`)

```ts
interface OllamaToolCall {
  function: { name: string; arguments: Record<string, any> };
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  };
}
```

### Preload addition

```ts
chatOnce: (messages: ChatMessage[], tools?: any[]) => Promise<OllamaChatResponse>
```

The existing `ollamaChat` streaming path is **unchanged**.

---

## Section 5: UI Changes

### Tool call state in `useChat`

```ts
interface ToolCallStatus {
  id: string;
  name: string;
  status: 'running' | 'done';
}
```

`useChat` exposes `toolCalls: ToolCallStatus[]`, cleared at the start of each send. Updated via callbacks from `agentLoop`.

### Thinking indicator

While `chatOnce` is in-flight (before any tool_calls are known), the input area is replaced with a muted `"Thinking..."` label. Input remains disabled until the final streaming answer completes.

### Tool call badges (`ChatView.tsx`)

Badges render between the last user message and the assistant response bubble. Each badge uses Lucide icons:

- **Running:** `<Loader2 className="animate-spin" />` + tool label in muted text
- **Done:** `<CheckCircle2 />` in green + tool label

Tool label display names:

| Tool name | Display label |
|-----------|--------------|
| `player_deep_dive` | Analyzing player |
| `rank_players` | Ranking players |
| `boon_analysis` | Analyzing boons |
| `group_breakdown` | Breaking down groups |
| `compare_fights` | Comparing fights |

Badges persist in the thread after the answer streams in so the user can see what was queried.

### Error display

`ToolUseNotSupportedError` renders as an assistant message bubble with the `AlertTriangle` Lucide icon and the error text. Same visual treatment as the existing Ollama connection error.
