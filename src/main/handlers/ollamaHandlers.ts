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

    ipcMain.handle('ollama:get-settings', () => {
        return {
            enabled: store.get('ollamaEnabled', false) as boolean,
            activeModel: store.get('ollamaActiveModel', '') as string,
        };
    });

    ipcMain.on('ollama:save-settings', (_event, settings: { enabled?: boolean; activeModel?: string }) => {
        if (settings.enabled !== undefined) store.set('ollamaEnabled', settings.enabled);
        if (settings.activeModel !== undefined) store.set('ollamaActiveModel', settings.activeModel);
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
