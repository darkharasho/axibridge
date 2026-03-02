import { ipcMain } from 'electron';
import type { DiscordNotifier } from '../discord';

export interface DiscordHandlerOptions {
    store: any;
    getDiscord: () => DiscordNotifier | null;
    pendingDiscordLogs: Map<string, { result: any; jsonDetails: any }>;
    setConsoleLogForwarding: (enabled: boolean) => void;
    getConsoleLogHistory: () => ReadonlyArray<{ type: 'info' | 'error'; message: string; timestamp: string }>;
}

export function registerDiscordHandlers(opts: DiscordHandlerOptions) {
    const {
        store,
        getDiscord,
        pendingDiscordLogs,
        setConsoleLogForwarding,
        getConsoleLogHistory,
    } = opts;

    ipcMain.on('set-discord-webhook', (_event, url: string) => {
        getDiscord()?.setWebhookUrl(url);
        store.set('discordWebhookUrl', url);
    });

    ipcMain.on('set-console-log-forwarding', (_event, enabled: boolean) => {
        setConsoleLogForwarding(Boolean(enabled));
        if (enabled) {
            _event.sender.send('console-log-history', getConsoleLogHistory());
        }
    });

    ipcMain.on('send-screenshot', async (_event, logId: string, buffer: Uint8Array) => {
        const data = pendingDiscordLogs.get(logId);
        const discord = getDiscord();
        if (data && discord) {
            await discord.sendLog({ ...data.result, imageBuffer: buffer, mode: 'image' }, data.jsonDetails);
            pendingDiscordLogs.delete(logId);
        }
    });

    ipcMain.on('send-screenshots', async (_event, logId: string, buffers: Uint8Array[]) => {
        const data = pendingDiscordLogs.get(logId);
        const discord = getDiscord();
        if (!data || !discord) return;
        const chunks: Uint8Array[][] = [];
        for (let i = 0; i < buffers.length; i += 2) {
            chunks.push(buffers.slice(i, i + 2));
        }
        for (let i = 0; i < chunks.length; i += 1) {
            const suppressContent = i > 0;
            await discord.sendLog({ ...data.result, imageBuffers: chunks[i], mode: 'image', suppressContent }, data.jsonDetails);
        }
        pendingDiscordLogs.delete(logId);
    });

    ipcMain.on('send-screenshots-groups', async (_event, logId: string, groups: Uint8Array[][]) => {
        const data = pendingDiscordLogs.get(logId);
        const discord = getDiscord();
        if (!data || !discord) return;
        for (let i = 0; i < groups.length; i += 1) {
            const suppressContent = i > 0;
            await discord.sendLog({ ...data.result, imageBuffers: groups[i], mode: 'image', suppressContent }, data.jsonDetails);
        }
        pendingDiscordLogs.delete(logId);
    });

    ipcMain.on('send-stats-screenshot', async (_event, buffer: Uint8Array) => {
        const discord = getDiscord();
        if (discord) {
            const dummyLog: any = {
                id: 'stats-dashboard',
                fightName: 'Weekly Statistics',
                encounterDuration: 'Summary',
                uploadTime: Math.floor(Date.now() / 1000),
                permalink: 'https://dps.report',
                imageBuffer: buffer,
                mode: 'image'
            };
            try {
                await discord.sendLog(dummyLog, { fightName: 'Aggregated Statistics' });
                console.log('[Main] Stats screenshot sent to Discord.');
            } catch (e) {
                console.error('[Main] Failed to send stats screenshot:', e);
            }
        }
    });
}
