import { ipcMain } from 'electron';
import type { DiscordNotifier } from '../discord';
import { applyDiscordDestinations } from '../discordDestinationResolver';

export interface DiscordHandlerOptions {
    store: any;
    getDiscord: () => DiscordNotifier | null;
    setConsoleLogForwarding: (enabled: boolean) => void;
    getConsoleLogHistory: () => ReadonlyArray<{ type: 'info' | 'error'; message: string; timestamp: string }>;
}

export function registerDiscordHandlers(opts: DiscordHandlerOptions) {
    const {
        store,
        getDiscord,
        setConsoleLogForwarding,
        getConsoleLogHistory,
    } = opts;

    ipcMain.on('set-discord-webhook', (_event, url: string) => {
        store.set('discordWebhookUrl', url);
        applyDiscordDestinations(store, getDiscord());
    });

    ipcMain.on('set-console-log-forwarding', (_event, enabled: boolean) => {
        setConsoleLogForwarding(Boolean(enabled));
        if (enabled) {
            _event.sender.send('console-log-history', getConsoleLogHistory());
        }
    });
}
