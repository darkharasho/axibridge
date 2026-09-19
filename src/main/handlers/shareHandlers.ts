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
