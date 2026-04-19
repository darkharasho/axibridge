# AI Chat Feature Design

**Date:** 2026-04-18
**Status:** Approved

## Overview

An embedded AI chat feature for AxiBridge powered by Ollama (local LLM inference). Fully opt-in, hidden behind a settings toggle. Lets players ask natural-language questions about their currently loaded fight logs — no external API key, no subscription required.

## Decisions Summary

| Decision | Choice |
|---|---|
| AI backend | Ollama (local, free, Linux-native) |
| Data context | Currently loaded logs only |
| UI surfaces | Chat tab (sidebar nav) + floating side panel |
| Shared state | Same `ChatView` component, `compact` prop |
| Floating trigger | Bottom-right of content area, auto-expands window |
| Full-screen layout | Centered column, suggestion pills on empty state only |
| Ollama setup | Detect → link to docs if missing |
| Model selection | Dropdown of installed models, pull fallback |
| Chat history | Ephemeral, fresh each session |
| Opt-in | Settings toggle, off by default |

---

## Section 1: Settings & Opt-in Gate

A new **"AI Assistant"** section is added to `SettingsView`. Unlike other sections, it is **always visible** in the settings sidebar nav (discoverable from the start) but the feature itself is off by default.

The section contains:

- **Master toggle** (default off) — enables the Chat tab and floating button. Stored in electron-store.
- **Ollama connection status indicator** — polls `localhost:11434` when the toggle is turned on. Shows green (connected) or red (not detected).
- **"Ollama not detected" state** — shows a brief explanation and an "Install Ollama" button that opens the Ollama documentation URL in the system browser. The app polls in the background and updates the indicator automatically once Ollama appears.
- **Model selector** — a dropdown populated by `GET /api/tags` listing all locally installed models. If no models are installed, a "Download recommended model" button triggers a pull of `llama3.1:8b` via the Ollama API, with a progress bar while it downloads.
- **Active model display** — shows which model is currently selected. Persisted to electron-store.

The Chat tab and floating button are not rendered anywhere in the app until the master toggle is on.

---

## Section 2: Chat Tab & Navigation

A **Chat** tab is added to the main sidebar nav, positioned after the Stats tab. Uses a `MessageSquare` icon from lucide-react. The tab only renders in the nav when the AI feature is enabled in Settings.

This is an **Electron renderer-only** feature — no code is shared with the web report viewer (`dist-web/`), no web report version exists.

### Navigation changes

- `useAppNavigation.ts` — `view` union type gains `'chat'`
- `AppLayout.tsx` — renders `<ChatView />` when `view === 'chat'`, adds Chat to the sidebar nav icon list (conditionally, when AI is enabled)

### Full-screen layout

- Status bar at top: model name + number of fights loaded
- Message thread (scrollable, centered, max-width column)
- Suggestion pills (empty state only, disappear once conversation starts)
- Input row at bottom (text input + send button)

If Ollama is not connected when the Chat tab is opened, the view renders an inline "Ollama isn't connected" state with a link to Settings rather than a broken input.

---

## Section 3: Floating Panel

A floating chat button sits in the bottom-right corner of the main content area. It is rendered at the `AppLayout` level so it persists across all tabs. It is hidden when the Chat tab is the active view (redundant).

Clicking the button slides a **320px side panel** in from the right edge of the app, overlaying the current view without navigating away.

### Window auto-resize

When the panel opens, the main process checks if expanding by 320px would exceed the screen. If the window needs to grow, it calls `win.setSize(currentWidth + 320, currentHeight)`. On close, the original width is restored. This is triggered via a dedicated IPC call (`chat:set-panel-open`) so the renderer does not manage window geometry directly.

### Shared component

The panel and the Chat tab render the **same `<ChatView />` component** with a `compact` prop controlling layout differences (panel header vs. full status bar, narrower message width). Same message thread, same input — two size modes of one component.

The panel header includes: model name, fight count, an expand icon (navigates to the full Chat tab), and a close button.

Opening the panel while already on the Chat tab is a no-op.

---

## Section 4: Ollama Backend & IPC

Follows the existing EI manager pattern.

### New files

- **`src/main/ollama.ts`** — `OllamaManager` class
- **`src/main/handlers/ollamaHandlers.ts`** — IPC handlers registered in main process

### OllamaManager responsibilities

- `checkConnection()` — `GET localhost:11434/api/tags`, returns connected status + model list
- `listModels()` — returns `string[]` of installed model names
- `pullModel(model, onProgress)` — streams the Ollama pull API, calls progress callback with `{ percent, status }`
- `chat(messages, onToken)` — `POST /api/chat` with `stream: true`, calls `onToken` for each streamed token

### IPC surface (preload additions)

```
ollama:get-status        → { connected: boolean, models: string[], activeModel: string | null }
ollama:set-active-model  → void (persisted to electron-store)
ollama:pull-model        → void (streams progress via ollama:pull-progress event)
ollama:chat(messages: ChatMessage[]) → void (streams tokens via ollama:chat-token event)
ollama:get-settings      → { enabled: boolean, activeModel: string }
ollama:save-settings     → void
```

Push events (main → renderer):
```
ollama:pull-progress     → { percent: number, status: string }
ollama:chat-token        → { token: string, done: boolean }
ollama:status-changed    → { connected: boolean, models: string[], activeModel: string | null }
```

### Context building

Before sending a chat request, the **renderer** serializes the currently loaded `ILogData[]` into a compact plain-text summary (player names, key metrics, fight outcomes) and prepends it as a system message. Log data does not cross the IPC boundary — only the assembled prompt goes to main, and main forwards it to Ollama.

---

## Section 5: Testing

- **Unit tests** — `OllamaManager` methods tested with mocked `fetch` in `src/main/__tests__/ollama.test.ts`. Covers: connection check, model listing, pull progress parsing, chat token streaming.
- **Renderer tests** — `ChatView` tested with vitest + jsdom: empty state renders pills, messages render correctly, `compact` vs full-screen prop differences, Ollama-not-connected state.
- **No E2E tests** — Ollama is not available in CI. Unit coverage is sufficient.

The feature is fully gated behind the settings toggle — zero impact on existing tests when disabled.

---

## Out of Scope

- Web report integration
- Chat history persistence across sessions (ephemeral only)
- Support for non-Ollama backends (OpenAI API, etc.)
- Mobile or packaged web deployment
