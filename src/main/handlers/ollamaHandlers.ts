import { ipcMain, BrowserWindow } from 'electron';
import Store from 'electron-store';
import { OllamaManager } from '../ollama';
import type { ChatMessage } from '../ollama';

interface OllamaHandlerOptions {
    store: Store;
    getWindow: () => BrowserWindow | null;
    getOllamaManager: () => OllamaManager;
}

let prePanelWidth: number | null = null;

export function registerOllamaHandlers({ store, getWindow, getOllamaManager }: OllamaHandlerOptions) {
    ipcMain.handle('ollama:get-status', async () => {
        const mgr = getOllamaManager();
        const status = await mgr.getStatus();
        const activeModel = store.get('ollamaActiveModel', null) as string | null;
        return { ...status, activeModel };
    });

    ipcMain.on('ollama:set-active-model', (_event, model: string) => {
        store.set('ollamaActiveModel', model);
    });

    ipcMain.handle('ollama:pull-model', async (_event, model: string) => {
        const mgr = getOllamaManager();
        const win = getWindow();
        try {
            await mgr.pullModel(model, (progress) => {
                win?.webContents.send('ollama:pull-progress', progress);
            });
        } catch (err: any) {
            win?.webContents.send('ollama:pull-progress', { percent: 0, status: `Error: ${err?.message ?? 'Pull failed'}` });
            throw err;
        }
    });

    ipcMain.handle('ollama:chat', async (_event, messages: ChatMessage[]) => {
        const mgr = getOllamaManager();
        const win = getWindow();
        const activeModel = (store.get('ollamaActiveModel', 'llama3.1:8b') as string);
        try {
            await mgr.chat(messages, activeModel, (token, done) => {
                win?.webContents.send('ollama:chat-token', { token, done });
            });
        } catch (err: any) {
            win?.webContents.send('ollama:chat-token', { token: '', done: true });
            throw err;
        }
    });

    ipcMain.handle('ollama:chat-once', async (_event, messages: ChatMessage[], tools?: any[]) => {
        const mgr = getOllamaManager();
        const activeModel = (store.get('ollamaActiveModel', 'llama3.1:8b') as string);
        const raw = await mgr.chatOnce(messages, tools, activeModel);
        if (!raw?.message) throw new Error('Unexpected Ollama response shape');
        return raw;
    });

    ipcMain.handle('ollama:get-settings', () => {
        return {
            enabled: store.get('ollamaEnabled', false) as boolean,
            activeModel: store.get('ollamaActiveModel', '') as string,
            autoManage: store.get('ollamaAutoManage', false) as boolean,
        };
    });

    ipcMain.on('ollama:save-settings', (_event, settings: { enabled?: boolean; activeModel?: string; autoManage?: boolean }) => {
        if (settings.enabled !== undefined) store.set('ollamaEnabled', settings.enabled);
        if (settings.activeModel !== undefined) store.set('ollamaActiveModel', settings.activeModel);
        if (settings.autoManage !== undefined) store.set('ollamaAutoManage', settings.autoManage);
    });

    ipcMain.handle('ollama:start', async () => {
        const mgr = getOllamaManager();
        const status = await mgr.start();
        const activeModel = store.get('ollamaActiveModel', null) as string | null;
        return { ...status, activeModel };
    });

    ipcMain.handle('ollama:stop', async () => {
        const mgr = getOllamaManager();
        mgr.stop();
    });

    ipcMain.handle('ai:get-settings', () => {
        return {
            provider: store.get('aiProvider', 'ollama') as string,
            anthropicApiKey: store.get('anthropicApiKey', '') as string,
            anthropicModel: store.get('anthropicModel', 'claude-sonnet-4-6') as string,
            openaiApiKey: store.get('openaiApiKey', '') as string,
            openaiModel: store.get('openaiModel', 'gpt-4o') as string,
        };
    });

    ipcMain.on('ai:save-settings', (_event, settings: {
        provider?: string;
        anthropicApiKey?: string;
        anthropicModel?: string;
        openaiApiKey?: string;
        openaiModel?: string;
    }) => {
        if (settings.provider !== undefined) store.set('aiProvider', settings.provider);
        if (settings.anthropicApiKey !== undefined) store.set('anthropicApiKey', settings.anthropicApiKey);
        if (settings.anthropicModel !== undefined) store.set('anthropicModel', settings.anthropicModel);
        if (settings.openaiApiKey !== undefined) store.set('openaiApiKey', settings.openaiApiKey);
        if (settings.openaiModel !== undefined) store.set('openaiModel', settings.openaiModel);
    });

    // Window panel resize
    ipcMain.on('chat:set-panel-open', (_event, open: boolean) => {
        const win = getWindow();
        if (!win) return;
        const [w, h] = win.getSize();
        if (open) {
            prePanelWidth = w;
            win.setSize(w + 320, h, true);
        } else if (prePanelWidth !== null) {
            win.setSize(prePanelWidth, h, true);
            prePanelWidth = null;
        }
    });
}
